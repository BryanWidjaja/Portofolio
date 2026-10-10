#!/usr/bin/env node
import { chromium } from 'playwright'
import { preview } from 'vite'

const failures = []
function check(name, pass, detail = '') {
  console.log(`[check-ambient] ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `  ${detail}`}`)
  if (!pass) failures.push(name)
}

async function main() {
  const server = await preview({ root: process.cwd(), preview: { port: 4211 } })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const address = server.httpServer.address()
    const port = address && typeof address !== 'string' ? address.port : 4211
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    const scene = page.locator('[data-landing-parallax]')
    await scene.waitFor({ state: 'attached', timeout: 1000 }).catch(() => {})
    const state = await scene.evaluate((element) => ({
      ariaHidden: element.getAttribute('aria-hidden'),
      imageCount: element.querySelectorAll('img').length,
    })).catch(() => null)
    check(
      'the landing uses one continuous decorative depth field from Work through About',
      Boolean(state && state.ariaHidden === 'true' && state.imageCount >= 4 && await page.locator('[data-ambient-scene^="home-"]').count() === 0),
      JSON.stringify(state),
    )

    const coverage = await scene.evaluate((element) => {
      const field = element.getBoundingClientRect()
      const journey = element.parentElement.getBoundingClientRect()
      return { fieldTop: field.top, fieldBottom: field.bottom, journeyTop: journey.top, journeyBottom: journey.bottom }
    })
    check(
      'the field overdraws both landing boundaries so no internal section edge can cut through the artwork',
      coverage.fieldTop < coverage.journeyTop - 100 && coverage.fieldBottom > coverage.journeyBottom + 100,
      JSON.stringify(coverage),
    )

    const plateDepths = await scene.locator('[data-parallax-plate]').evaluateAll((plates) => plates.map((plate) => ({
      position: [...plate.classList].find((name) => name.startsWith('landing-parallax__plate--')),
      depths: [...plate.querySelectorAll('[data-parallax-layer]')].map((layer) => layer.getAttribute('data-parallax-layer')),
    })))
    check(
      'every landing chapter overlaps at least two depth planes and the centre carries all three depths',
      plateDepths.every(({ depths }) => new Set(depths).size >= 2) &&
        plateDepths.some(({ position, depths }) => position?.endsWith('--middle') && new Set(depths).size === 3),
      JSON.stringify(plateDepths),
    )

    const readHeroOffsets = () => page.evaluate(() => {
      const hero = document.querySelector('[data-home-hero]')
      const image = hero?.querySelector('.hero-painting')
      const mist = [...(hero?.querySelectorAll('.hero-mist') ?? [])]
      if (!hero || !image || mist.length !== 3) return null
      const rootTop = hero.getBoundingClientRect().top
      return {
        heroHeight: hero.getBoundingClientRect().height,
        image: image.getBoundingClientRect().top - rootTop,
        mist: mist.map((layer) => layer.getBoundingClientRect().top - rootTop),
      }
    })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(120)
    const heroStart = await readHeroOffsets()
    await page.evaluate((height) => window.scrollTo(0, height - 1), heroStart?.heroHeight ?? 900)
    await page.waitForTimeout(120)
    const heroEnd = await readHeroOffsets()
    const heroImageTravel = heroStart && heroEnd ? Math.abs(heroEnd.image - heroStart.image) : 0
    const heroMistTravel = heroStart && heroEnd
      ? heroStart.mist.map((start, index) => Math.abs(heroEnd.mist[index] - start))
      : []
    check(
      'hero painting and mist planes create an obvious increasing depth hierarchy',
      heroImageTravel >= 32 &&
        heroMistTravel.length === 3 &&
        heroMistTravel[0] >= 45 &&
        heroMistTravel[1] >= 90 &&
        heroMistTravel[2] >= 150,
      JSON.stringify({ heroImageTravel, heroMistTravel }),
    )

    async function measureTravel(depth) {
      const layer = scene.locator(`[data-parallax-layer="${depth}"]`).first()
      const plate = layer.locator('xpath=..')
      const bounds = await plate.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, viewport: window.innerHeight }
      })
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, bounds.top - bounds.viewport + 8))
      await page.waitForTimeout(100)
      const start = await layer.evaluate((element) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
        return { x: matrix.m41, y: matrix.m42 }
      })
      await page.evaluate((y) => window.scrollTo(0, y), bounds.bottom - 8)
      await page.waitForTimeout(100)
      const end = await layer.evaluate((element) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
        return { x: matrix.m41, y: matrix.m42 }
      })
      return { x: Math.abs(end.x - start.x), y: Math.abs(end.y - start.y) }
    }

    const farTravel = await measureTravel('far')
    const midTravel = await measureTravel('mid')
    const nearTravel = await measureTravel('near')
    check(
      'far, middle, and near planes move at visibly distinct depth rates',
      farTravel.y >= 96 && midTravel.y > farTravel.y * 1.55 && nearTravel.y > midTravel.y * 1.45,
      `far=${farTravel.y.toFixed(1)}, mid=${midTravel.y.toFixed(1)}, near=${nearTravel.y.toFixed(1)}`,
    )
    check(
      'depth planes also separate laterally instead of sliding on one vertical rail',
      farTravel.x >= 12 && midTravel.x > farTravel.x * 1.5 && nearTravel.x > midTravel.x * 1.4,
      `far=${farTravel.x.toFixed(1)}, mid=${midTravel.x.toFixed(1)}, near=${nearTravel.x.toFixed(1)}`,
    )

    const documentWidth = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }))
    check('the continuous field creates no desktop horizontal overflow', documentWidth.width <= documentWidth.viewport + 1, JSON.stringify(documentWidth))

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(() => {
      const layer = document.querySelector('[data-landing-parallax] [data-parallax-layer="far"]')
      return layer instanceof HTMLElement && getComputedStyle(layer).transform === 'none' && getComputedStyle(layer).willChange !== 'transform'
    })
    const liveReducedBefore = await scene.locator('[data-parallax-layer="far"]').first().evaluate((element) => getComputedStyle(element).transform)
    await page.evaluate(() => window.scrollBy(0, 140))
    await page.waitForTimeout(100)
    const liveReducedAfter = await scene.locator('[data-parallax-layer="far"]').first().evaluate((element) => getComputedStyle(element).transform)
    check(
      'changing the motion preference clears existing transforms and leaves the scene static',
      liveReducedBefore === liveReducedAfter && liveReducedBefore === 'none',
      `${liveReducedBefore} -> ${liveReducedAfter}`,
    )

    const reducedPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await reducedPage.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    await reducedPage.waitForFunction(() => window.__booted === true)
    const reducedLayer = reducedPage.locator('[data-landing-parallax] [data-parallax-layer="far"]').first()
    await reducedLayer.waitFor({ state: 'attached' })
    await reducedLayer.evaluate((element) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY + 120))
    await reducedPage.waitForTimeout(100)
    const reducedBefore = await reducedLayer.evaluate((element) => ({ transform: getComputedStyle(element).transform, willChange: getComputedStyle(element).willChange, media: matchMedia('(prefers-reduced-motion: reduce)').matches, motionReady: document.documentElement.classList.contains('motion-ready') }))
    await reducedPage.evaluate(() => window.scrollBy(0, 220))
    await reducedPage.waitForTimeout(100)
    const reducedAfter = await reducedLayer.evaluate((element) => ({ transform: getComputedStyle(element).transform, willChange: getComputedStyle(element).willChange, media: matchMedia('(prefers-reduced-motion: reduce)').matches, motionReady: document.documentElement.classList.contains('motion-ready') }))
    check(
      'reduced motion keeps the landscape static while the page scrolls',
      reducedBefore.transform === reducedAfter.transform && reducedBefore.willChange !== 'transform' && reducedAfter.willChange !== 'transform',
      `${JSON.stringify(reducedBefore)} -> ${JSON.stringify(reducedAfter)}`,
    )
    await reducedPage.close()

    await page.goto(`http://localhost:${port}/projects/instatags`, { waitUntil: 'domcontentloaded' })
    check(
      'leaving Home removes the continuous landing field and its ScrollTriggers',
      await page.locator('[data-landing-parallax]').count() === 0,
      `landing fields=${await page.locator('[data-landing-parallax]').count()}`,
    )
    const projectScene = page.locator('[data-ambient-scene="project-story"]')
    await projectScene.waitFor({ state: 'attached', timeout: 1000 }).catch(() => {})
    check(
      'project story carries a decorative landscape scene outside its evidence collage',
      await projectScene.count() === 1 && await page.locator('[data-collage-hero]').count() === 1,
      `scene=${await projectScene.count()}`,
    )
    const projectBleed = await projectScene.locator('[data-ambient-layer]').evaluateAll((layers) => layers.map((layer) => {
      const rect = layer.getBoundingClientRect()
      return { left: rect.left, right: rect.right, viewport: window.innerWidth }
    }))
    check(
      'project landscape bitmaps keep both vertical edges outside the viewport',
      projectBleed.every(({ left, right, viewport }) => left <= 0 && right >= viewport),
      JSON.stringify(projectBleed),
    )

    await page.goto(`http://localhost:${port}/about`, { waitUntil: 'domcontentloaded' })
    const aboutScene = page.locator('[data-ambient-scene="about-grove"]')
    await aboutScene.waitFor({ state: 'attached', timeout: 1000 }).catch(() => {})
    check(
      'About frames the portrait with one decorative, screen-reader-hidden ink layer',
      await aboutScene.count() === 1 && await aboutScene.getAttribute('aria-hidden') === 'true' && await aboutScene.locator('img[alt=""]').count() === 1,
      `scene=${await aboutScene.count()}`,
    )
    const aboutBleed = await aboutScene.locator('[data-ambient-layer]').evaluate((layer) => {
      const rect = layer.getBoundingClientRect()
      return { left: rect.left, right: rect.right, viewport: window.innerWidth }
    })
    check(
      'About landscape keeps both vertical bitmap edges outside the viewport',
      aboutBleed.left <= 0 && aboutBleed.right >= aboutBleed.viewport,
      JSON.stringify(aboutBleed),
    )

    const footerScene = page.locator('[data-ambient-scene="footer-waterline"]')
    check(
      'the shared footer closes each route with an accessible-hidden waterline image',
      await footerScene.count() === 1 && await footerScene.locator('img[alt=""]').count() === 1,
      `scene=${await footerScene.count()}`,
    )

    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await mobilePage.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    await mobilePage.waitForFunction(() => window.__booted === true)
    const mobileScene = mobilePage.locator('[data-landing-parallax]')
    const mobileImage = mobileScene.locator('.landing-parallax__art--ridge img').first()
    await mobileImage.scrollIntoViewIfNeeded()
    await mobilePage.waitForFunction(() => document.querySelector('.landing-parallax__art--ridge')?.getAttribute('data-deferred-image-ready') === 'true')
    await mobileImage.evaluate((image) => image.decode())
    const mobileState = await mobilePage.evaluate(() => ({
      currentSrc: document.querySelector('[data-landing-parallax] .landing-parallax__art--ridge img')?.currentSrc,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      scenePointerEvents: getComputedStyle(document.querySelector('[data-landing-parallax]')).pointerEvents,
      nearDisplay: getComputedStyle(document.querySelector('[data-landing-parallax] [data-parallax-layer="near"]')).display,
    }))
    check(
      'mobile loads responsive art, removes the strongest depth plane, and stays within the viewport',
      Boolean(mobileState.currentSrc?.includes('ridge-mobile.avif') && mobileState.documentWidth <= mobileState.viewportWidth + 1 && mobileState.scenePointerEvents === 'none' && mobileState.nearDisplay === 'none'),
      JSON.stringify(mobileState),
    )
    const mobileLayers = await mobileScene.locator('[data-parallax-layer]').evaluateAll((layers) => layers.filter((layer) => getComputedStyle(layer).display !== 'none').length)
    check('mobile keeps overlapping far and middle planes for real depth', mobileLayers >= 8, `visible layers=${mobileLayers}`)
    await mobilePage.close()
  } finally {
    await browser.close()
    await new Promise((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()))
  }

  if (failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
