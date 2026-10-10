#!/usr/bin/env node
/** Render the public routes at the approved responsive viewport matrix. */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'

const allRoutes = ['/', '/about', '/projects/malware-detection', '/projects/btardew-walley', '/projects/instatags']
const allViewports = [
  [320, 568], [360, 640], [390, 844], [430, 932],
  [568, 320], [667, 375], [844, 390], [320, 800], [540, 720],
  [600, 960], [768, 1024], [1024, 768], [1024, 800], [1280, 800],
  [1366, 768], [1440, 900], [1920, 1080], [2560, 1080],
]
const target = process.argv[2]
const routes = target === 'media' || target === 'media-home' ? []
  : target === 'hero' || target === 'menu' ? ['/']
  : target === 'about' ? ['/about']
    : target === 'email' ? ['/']
    : target === 'home' ? ['/']
    : target === 'project' ? allRoutes.filter((route) => route.startsWith('/projects/'))
  : target === 'lightbox' ? ['/projects/malware-detection']
      : allRoutes
const viewports = target === 'hero'
  ? [[320, 568], [430, 932], [568, 320], [844, 390], [768, 1024], [1024, 768], [1440, 900]]
  : target === 'email' ? [[320, 568]]
  : target === 'home' ? [[600, 960], [768, 1024], [1024, 768]]
  : target === 'about' ? [[600, 960], [768, 1024], [900, 800], [1024, 768]]
  : target === 'project' ? [[768, 1024], [1024, 768]]
  : target === 'lightbox' ? [[568, 320], [667, 375], [844, 390]]
  : target === 'menu' ? [[568, 320], [667, 375], [844, 390]]
  : target === 'media' || target === 'media-home' ? []
    : allViewports
const output = path.resolve('../notes/plan/shots/responsive-matrix')
await mkdir(output, { recursive: true })
const server = await preview({ root: process.cwd(), preview: { port: 4173, strictPort: false } })
const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4173/'
const browser = await chromium.launch()
const rows = []
let failures = 0

