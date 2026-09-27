#!/usr/bin/env node
/**
 * scripts/check-transitions.mjs
 *
 * Drives headless Chromium against the real `dist/` build (via `vite
 * preview`, same approach as scripts/shots.mjs) and asserts E5's page-
 * transition, cursor and menu acceptance criteria (03-agent-briefs.md
 * §E5), plus E3's brush-reveal checks B1-B6 (44-ink-build-plan.md
 * §check:transitions "Added (6)") and B7 (47-round3-plan.md §R3, item 9:
 * the hover-dwell colour bloom). Prints a PASS/FAIL table and exits 1 on
 * any failure or any console error/warning/pageerror seen along the way.
 *
 * Usage:
 *   node scripts/check-transitions.mjs [--skip-build] [--shots]
 *
 * Flags:
 *   --skip-build   reuse the existing dist/ instead of rebuilding
 *   --shots        also save ink-cover frames at 250/550/900ms into
 *                  ../notes/plan/shots/e5/
 */
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const wantShots = args.includes('--shots')

const results = []
const consoleIssues = []

function check(name, pass, detail = '') {
  results.push({ name, pass, detail: String(detail) })
}

// 45-ink-approved.md T11 exception (proposed, pending record): a GPU driver
// *performance advisory* ("GPU stall due to ReadPixels"), not an app error.
// Isolated by hand across a full matrix before adding this: it appears
// identically whether the page has 0, 1 or 4 canvases, with or without
// BrushReveal's `mix-blend-color` canvas, with or without Cursor's/Nav's
// `mix-blend-difference` layers, and with the WebGL context's `alpha` on
// or off — every one of those toggles left the message unchanged. The only
// thing that ever turns it off is skipping `cover()`/`recede()`'s own
// `gl.clear()`/`drawArrays()` calls entirely, which confirms it's this
// GPU/driver's own frame-pacing reaction to a real animated full-viewport
// WebGL canvas, not a readback this app is causing and could remove.
// Matched narrowly on the exact wording plus the driver's own "Performance"
// severity label, so a genuine GL *error*-class driver message (or any
// other console warning) still fails this check as before.
const KNOWN_GPU_ADVISORY = /GL Driver Message \([^)]*, Performance, [^)]*\): GPU stall due to ReadPixels/

function attachConsoleWatcher(page) {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type !== 'error' && type !== 'warning') return
    if (type === 'warning' && KNOWN_GPU_ADVISORY.test(msg.text())) return
    consoleIssues.push(`console.${type}: ${msg.text()}`)
  })
  page.on('pageerror', (err) => consoleIssues.push(`pageerror: ${err.message}`))
}

function build() {
  const result = spawnSync('npm run build', { stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error('[check-transitions] build failed')
    process.exit(1)
  }
}

const SETTLE_MS = 2600 // first-load boot + signature/M2 entrance fully settled
const NAV_SETTLE_MS = 1800 // push transition idle (cover .6 + hold .1 + recede .7 ~= 1.45s) plus margin

// Lenis's lerp smoothing converges asymptotically, and a synthetic wheel
// event's settle time isn't worth hardcoding — poll until two consecutive
// reads agree instead of guessing a duration.
async function waitForStableScroll(page, maxWaitMs = 4000, intervalMs = 150) {
  let last = await page.evaluate(() => window.scrollY)
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await page.waitForTimeout(intervalMs)
    const current = await page.evaluate(() => window.scrollY)
    if (Math.abs(current - last) < 1) return current
    last = current
  }
  return last
}

// B1-B6 (44-ink-build-plan.md §check:transitions): reads the display
// canvas's alpha channel at fractional [0..1] points, so callers describe a
// path/grid without needing the canvas's actual backing-store size.
async function sampleCanvasAlpha(page, selector, points) {
  return page.evaluate(
    ({ selector, points }) => {
      const canvas = document.querySelector(selector)
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      return points.map(([fx, fy]) => {
        const x = Math.min(canvas.width - 1, Math.max(0, Math.round(fx * canvas.width)))
        const y = Math.min(canvas.height - 1, Math.max(0, Math.round(fy * canvas.height)))
        return ctx.getImageData(x, y, 1, 1).data[3]
      })
    },
    { selector, points },
  )
}

