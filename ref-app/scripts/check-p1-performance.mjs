#!/usr/bin/env node
import { chromium } from 'playwright'
import { preview } from 'vite'

const failures = []
function check(name, pass, detail = '') {
  console.log(`[check-p1] ${pass ? 'PASS' : 'FAIL'}  ${name}${pass || !detail ? '' : `  ${detail}`}`)
  if (!pass) failures.push(name)
}

async function main() {
  const server = await preview({ root: process.cwd(), preview: { port: 4223 } })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
    const initialPageImages = []
    page.on('request', (request) => {
      if (/\/(?:projects|ambient\/v1)\//.test(new URL(request.url()).pathname)) initialPageImages.push(new URL(request.url()).pathname)
    })
    const address = server.httpServer.address()
    const port = address && typeof address !== 'string' ? address.port : 4223
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(300)
    const coldLoad = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource')
      const images = entries.filter((entry) => /\.(?:avif|webp|png|jpe?g)(?:\?|$)/i.test(entry.name))
      return {
        transferBytes: entries.reduce((total, entry) => total + (entry.transferSize || 0), 0),
        imageTransferBytes: images.reduce((total, entry) => total + (entry.transferSize || 0), 0),
        imageRequests: images.map((entry) => ({ src: new URL(entry.name).pathname, bytes: entry.transferSize || 0, startMs: Math.round(entry.startTime) })),
      }
    })
    console.log(`[check-p1] METRIC  390px cold page after network idle: ${coldLoad.transferBytes} B total / ${coldLoad.imageTransferBytes} B images across ${coldLoad.imageRequests.length} requests`)
    console.log(`[check-p1] METRIC  images: ${coldLoad.imageRequests.map(({ src, bytes, startMs }) => `${src} (${bytes} B @ ${startMs}ms)`).join(', ')}`)
    check(
      'Home project and ambient art do not start requests during the initial hero view',
      initialPageImages.length === 0,
      JSON.stringify(initialPageImages),
    )
    check(
      'the mobile initial image transfer stays within the 120 KiB budget',
      coldLoad.imageTransferBytes <= 120 * 1024,
      `${coldLoad.imageTransferBytes} B`,
    )
    const grey = page.locator('.brush-grey').first()
    const firstCardTop = await grey.evaluate((image) => image.getBoundingClientRect().top + window.scrollY)
    const targetScroll = await page.evaluate((top) => Math.max(0, top - innerHeight - 100), firstCardTop)
    await page.evaluate((top) => window.scrollTo(0, top), targetScroll)
    await page.waitForTimeout(500)
    const activationDebug = await grey.evaluate((image) => ({
      cardTop: image.getBoundingClientRect().top,
      scrollY: window.scrollY,
      viewport: window.innerHeight,
      ready: image.closest('picture')?.getAttribute('data-deferred-image-ready'),
    }))
    console.log(`[check-p1] METRIC  first-card activation target=${targetScroll}: ${JSON.stringify(activationDebug)}`)
    await page.waitForFunction(() => document.querySelector('.brush-grey')?.closest('picture')?.getAttribute('data-deferred-image-ready') === 'true')
    const prefetchPosition = await grey.evaluate((image) => ({ top: image.getBoundingClientRect().top, viewport: innerHeight }))
    check(
      'the first Home card activates near the viewport before entering it',
      prefetchPosition.top >= prefetchPosition.viewport && prefetchPosition.top <= prefetchPosition.viewport + 220,
      JSON.stringify(prefetchPosition),
    )
    await grey.evaluate((image) => image.decode())
    const responsive = await grey.evaluate((image) => ({
      currentSrc: image.currentSrc,
      srcSet: image.getAttribute('srcset'),
      sourceSrcSet: image.closest('picture')?.querySelector('source[type="image/avif"]')?.getAttribute('srcset') ?? null,
      width: image.naturalWidth,
      displayWidth: image.getBoundingClientRect().width,
    }))
    check(
      'mobile gray project artwork uses responsive AVIF/WebP families and a right-sized candidate',
      Boolean(
        responsive.srcSet?.includes('-320-grey.webp 320w') &&
        responsive.sourceSrcSet?.includes('-320-grey.avif 320w') &&
        /-(?:320|640)-grey\.(?:avif|webp)$/.test(responsive.currentSrc) &&
        responsive.width <= 640,
      ),
      JSON.stringify(responsive),
    )
    const cardPriorities = await page.locator('#work [data-brush] img').evaluateAll((images) => images.map((image) => ({
      loading: image.getAttribute('loading'),
      fetchPriority: image.getAttribute('fetchpriority'),
    })))
    check(
      'below-fold Home project artwork stays lazy and has no high fetch priority',
      cardPriorities.length > 0 && cardPriorities.every(({ loading, fetchPriority }) => loading === 'lazy' && fetchPriority === 'low'),
      JSON.stringify(cardPriorities),
    )
    const ambientPriorities = await page.locator('[data-ambient-scene] img').evaluateAll((images) => images.map((image) => ({
      loading: image.getAttribute('loading'),
      fetchPriority: image.getAttribute('fetchpriority'),
    })))
    check(
      'ambient landscape images keep native lazy loading and use low fetch priority',
      ambientPriorities.length > 0 && ambientPriorities.every(({ loading, fetchPriority }) => loading === 'lazy' && fetchPriority === 'low'),
      JSON.stringify(ambientPriorities),
    )

    const noScriptContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
    const noScriptPage = await noScriptContext.newPage()
    await noScriptPage.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    const noScriptCards = await noScriptPage.locator('#work .brush-noscript').count()
    check(
      'project-card artwork remains available when JavaScript is disabled',
      noScriptCards === 3,
      `fallback images=${noScriptCards}`,
    )
    await noScriptContext.close()

    const mistRequests = []
    const mistPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    mistPage.on('request', (request) => {
      if (/\/ink\/mist-[123]\.webp(?:\?|$)/.test(request.url())) mistRequests.push(request.url())
    })
    await mistPage.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    check(
      'hero mist images are absent from the initial critical request window',
      mistRequests.length === 0,
      JSON.stringify(mistRequests),
    )
    await mistPage.waitForFunction(
      () => document.querySelectorAll('.hero-mist[data-mist-ready="true"]').length === 3,
      { timeout: 7000 },
    )
    await mistPage.waitForTimeout(500)
    const mistState = await mistPage.locator('.hero-mist').evaluateAll((layers) => layers.map((layer) => ({
      opacity: getComputedStyle(layer).opacity,
      transition: getComputedStyle(layer).transitionDuration,
      background: getComputedStyle(layer).backgroundImage,
    })))
    check(
      'mist appears only after its images decode and fades in without a pop',
      mistRequests.length === 3 && mistState.every(({ opacity, transition, background }) => opacity === '0.6' && transition.split(',').some((duration) => parseFloat(duration) >= 0.4) && background !== 'none'),
      JSON.stringify({ mistRequests, mistState }),
    )
    await mistPage.close()

    const reducedMistRequests = []
    const reducedMistPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    reducedMistPage.on('request', (request) => {
      if (/\/ink\/mist-[123]\.webp(?:\?|$)/.test(request.url())) reducedMistRequests.push(request.url())
    })
    await reducedMistPage.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    await reducedMistPage.waitForFunction(() => window.__booted === true)
    const reducedLayerCount = await reducedMistPage.locator('.hero-mist').count()
    check(
      'reduced motion keeps hero mist static and never requests its images',
      reducedLayerCount === 0 && reducedMistRequests.length === 0,
      JSON.stringify({ layers: reducedLayerCount, reducedMistRequests }),
    )
    await reducedMistPage.close()

    const parchmentRequests = []
    const parchmentPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    parchmentPage.on('request', (request) => {
      if (/\/ink\/scroll-aged\.webp(?:\?|$)/.test(request.url())) parchmentRequests.push(request.url())
    })
    await parchmentPage.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' })
    check(
      'aged scroll parchment is absent before the work section approaches',
      parchmentRequests.length === 0,
      JSON.stringify(parchmentRequests),
    )
    await parchmentPage.waitForFunction(() => window.__booted === true)
    await parchmentPage.waitForTimeout(100)
    await parchmentPage.locator('#work').evaluate((section) => section.scrollIntoView({ block: 'start' }))
    await parchmentPage.waitForFunction(() => document.querySelector('#work')?.getAttribute('data-aged-paper') === 'true', { timeout: 2000 }).catch(() => {})
    check(
      'aged scroll parchment loads when the work section enters view',
      parchmentRequests.length === 1 && await parchmentPage.locator('#work').getAttribute('data-aged-paper') === 'true',
      JSON.stringify({ requests: parchmentRequests, marker: await parchmentPage.locator('#work').getAttribute('data-aged-paper') }),
    )
    await parchmentPage.close()
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