try {
  for (const route of routes) {
    for (const [width, height] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(new URL(route, base).toString(), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts?.ready)
      const geometry = await page.evaluate(() => {
        const footer = document.querySelector('[data-footer]')
        const container = document.querySelector('.site-container')
        const heading = document.querySelector('main h1, h1')
        const hero = document.querySelector('[data-home-hero]')
        const projectJourney = document.querySelector('[data-project-journey]')
        const projectContainer = document.querySelector('.home-work-container')
        const aboutContainer = document.querySelector('.about-intro-container')
        const aboutPortrait = document.querySelector('[data-about-portrait]')
        const aboutBio = document.querySelector('[data-about-bio]')
        const aboutTimelineContainer = document.querySelector('.about-timeline-container')
        const aboutTimelineLayout = document.querySelector('[data-about-timeline-layout]')
        const aboutToolsContainer = document.querySelector('.about-tools-container')
        const aboutToolsLayout = document.querySelector('[data-about-tools-layout]')
        const aboutResumeContainer = document.querySelector('.about-resume-container')
        const aboutResumeLayout = document.querySelector('[data-about-resume-layout]')
        const footerLayout = document.querySelector('[data-footer-layout]')
        const footerContainer = document.querySelector('.footer-container')
        const projectIntro = document.querySelector('.project-intro-container')
        const projectMeta = document.querySelector('[data-project-meta]')
        const collageContainer = document.querySelector('.project-collage-container')
        const collage = document.querySelector('[data-collage]')
        const storyContainer = document.querySelector('.project-story-container')
        const storyRow = document.querySelector('[data-project-story-row]')
        const email = [...document.querySelectorAll('a,button')].find((element) => element.textContent?.includes('@'))
        const emailText = email && [...email.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('@'))
        let emailDomainLines = 0
        if (emailText?.textContent) {
          const at = emailText.textContent.indexOf('@')
          const range = document.createRange()
          range.setStart(emailText, at + 1)
          range.setEnd(emailText, emailText.textContent.length)
          emailDomainLines = new Set([...range.getClientRects()].map((item) => Math.round(item.top))).size
        }
        const rect = (element) => {
          if (!element) return null
          const { x, y, width, height, right, bottom } = element.getBoundingClientRect()
          return { x, y, width, height, right, bottom }
        }
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          viewport: { width: innerWidth, height: innerHeight },
          heading: rect(heading),
          hero: rect(hero),
          projectJourney: rect(projectJourney),
          projectContainer: projectContainer ? {
            type: getComputedStyle(projectContainer).containerType,
            name: getComputedStyle(projectContainer).containerName,
          } : null,
          projectCards: projectJourney ? [...projectJourney.querySelectorAll('[data-project-slot]')].map((card) => ({
            slot: card.getAttribute('data-project-slot'),
            ...rect(card),
          })) : [],
          aboutIntroWidth: aboutContainer ? aboutContainer.clientWidth - Number.parseFloat(getComputedStyle(aboutContainer).paddingLeft) - Number.parseFloat(getComputedStyle(aboutContainer).paddingRight) : 0,
          aboutPortrait: rect(aboutPortrait),
          aboutBio: rect(aboutBio),
          aboutTimelineContainer: aboutTimelineContainer ? { type: getComputedStyle(aboutTimelineContainer).containerType, name: getComputedStyle(aboutTimelineContainer).containerName } : null,
          aboutTimelineColumns: aboutTimelineLayout ? getComputedStyle(aboutTimelineLayout).gridTemplateColumns.split(' ').length : 0,
          aboutToolsContainer: aboutToolsContainer ? { type: getComputedStyle(aboutToolsContainer).containerType, name: getComputedStyle(aboutToolsContainer).containerName } : null,
          aboutToolsColumns: aboutToolsLayout ? getComputedStyle(aboutToolsLayout).gridTemplateColumns.split(' ').length : 0,
          aboutResumeContainer: aboutResumeContainer ? { type: getComputedStyle(aboutResumeContainer).containerType, name: getComputedStyle(aboutResumeContainer).containerName } : null,
          aboutResumeColumns: aboutResumeLayout ? getComputedStyle(aboutResumeLayout).gridTemplateColumns.split(' ').length : 0,
          footerContainer: footerContainer ? {
            type: getComputedStyle(footerContainer).containerType,
            name: getComputedStyle(footerContainer).containerName,
          } : null,
          footerColumns: footerLayout ? getComputedStyle(footerLayout).gridTemplateColumns.split(' ').length : 0,
          projectIntro: projectIntro ? {
            type: getComputedStyle(projectIntro).containerType,
            name: getComputedStyle(projectIntro).containerName,
            contentWidth: projectIntro.clientWidth - Number.parseFloat(getComputedStyle(projectIntro).paddingLeft) - Number.parseFloat(getComputedStyle(projectIntro).paddingRight),
          } : null,
          projectMetaColumns: projectMeta ? getComputedStyle(projectMeta).gridTemplateColumns.split(' ').length : 0,
          collageContainer: collageContainer ? {
            type: getComputedStyle(collageContainer).containerType,
            name: getComputedStyle(collageContainer).containerName,
          } : null,
          collageColumns: collage ? getComputedStyle(collage).gridTemplateColumns.split(' ').length : 0,
          storyContainer: storyContainer ? {
            type: getComputedStyle(storyContainer).containerType,
            name: getComputedStyle(storyContainer).containerName,
          } : null,
          storyColumns: storyRow ? getComputedStyle(storyRow).gridTemplateColumns.split(' ').length : 0,
          footer: rect(footer),
          container: rect(container),
          email: rect(email),
          emailDomainLines,
          gutter: getComputedStyle(container).paddingInlineStart,
          safeTop: getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim(),
          viewportFit: document.querySelector('meta[name="viewport"]')?.content.includes('viewport-fit=cover') ?? false,
          title: document.title,
        }
      })
      const slug = route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')
      const capture = ['/', '/about', '/projects/malware-detection'].includes(route)
        && ([320, 600, 768, 1024, 1440, 1920].includes(width) || [568, 667, 844].includes(width) && height < 400)
      const shotPath = capture ? path.join(output, `${slug}-${width}x${height}.png`) : undefined
      let deferredImages = []
      if (shotPath) {
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
        for (let scrolled = 0; scrolled < pageHeight; scrolled += height) {
          await page.mouse.wheel(0, height)
          await page.waitForTimeout(180)
        }
        await page.waitForTimeout(300)
        const images = await page.$$('[data-deferred-image-ready="true"] img')
        for (const image of images) await image.evaluate((element) => element.decode().catch(() => {}))
        deferredImages = await page.locator('[data-deferred-image-ready="true"] img').evaluateAll((images) => images.map((image) => ({
          currentSrc: image.currentSrc,
          loaded: image.complete && image.naturalWidth > 1,
          dimensions: [image.naturalWidth, image.naturalHeight],
        })))
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(100)
        await page.screenshot({ path: shotPath, fullPage: true })
      }
      let menu = null
      let lightbox = null
      if (route === '/' && height < 400) {
        await page.evaluate(() => document.querySelector('[data-menu-button]')?.click())
        await page.waitForTimeout(100)
        menu = await page.evaluate(() => {
          const overlay = document.querySelector('[data-menu-overlay]')
          const region = overlay?.querySelector('[data-menu-scroll-region]')
          const links = overlay?.querySelectorAll('[data-menu-link]')
          const lastLink = links?.item(links.length - 1)
          if (!(region instanceof HTMLElement) || !(lastLink instanceof HTMLElement)) return { scrollRegion: false, lastLinkReachable: false }
          region.scrollTop = region.scrollHeight
          const regionRect = region.getBoundingClientRect()
          const lastRect = lastLink.getBoundingClientRect()
          return {
            scrollRegion: region.dataset.menuScrollRegion !== undefined,
            overflowSupportsScroll: ['auto', 'scroll'].includes(getComputedStyle(region).overflowY),
            scrollable: region.scrollHeight > region.clientHeight,
            lastLinkReachable: lastRect.top >= regionRect.top && lastRect.bottom <= regionRect.bottom,
            scrollHeight: region.scrollHeight,
            clientHeight: region.clientHeight,
          }
        })
      }
      if (target === 'lightbox' && route === '/projects/malware-detection') {
        await page.evaluate(() => document.querySelector('[data-collage-trigger]')?.click())
        await page.waitForSelector('[data-lightbox]')
        const measureLightbox = () => page.evaluate(() => {
          const root = document.querySelector('[data-lightbox]')
          const names = ['[aria-label="Close"]', '[aria-label="Previous photo"]', '[aria-label="Next photo"]', '[data-lightbox-counter]', 'figcaption', '[data-lightbox-thumbnails] button[aria-current="true"]']
          const controls = names.map((selector) => {
            const element = root?.querySelector(selector)
            if (!element) return { selector, missing: true }
            const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
            return { selector, left, right, top, bottom, width, height, reachable: left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight }
          })
          return { controls, stageHeight: root?.querySelector('figure')?.getBoundingClientRect().height ?? 0 }
        })
        const full = await measureLightbox()
        await page.setViewportSize({ width, height: Math.max(240, height - 40) })
        await page.waitForTimeout(100)
        const contracted = await measureLightbox()
        await page.setViewportSize({ width, height })
        lightbox = { full, contracted }
        await page.evaluate(() => document.querySelector('[data-lightbox] [aria-label="Close"]')?.click())
      }
      const failedImages = deferredImages.filter((image) => !image.loaded)
      const row = { route, width, height, ...geometry, menu, deferredImages, errors, screenshot: shotPath ? path.relative(process.cwd(), shotPath) : undefined }
      rows.push(row)
      const expectedGutter = width < 360 ? 20 : width < 430 ? 24 : width < 640 ? 32 : width < 768 ? 48 : width < 1024 ? 64 : width < 1280 ? 96 : width < 1536 ? 112 : 128
      const gutter = Number.parseFloat(geometry.gutter)
      const failedMenu = menu && (!menu.scrollRegion || !menu.overflowSupportsScroll || !menu.lastLinkReachable)
      const failedHero = route === '/' && height < 400 && geometry.heading && (geometry.heading.top < 0 || geometry.heading.bottom > height)
      const failedEmail = route === '/' && width === 320 && geometry.emailDomainLines !== 1
      const failedAbout = route === '/about' && width >= 600 && width <= 1024 && (
        geometry.aboutIntroWidth === 0 || !geometry.aboutPortrait || !geometry.aboutBio ||
        (geometry.aboutIntroWidth < 816 && geometry.aboutBio.y < geometry.aboutPortrait.bottom - 2) ||
        (geometry.aboutIntroWidth >= 816 && geometry.aboutBio.x <= geometry.aboutPortrait.right) ||
        geometry.aboutTimelineContainer?.type !== 'inline-size' || geometry.aboutTimelineContainer.name !== 'about-timeline' ||
        geometry.aboutToolsContainer?.type !== 'inline-size' || geometry.aboutToolsContainer.name !== 'about-tools' ||
        geometry.aboutResumeContainer?.type !== 'inline-size' || geometry.aboutResumeContainer.name !== 'about-resume' ||
        geometry.aboutTimelineColumns !== (geometry.aboutIntroWidth < 816 ? 1 : 12) ||
        geometry.aboutToolsColumns !== (geometry.aboutIntroWidth < 816 ? 1 : 12) ||
        geometry.aboutResumeColumns !== (geometry.aboutIntroWidth < 816 ? 1 : 12)
      )
      const failedProject = route.startsWith('/projects/') && (width === 768 || width === 1024) && (
        geometry.projectIntro?.type !== 'inline-size' || geometry.projectIntro.name !== 'project-intro' ||
        geometry.projectMetaColumns !== (width === 768 ? 2 : 12) ||
        geometry.collageContainer?.type !== 'inline-size' || geometry.collageContainer.name !== 'project-media' ||
        geometry.collageColumns !== (width === 768 ? 2 : 3) ||
        geometry.storyContainer?.type !== 'inline-size' || geometry.storyContainer.name !== 'project-story' ||
        geometry.storyColumns !== (width === 768 ? 1 : 2)
      )
      const lightboxRows = lightbox ? [...lightbox.full.controls, ...lightbox.contracted.controls] : []
      const failedLightbox = lightbox && (lightboxRows.some((control) => control.missing || !control.reachable || control.height < 1) || lightbox.full.controls.find((control) => control.selector === '[aria-label="Close"]')?.height < 44 || lightbox.contracted.controls.find((control) => control.selector === '[aria-label="Close"]')?.height < 44 || lightbox.full.stageHeight < 100 || lightbox.contracted.stageHeight < 60)
      const lead = geometry.projectCards.find((card) => card.slot === 'lead')
      const failedComposition = route === '/' && (
        geometry.projectContainer?.type !== 'inline-size' || geometry.projectContainer.name !== 'home-work' ||
        geometry.footerContainer?.type !== 'inline-size' || geometry.footerContainer.name !== 'footer' ||
        (width === 768 && (geometry.footerColumns !== 2 || !lead || lead.width < geometry.projectJourney.width * 0.95 || geometry.projectCards.length !== 3)) ||
        (width === 1024 && geometry.footerColumns !== 12)
      )
      const failed = geometry.scrollWidth > geometry.clientWidth || errors.length || failedImages.length || gutter !== expectedGutter || !geometry.viewportFit || !geometry.safeTop || failedMenu || failedHero || failedEmail || failedAbout || failedProject || failedComposition || failedLightbox
      if (failed) {
        failures++
        console.error(`[responsive] ${route} ${width}x${height}: overflow=${geometry.scrollWidth - geometry.clientWidth}px gutter=${gutter}px expected=${expectedGutter}px safe=${Boolean(geometry.safeTop)} viewportFit=${geometry.viewportFit} heroFit=${failedHero ? JSON.stringify(geometry.heading) : true} emailDomainLines=${geometry.emailDomainLines} aboutFit=${failedAbout ? JSON.stringify({ width: geometry.aboutIntroWidth, portrait: geometry.aboutPortrait, bio: geometry.aboutBio, timeline: [geometry.aboutTimelineContainer, geometry.aboutTimelineColumns], tools: [geometry.aboutToolsContainer, geometry.aboutToolsColumns], resume: [geometry.aboutResumeContainer, geometry.aboutResumeColumns] }) : true} projectFit=${failedProject ? JSON.stringify({ intro: geometry.projectIntro, meta: geometry.projectMetaColumns, collageContainer: geometry.collageContainer, collage: geometry.collageColumns, storyContainer: geometry.storyContainer, story: geometry.storyColumns }) : true} lightbox=${failedLightbox ? JSON.stringify(lightbox) : true} composition=${failedComposition ? JSON.stringify({ projectContainer: geometry.projectContainer, lead, journey: geometry.projectJourney, footer: geometry.footerContainer, footerColumns: geometry.footerColumns }) : true} menu=${menu ? JSON.stringify(menu) : '-'} imagesFailed=${failedImages.length} errors=${errors.length}`)
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}

if (target === 'hero') {
  const resizeServer = await preview({ root: process.cwd(), preview: { port: 4174, strictPort: false } })
  const resizeBase = resizeServer.resolvedUrls?.local?.[0] ?? 'http://localhost:4174/'
  const resizeBrowser = await chromium.launch()
  try {
    const context = await resizeBrowser.newContext({ viewport: { width: 568, height: 320 }, reducedMotion: 'no-preference' })
    const page = await context.newPage()
    await page.goto(resizeBase, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__booted === true)
    await page.waitForTimeout(150)
    const count = () => page.evaluate(() => window.__stRafDebug?.().triggers.filter((trigger) => trigger.landingParallax).length ?? -1)
    const compactBefore = await count()
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(250)
    const wideCount = await count()
    await page.setViewportSize({ width: 568, height: 320 })
    await page.waitForTimeout(250)
    const compactAfter = await count()
    if (compactBefore !== compactAfter || compactBefore !== 5 || wideCount !== 5) {
      failures++
      console.error(`[responsive] GSAP resize cleanup: compact triggers ${compactBefore} -> ${compactAfter}, wide=${wideCount}`)
    } else {
      console.log(`[responsive] GSAP resize cleanup: compact triggers ${compactBefore} -> ${compactAfter}, wide=${wideCount}`)
    }
    await context.close()
  } finally {
    await resizeBrowser.close()
    await resizeServer.close()
  }
}

if (target === 'media' || target === 'media-home') {
  const mediaServer = await preview({ root: process.cwd(), preview: { port: 4175, strictPort: false } })
  const mediaBase = mediaServer.resolvedUrls?.local?.[0] ?? 'http://localhost:4175/'
  const mediaBrowser = await chromium.launch()
  const allMediaCases = [
    ...[[320, 568], [600, 960], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]].map(([width, height]) => ({ route: '/', selector: '[data-home-hero] img', width, height })),
    ...[[320, 568], [600, 960], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]].map(([width, height]) => ({ route: '/projects/malware-detection', selector: '[data-collage-hero] img', width, height })),
    ...[[320, 568], [600, 960], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]].map(([width, height]) => ({ route: '/', selector: 'li[data-project-slot="lead"] img.brush-colour', width, height })),
    ...[[600, 960], [768, 1024], [1024, 768]].map(([width, height]) => ({ route: '/about', selector: '[data-about-portrait] img[alt="Bryan Widjaja"]', width, height })),
  ]
  const cases = target === 'media-home' ? allMediaCases.filter((testCase) => testCase.route === '/') : allMediaCases
  try {
    for (const testCase of cases) {
      for (const dpr of [1, 2, 3]) {
        const context = await mediaBrowser.newContext({ viewport: { width: testCase.width, height: testCase.height }, deviceScaleFactor: dpr })
        const page = await context.newPage()
        await page.goto(new URL(testCase.route, mediaBase).toString(), { waitUntil: 'load' })
        await page.waitForFunction(() => window.__booted === true)
        const locator = page.locator(testCase.selector)
        if (testCase.selector.includes('data-project-slot')) {
          const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
          for (let scrolled = 0; scrolled < pageHeight; scrolled += testCase.height) {
            await page.mouse.wheel(0, testCase.height)
            await page.waitForTimeout(180)
          }
          const ready = await page.waitForFunction((selector) => document.querySelector(selector)?.closest('picture')?.dataset.deferredImageReady === 'true', testCase.selector, { timeout: 5000 }).then(() => true).catch(() => false)
          if (!ready) {
            console.error('[responsive] deferred source did not activate', await locator.evaluateAll((images) => images.map((image) => ({ src: image.src, ready: image.closest('picture')?.dataset.deferredImageReady, attrs: [...image.attributes].map((attribute) => attribute.name) }))))
            failures++
            await context.close()
            continue
          }
        }
        const selection = await locator.evaluate(async (image) => {
          await image.decode()
          const rect = image.getBoundingClientRect()
          const picture = image.closest('picture')
          const activeSource = [...(picture?.querySelectorAll('source') ?? [])].find((source) => !source.media || matchMedia(source.media).matches)
          const srcset = activeSource?.srcset || image.srcset
          const candidates = [...srcset.matchAll(/(?:^|,\s*)(\S+)\s+(\d+)w/g)].map((match) => ({ url: new URL(match[1], location.href).pathname, width: Number(match[2]) })).sort((a, b) => a.width - b.width)
          const selected = candidates.find((candidate) => candidate.url === new URL(image.currentSrc, location.href).pathname)
          return { currentSrc: image.currentSrc, naturalWidth: image.naturalWidth, slotWidth: rect.width, candidates: candidates.map((candidate) => candidate.width), candidateWidth: selected?.width ?? image.naturalWidth }
        })
        const desired = selection.slotWidth * dpr
        const ratio = selection.candidateWidth / desired
        const minimum = selection.candidates.find((candidate) => candidate >= desired) ?? Math.max(...selection.candidates, selection.naturalWidth)
        const row = { ...testCase, dpr, ...selection, desired, ratio, minimum }
        rows.push(row)
        if (!selection.slotWidth || selection.candidateWidth !== minimum) {
          failures++
          console.error(`[responsive] image candidate ${testCase.route} ${testCase.width}px @${dpr}x: slot=${selection.slotWidth.toFixed(1)}px desired=${desired.toFixed(1)}px selected=${selection.candidateWidth}px src=${selection.currentSrc}`)
        }
        await context.close()
      }
    }
  } finally {
    await mediaBrowser.close()
    await mediaServer.close()
  }
}

await writeFile(path.join(output, 'geometry.json'), `${JSON.stringify(rows, null, 2)}\n`)
console.log(`[responsive] rendered ${rows.length} route/viewport combinations to ${path.relative(process.cwd(), output)}`)
if (failures) process.exitCode = 1