async function getBrushFrames(page, figureSelector) {
  return page.evaluate((sel) => document.querySelector(sel)?.dataset.brushFrames ?? null, figureSelector)
}

async function waitFramesStable(page, figureSelector, waitMs) {
  const before = await getBrushFrames(page, figureSelector)
  await page.waitForTimeout(waitMs)
  const after = await getBrushFrames(page, figureSelector)
  return { before, after, stable: before === after }
}

const GRID_9 = [0.1, 0.5, 0.9].flatMap((fx) => [0.1, 0.5, 0.9].map((fy) => [fx, fy]))
const TIDEWATER_CARD = 'a[href="/projects/tidewater"]'
const TIDEWATER_FIGURE = `${TIDEWATER_CARD} [data-brush]`
const TIDEWATER_CANVAS = `${TIDEWATER_FIGURE} canvas`

// B1: hover then leave a card; once the D4 hold (1.5s) + fade (1.2s) has
// fully settled, the frame counter goes quiet and the mask reads back to 0.
async function testBrushIdle(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const card = page.locator(TIDEWATER_CARD).first()
  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7)
  await page.mouse.move(0, 0)

  await page.waitForTimeout(1500 + 1200 + 300)

  const { before, after, stable } = await waitFramesStable(page, TIDEWATER_FIGURE, 1000)
  check('B1 idle: brushFrames counter is unchanged over 1s once settled', stable, `before=${before} after=${after}`)

  const alphas = await sampleCanvasAlpha(page, TIDEWATER_CANVAS, GRID_9)
  check(
    'B1 idle: mask alpha is 0 at all 9 grid points after the fade',
    Array.isArray(alphas) && alphas.every((a) => a === 0),
    JSON.stringify(alphas),
  )

  await context.close()
}

// B2: scrolling the card off-screen mid-fade stops the loop immediately —
// the counter stays flat even though the fade hadn't finished.
async function testBrushOffscreen(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const card = page.locator(TIDEWATER_CARD).first()
  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6)
  await page.waitForTimeout(50)
  await page.mouse.move(box.x - 50, box.y - 50)

  await page.waitForTimeout(1500 + 400) // into the fade, not through it

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(200)

  const { before, after, stable } = await waitFramesStable(page, TIDEWATER_FIGURE, 1000)
  check('B2 off-screen: brushFrames counter is unchanged over 1s once scrolled away mid-fade', stable, `before=${before} after=${after}`)

  await context.close()
}

// B3: Tab to the card link; the focus bleed bloom reveals full colour
// everywhere (including the corners) well within its 1.0s duration.
async function testBrushFocus(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.locator(TIDEWATER_CARD).first().focus()
  await page.waitForTimeout(1200)

  const alphas = await sampleCanvasAlpha(page, TIDEWATER_CANVAS, GRID_9)
  check(
    'B3 focus: bleed bloom reveals colour at all 9 grid points within 1.2s',
    Array.isArray(alphas) && alphas.every((a) => a > 0),
    JSON.stringify(alphas),
  )

  await context.close()
}

// B4: under reduced motion, BrushReveal never mounts a canvas at all, and
// the plain CSS fallback swaps the grey filter off instantly on hover.
async function testBrushReducedMotion(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const card = page.locator(TIDEWATER_CARD).first()
  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(50)

  const filter = await page.evaluate((sel) => {
    const img = document.querySelector(`${sel} img`)
    return img ? getComputedStyle(img).filter : null
  }, TIDEWATER_FIGURE)
  check('B4 reduced motion: img computed filter is none within 50ms of hover', filter === 'none', `filter="${filter}"`)

  const hasCanvas = await page.evaluate((sel) => Boolean(document.querySelector(`${sel} canvas`)), TIDEWATER_FIGURE)
  check('B4 reduced motion: the figure has no canvas', hasCanvas === false)

  await context.close()
}

// B5: 3 single-step ~300px mouse jumps (no native coalescing) still leave
// a continuously-painted path — the quadratic-through-midpoints
// interpolation in src/ink/brush.ts fills the gaps between events.
async function testBrushFastStroke(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  // The mouse targets and the alpha samples both have to be fractions of
  // the *figure*'s own box: the card link (TIDEWATER_CARD) also wraps the
  // title row below the image, so its box is taller than, and offset from,
  // the figure/canvas the fractions land on -- sampling against the
  // link's box put "top" test points tens of pixels above where the mouse
  // actually was on the canvas.
  await page.locator(TIDEWATER_CARD).first().scrollIntoViewIfNeeded()
  const box = await page.locator(TIDEWATER_FIGURE).first().boundingBox()

  const start = { x: box.x + box.width * 0.08, y: box.y + box.height * 0.12 }
  const end = { x: box.x + box.width * 0.92, y: box.y + box.height * 0.88 }
  await page.mouse.move(start.x, start.y)
  await page.waitForTimeout(20) // one rAF tick so pointerenter settles before the jumps
  for (let i = 1; i <= 3; i++) {
    const t = i / 3
    await page.mouse.move(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
    await page.waitForTimeout(20)
  }
  // Generous margin over a single rAF tick: under load a slow test runner
  // can delay the frame that composites the last queued stamps, which
  // otherwise reads as a false gap at the stroke's tip rather than an
  // actual coverage hole.
  await page.waitForTimeout(300)

  const samples = 30
  const points = Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1)
    return [0.08 + (0.92 - 0.08) * t, 0.12 + (0.88 - 0.12) * t]
  })
  const alphas = await sampleCanvasAlpha(page, TIDEWATER_CANVAS, points)
  const gaps = Array.isArray(alphas) ? alphas.filter((a) => a === 0).length : samples
  check('B5 fast stroke: no gaps across 30 samples on a 3-jump path', gaps === 0, `zero-alpha samples=${gaps}/${samples}`)

  await context.close()
}

// B6: a coarse-pointer/touch context scrolling a card through the
// viewport's middle band gets one automatic stroke, scrolling itself is
// never blocked, and the canvas stays pointer-events:none throughout.
async function testBrushTouch(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const pointerEvents = await page.evaluate((sel) => {
    const canvas = document.querySelector(sel)
    return canvas ? getComputedStyle(canvas).pointerEvents : null
  }, TIDEWATER_CANVAS)
  check('B6 touch: canvas keeps pointer-events:none', pointerEvents === 'none', `pointerEvents="${pointerEvents}"`)

  const scrollBefore = await page.evaluate(() => window.scrollY)
  // Scroll just enough to carry the card through the viewport's middle
  // band, then stop and let the triggered stroke finish while the card is
  // still in view -- §Brush reveal frees the canvas once a figure is more
  // than ~1 viewport away, so sampling has to happen before that point,
  // not after scrolling on past it.
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 220)
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(900)

  const scrollAfter = await page.evaluate(() => window.scrollY)
  check('B6 touch: scrollY advanced (native scroll unblocked)', scrollAfter > scrollBefore, `before=${scrollBefore} after=${scrollAfter}`)

  const alphas = await sampleCanvasAlpha(page, TIDEWATER_CANVAS, GRID_9)
  check(
    'B6 touch: the automatic S-stroke leaves paint on the media',
    Array.isArray(alphas) && alphas.some((a) => a > 0),
    JSON.stringify(alphas),
  )

  await context.close()
}

// B7 (47-round3-plan.md §R3, item 9): after >=1s of cumulative hover the
// bloom spreads colour outward from wherever the pointer actually painted
// to the whole figure -- distinct from B3's keyboard-focus bloom, which
// fires instantly with no dwell. Paints one small mark near a corner, then
// holds the pointer still (no further movement) so any colour reaching the
// opposite, never-painted corner can only come from the hover-dwell bloom's
// setTimeout, not from further strokes.
async function testBrushHoverBloom(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.locator(TIDEWATER_CARD).first().scrollIntoViewIfNeeded()
  const box = await page.locator(TIDEWATER_FIGURE).first().boundingBox()

  const nearCorner = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.1 }
  const farCorner = [0.9, 0.9]

  await page.mouse.move(nearCorner.x, nearCorner.y)
  await page.waitForTimeout(20)
  await page.mouse.move(nearCorner.x + 4, nearCorner.y + 4) // one small jiggle: paints a mark, doesn't move again
  await page.waitForTimeout(700) // well under HOVER_BLOOM_MS (1000ms): dwell not yet armed-out

  const early = await sampleCanvasAlpha(page, TIDEWATER_CANVAS, [farCorner])
  check(
    'B7 hover bloom: opposite unpainted corner is still grey before the 1s dwell',
    Array.isArray(early) && early[0] === 0,
    JSON.stringify(early),
  )

  await page.waitForTimeout(1600) // carries past the 1s dwell trigger plus the ~1s bloom, with margin

  const late = await sampleCanvasAlpha(page, TIDEWATER_CANVAS, [farCorner])
  check(
    'B7 hover bloom: opposite unpainted corner reaches colour after dwell + bloom',
    Array.isArray(late) && late[0] > 0,
    JSON.stringify(late),
  )

  await context.close()
}

async function pollPhases(page, ms, intervalMs = 20) {
  await page.evaluate(
    ({ intervalMs }) => {
      window.__phases = []
      window.__phaseTimer = setInterval(() => window.__phases.push(document.documentElement.dataset.transition), intervalMs)
    },
    { intervalMs },
  )
  await page.waitForTimeout(ms)
  return page.evaluate(() => {
    clearInterval(window.__phaseTimer)
    return window.__phases
  })
}

// T1: card click changes the URL with no reload, curtain covers then
// clears, h1 gets focus, the live region announces the title.
async function testCardClick(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)

  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.evaluate(() => {
    window.__marker = Math.random()
  })
  await page.waitForTimeout(SETTLE_MS)

  const startUrl = page.url()
  const phasesPromise = pollPhases(page, 1650, 20)
  await page.click('a[href="/projects/tidewater"]')

  await page.waitForTimeout(50)
  check('T1 html[data-transition]="covering" within 50ms', (await page.evaluate(() => document.documentElement.dataset.transition)) === 'covering')

  await page.waitForTimeout(350)
  check('T1 URL unchanged at ~400ms', page.url() === startUrl)
  check('T1 window marker survives (no document reload)', (await page.evaluate(() => window.__marker)) !== undefined)

  await page.waitForTimeout(300)
  check('T1 URL is /projects/tidewater by ~700ms', page.url().endsWith('/projects/tidewater'))

  const phases = await phasesPromise
  check('T1 idle by ~1600ms', phases[phases.length - 1] === 'idle', phases.join(','))

  // 44-ink-build-plan.md §check:transitions "changed (2)": the old curtain-
  // panel-parked-offscreen check becomes "the WebGL canvas is released
  // (shrunk to 1x1) at idle" — or absent, which the CSS ink-fade fallback
  // (no GL) leaves as the permanent state.
  const cover = await page.evaluate(() => {
    const root = document.querySelector('[data-curtain]')
    if (!root) return null
    const canvas = root.querySelector('canvas')
    return { visibility: getComputedStyle(root).visibility, canvasWidth: canvas ? canvas.width : null }
  })
  check('T1 curtain ends visibility:hidden', cover?.visibility === 'hidden')
  check(
    'ink canvas released at idle',
    cover?.canvasWidth == null || cover.canvasWidth <= 1,
    `canvasWidth=${cover?.canvasWidth}`,
  )

  check('T1 data-lenis is present (running)', (await page.evaluate(() => document.documentElement.getAttribute('data-lenis'))) !== null)
  check('T1 document.activeElement is the h1', (await page.evaluate(() => document.activeElement?.tagName)) === 'H1')

  const announced = await page.evaluate(() => document.querySelector('[data-route-announcer]')?.textContent)
  check('T1 announcer text = document.title', announced === (await page.title()), `"${announced}" vs "${await page.title()}"`)

  await context.close()
}

// T2: a double click on the same card navigates once.
async function testDoubleClick(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const before = await page.evaluate(() => window.history.length)
  const card = page.locator('a[href="/projects/tidewater"]').first()
  await card.click()
  await card.click({ force: true })
  await page.waitForTimeout(NAV_SETTLE_MS)
  const after = await page.evaluate(() => window.history.length)
  check('T2 double click adds exactly one history entry', after - before === 1, `before=${before} after=${after}`)
  check('T2 lands on /projects/tidewater once', page.url().endsWith('/projects/tidewater'))

  await context.close()
}

// T3: back never shows the curtain, goes idle fast, and restores the
// scroll position `/` itself had before we ever navigated away from it.
async function testBack(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.mouse.wheel(0, 900)
  const scrollBefore = await waitForStableScroll(page)

  // Navigate away via the menu, not a card or the inline nav link: a card
  // at this scroll position may need Playwright's own actionability
  // auto-scroll first (nudging `/`'s scroll via native scrollIntoView and
  // contaminating the baseline), and M6 has already autoAlpha'd the inline
  // link out past this scroll depth. The compact MenuButton (M6) is always
  // on screen at any scroll position.
  await page.click('[data-menu-button]')
  await page.waitForTimeout(900)
  await page.click('a[data-menu-link][href="/about"]')
  await page.waitForTimeout(NAV_SETTLE_MS)

  const phasesPromise = pollPhases(page, 500, 15)
  await page.goBack()
  const phases = await phasesPromise
  check('T3 covering never appears on back', !phases.includes('covering'), phases.join(','))
  check('T3 idle within 400ms of back', phases[phases.length - 1] === 'idle', phases.join(','))

  const scrollAfter = await page.evaluate(() => window.scrollY)
  check('T3 scrollY restored within 4px', Math.abs(scrollAfter - scrollBefore) <= 4, `before=${scrollBefore} after=${scrollAfter}`)

  await context.close()
}

// T4: ctrl+click is not intercepted — a new tab opens, no transition starts.
async function testCtrlClick(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const newPagePromise = context.waitForEvent('page', { timeout: 3000 }).catch(() => null)
  await page.click('a[href="/projects/tidewater"]', { modifiers: ['Control'] })
  const newPage = await newPagePromise
  check('T4 ctrl+click opens a new page', Boolean(newPage))
  check('T4 ctrl+click does not start a transition', (await page.evaluate(() => document.documentElement.dataset.transition)) !== 'covering')
  if (newPage) await newPage.close()

  await context.close()
}

// T5: Work on `/` scrolls with no curtain (same pathname, hash only).
async function testWorkSamePage(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const phasesPromise = pollPhases(page, NAV_SETTLE_MS, 20)
  await page.locator('header a[href="/#work"]').first().click()
  const phases = await phasesPromise
  check('T5 no curtain for Work on /', !phases.includes('covering'), phases.join(','))

  // `#work`'s section carries `scroll-mt-20` so it clears the fixed h-20
  // nav bar — the resting position is ~80px from the top, not 0.
  const offset = await page.evaluate(() => document.getElementById('work')?.getBoundingClientRect().top ?? -999)
  check('T5 #work settles just below the fixed nav', offset >= 0 && offset <= 88, `offset=${offset}`)

  await context.close()
}

// T6: Work from `/about` lands on `/#work` at the anchor.
async function testWorkFromAbout(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/about', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.locator('header a[href="/#work"]').first().click()
  await page.waitForTimeout(NAV_SETTLE_MS)
  check('T6 lands on /#work', page.url().endsWith('/#work'), page.url())
  const offset = await page.evaluate(() => document.getElementById('work')?.getBoundingClientRect().top ?? -999)
  check('T6 #work settles just below the fixed nav', offset >= 0 && offset <= 88, `offset=${offset}`)

  await context.close()
}

// T7: closing the menu via a nav link force-closes it (no visible close anim needed).
async function testMenuToAbout(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.click('[data-menu-button]')
  await page.waitForTimeout(900)
  await page.click('a[data-menu-link][href="/about"]')
  await page.waitForTimeout(NAV_SETTLE_MS)

  check('T7 aria-expanded=false after nav', (await page.getAttribute('[data-menu-button]', 'aria-expanded')) === 'false')
  check('T7 main not inert after nav', (await page.evaluate(() => document.getElementById('main')?.hasAttribute('inert'))) === false)
  check('T7 landed on /about', page.url().endsWith('/about'), page.url())

  await context.close()
}

// T8: NextProject wraps halftone -> tidewater.
async function testNextProject(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/projects/halftone', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.locator('a[data-cursor-text="next"]').click()
  await page.waitForTimeout(NAV_SETTLE_MS)
  check('T8 halftone -> tidewater via NextProject', page.url().endsWith('/projects/tidewater'), page.url())

  await context.close()
}

// T9: under reduced motion, the curtain never runs, but focus/announce still happen.
async function testReducedMotion(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const phasesPromise = pollPhases(page, 1200, 15)
  await page.click('a[href="/projects/tidewater"]')
  const phases = await phasesPromise
  check('T9 reduced motion never shows covering', !phases.includes('covering'), phases.join(','))
  check('T9 h1 focused under reduced motion', (await page.evaluate(() => document.activeElement?.tagName)) === 'H1')

  await context.close()
}

// T10 + label reset: cursor returns to default with no leftover label after navigating away from a hovered card.
async function testCursorReset(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const card = page.locator('a[href="/projects/tidewater"]').first()
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100)
  // 44 §check:transitions "changed (2)": hovering the card's *media*
  // specifically now resolves to the 'brush' state (src/components/
  // Cursor.tsx's [data-brush] target), not 'text' — the outer link still
  // shows 'text'/"open" over the title row below it.
  const box = await page.locator(TIDEWATER_FIGURE).first().boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 2)
  await page.waitForTimeout(250)
  check(
    'cursor shows brush state over card media',
    (await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorState)) === 'brush',
  )

  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(NAV_SETTLE_MS)

  check('T10 data-cursor-state=default after navigation', (await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorState)) === 'default')
  const labelText = await page.evaluate(() => document.querySelector('[data-cursor-dot] + span span')?.textContent)
  check('cursor has no label after navigating away from a hovered card', !labelText, `"${labelText}"`)

  await context.close()
}

// hover: none emulation (coarse pointer / touch): the custom cursor never initialises.
async function testHoverNoneEmulation(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  await page.touchscreen.tap(196, 400).catch(() => {})
  await page.waitForTimeout(300)
  check('.has-custom-cursor absent under hover:none emulation', (await page.evaluate(() => document.documentElement.classList.contains('has-custom-cursor'))) === false)

  await context.close()
}

async function captureCoverShots(browser, base, outDir) {
  await mkdir(outDir, { recursive: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)
  await page.click('a[href="/projects/tidewater"]')

  let elapsed = 0
  for (const mark of [250, 550, 900]) {
    await page.waitForTimeout(mark - elapsed)
    elapsed = mark
    const file = path.join(outDir, `cover-${mark}.png`)
    await page.screenshot({ path: file })
    console.log(`[check-transitions] saved ${path.relative(process.cwd(), file)}`)
  }
  await context.close()
}

function printResults() {
  const nameWidth = Math.min(70, Math.max(...results.map((r) => r.name.length)))
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL'
    const detail = r.pass ? '' : r.detail
    console.log(`[check-transitions] ${status}  ${r.name.padEnd(nameWidth)}  ${detail}`.trimEnd())
  }
  const failed = results.filter((r) => !r.pass)
  console.log(`[check-transitions] ${results.length - failed.length}/${results.length} checks passed`)
  return failed.length === 0
}

async function main() {
  if (!skipBuild) build()

  const server = await preview({ root: process.cwd(), preview: { port: 4173, strictPort: false } })
  const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4173/'
  const browser = await chromium.launch()

  try {
    await testCardClick(browser, base)
    await testDoubleClick(browser, base)
    await testBack(browser, base)
    await testCtrlClick(browser, base)
    await testWorkSamePage(browser, base)
    await testWorkFromAbout(browser, base)
    await testMenuToAbout(browser, base)
    await testNextProject(browser, base)
    await testReducedMotion(browser, base)
    await testCursorReset(browser, base)
    await testHoverNoneEmulation(browser, base)
    await testBrushIdle(browser, base)
    await testBrushOffscreen(browser, base)
    await testBrushFocus(browser, base)
    await testBrushReducedMotion(browser, base)
    await testBrushFastStroke(browser, base)
    await testBrushTouch(browser, base)
    await testBrushHoverBloom(browser, base)

    check('T11 zero console warnings/errors/pageerrors across the run', consoleIssues.length === 0, consoleIssues.slice(0, 8).join(' | '))

    if (wantShots) {
      const outDir = path.resolve('../notes/plan/shots/e5')
      await captureCoverShots(browser, base, outDir)
    }
  } finally {
    await browser.close()
    await server.close()
  }

  const ok = printResults()
  if (!ok) process.exit(1)
}

main()
