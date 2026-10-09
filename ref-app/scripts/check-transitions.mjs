#!/usr/bin/env node
/**
 * scripts/check-transitions.mjs
 *
 * Drives headless Chromium against the real `dist/` build (via `vite
 * preview`, same approach as scripts/shots.mjs) and asserts E5's page-
 * transition, cursor and menu acceptance criteria (03-agent-briefs.md
 * §E5), plus E3's brush-reveal checks B1-B6 (44-ink-build-plan.md
 * §check:transitions "Added (6)") and B7 (49-round4-plan.md §E2, item 4,
 * R4-4 in 41-ink-replace-map.md: the instant entry-point ink-splash,
 * replacing round 3's hover-dwell colour bloom -- B5/B6 also updated here
 * since round 3's per-stroke painting and touch auto-stroke they tested are
 * gone too), plus B8/B9 (R4-4b, the owner's round-4 fixes to R4-4: B5-B7's
 * timing waits bumped for fix 1's longer BLOOM_MS, B8 the reverse-direction
 * dry-back of fix 3, B9 the fully-painted -> "open" cursor handoff of fix
 * 4, extended here with R4-4c's `data-cursor-no-trail` assertions) and B10
 * (R4-4c, 41-ink-replace-map.md: the owner's round-4 follow-up bug report --
 * re-entering a figure mid-splash was restarting it; B10 asserts it can't),
 * plus four new R4-5 checks (49 §E4b, item 5: the raindrop
 * splash hero intro replacing round 3's one-stroke version, which had no
 * checks of its own in this suite) -- cold-load mount/unmount, reduced
 * motion, scrolled entry and pop entry. Prints a PASS/FAIL table and exits
 * 1 on any failure or any console error/warning/pageerror seen along the
 * way.
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
const NAV_SETTLE_MS = 1800 // push transition idle (47 §R4: cover .45 + hold .1 + recede .65 ~= 1.2s) plus margin

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

// B1-B10 (44-ink-build-plan.md §check:transitions): colour coverage at
// fractional [0..1] points of a figure, as 255 (colour showing) or 0 (grey).
// The brush engine (src/ink/brush.ts, 2026-09-28 rewrite) reveals the colour
// layer by animating its `clip-path: polygon()`, so this reads that layer's
// *computed* clip-path -- which reflects a running animation's current
// value -- and runs a point-in-polygon test (even-odd), instead of reading
// canvas pixels as it did when the engine composited on a canvas. `none`
// means fully painted. Same return shape as before, so every caller's
// thresholds (`> 0`, `=== 0`, `>= 200`) read unchanged.
async function sampleCanvasAlpha(page, selector, points) {
  return page.evaluate(
    ({ selector, points }) => {
      const colour = document.querySelector(selector)
      if (!colour) return null
      const clip = getComputedStyle(colour).clipPath
      if (!clip || clip === 'none') return points.map(() => 255)
      const body = clip.match(/polygon\((.*)\)/)
      if (!body) return points.map(() => 0)
      const rect = colour.getBoundingClientRect()
      const toPx = (v, size) => (v.endsWith('%') ? (parseFloat(v) / 100) * size : parseFloat(v))
      const poly = body[1]
        .replace(/^(nonzero|evenodd),\s*/, '')
        .split(',')
        .map((pair) => {
          const [x, y] = pair.trim().split(/\s+/)
          return [toPx(x, rect.width), toPx(y, rect.height)]
        })
      const inside = (px, py) => {
        let hit = false
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const [xi, yi] = poly[i]
          const [xj, yj] = poly[j]
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit
        }
        return hit
      }
      return points.map(([fx, fy]) => (inside(fx * rect.width, fy * rect.height) ? 255 : 0))
    },
    { selector, points },
  )
}

// 47 §R4 "add a check that ink coverage never drops to zero between the
// first ink frame and the start of the dry-away": this is the direct
// regression test for the diagnosed gap (the bare page at ~780ms, before
// this round's `preserveDrawingBuffer` fix). A fixed-interval poll loop
// (tried first) raced `swapping`/`holding`'s own length: TransitionProvider
// only awaits real time between `covering`->`swapping` (`waitForPageReady`);
// `holding`->`revealing` has a *conditional* await (skipped outright when
// `holdRemaining <= 0`), so on a fast run that whole window can be under a
// poll interval and get skipped entirely, leaving zero samples outside
// `covering` -- an empty-array false negative, confirmed twice on this
// machine. A `MutationObserver` on `data-transition` instead reads the
// curtain's alpha *at the instant each phase is set*, in-page, with no
// polling interval to race — it can still coalesce `holding`+`revealing`
// if TransitionProvider sets both synchronously in the same tick (no
// awaited gap between them), but `covering`->`swapping` always has a real
// `await waitForPageReady(...)` first, so `swapping`'s own reading — the
// phase where the historical bug actually lived (`#main` hidden, destination
// route mounting, nothing else redrawing the canvas) — is reliably captured.
async function testInkCoverageDuringSwap(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.evaluate(() => {
    window.__r4log = []
    function readMeanAlpha() {
      const canvas = document.querySelector('[data-curtain] canvas')
      if (!canvas || canvas.width <= 1 || canvas.height <= 1) return null
      const gl = canvas.getContext('webgl')
      if (!gl) return null
      const w = canvas.width
      const h = canvas.height
      const pts = [
        [0.1, 0.1], [0.5, 0.1], [0.9, 0.1],
        [0.1, 0.5], [0.5, 0.5], [0.9, 0.5],
        [0.1, 0.9], [0.5, 0.9], [0.9, 0.9],
      ]
      const px = new Uint8Array(4)
      const alphas = pts.map(([fx, fy]) => {
        gl.readPixels(Math.round(fx * w), Math.round(fy * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
        return px[3]
      })
      return alphas.reduce((a, b) => a + b, 0) / alphas.length
    }
    const record = () => window.__r4log.push({ phase: document.documentElement.dataset.transition, mean: readMeanAlpha() })
    new MutationObserver(record).observe(document.documentElement, { attributes: true, attributeFilter: ['data-transition'] })
  })

  await page.click('a[href="/projects/malware-detection"]')
  await page.waitForFunction(
    () => document.documentElement.dataset.transition === 'idle' && window.__r4log?.some((e) => e.phase === 'idle'),
    { timeout: 5000 },
  )

  const log = await page.evaluate(() => window.__r4log)
  const preRecede = log.filter((e) => e.phase === 'swapping' || e.phase === 'holding')
  check(
    'R4 ink coverage never drops toward zero between full cover and the start of recede',
    preRecede.length > 0 && preRecede.every((e) => e.mean >= 200),
    JSON.stringify(preRecede.map((e) => `${e.phase}:${Math.round(e.mean)}`)),
  )

  await context.close()
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
const FIRST_PROJECT_CARD = 'a[href="/projects/malware-detection"]'
const FIRST_PROJECT_FIGURE = `${FIRST_PROJECT_CARD} [data-brush]`
const FIRST_PROJECT_CANVAS = `${FIRST_PROJECT_FIGURE} .brush-colour` // the clipped colour layer (was the display canvas)

// 2026-09-28: home project cards sit on mounted scrolls that start rolled up
// (clipped) and unroll over 1.1s once they scroll in (styles/base.css
// `.scroll`, motion/reveal.ts). A clipped region takes no pointer events, so
// every hover test has to wait for the scroll to be open before touching it
// -- exactly like a visitor, who can't hover what isn't visible yet. Under
// reduced motion there's no unroll (never rolled up), so nothing to wait for.
async function showCard(page) {
  await page.locator(FIRST_PROJECT_CARD).first().scrollIntoViewIfNeeded()
  await page.waitForFunction(
    (sel) => !document.documentElement.classList.contains('motion-ready') || Boolean(document.querySelector(`${sel} [data-reveal="scroll"][data-unrolled]`)),
    FIRST_PROJECT_CARD,
    { timeout: 5000 },
  )
  await page.waitForTimeout(1200)
}

// B1: hover then leave a card; once the splash, the D4 hold (1.5s) and the
// fade (1.2s) have all settled, the frame counter goes quiet and the mask
// reads back to 0.
//
// Orchestrator fix (R4-4b, 2026-09-28): the wait below used to be
// hold + fade + margin only, which was right while leaving mid-splash froze
// the reveal and dropped straight into hold. The owner's fix 2 ("u shouldnt
// be able to cancel the painting out") means the pointer leaving is no
// longer a shortcut: the splash always runs its full BLOOM_MS first, so the
// settle point is now bloom + hold + fade. The pointer here enters and
// leaves in the same breath, so all three phases are still ahead of us.
async function testBrushIdle(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const card = page.locator(FIRST_PROJECT_CARD).first()
  await showCard(page)
  const box = await card.boundingBox()

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7)
  await page.mouse.move(0, 0)

  await page.waitForTimeout(1500 + 1500 + 1200 + 300) // BLOOM_MS + HOLD_MS + FADE_MS + margin

  const { before, after, stable } = await waitFramesStable(page, FIRST_PROJECT_FIGURE, 1000)
  check('B1 idle: brushFrames counter is unchanged over 1s once settled', stable, `before=${before} after=${after}`)

  const alphas = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, GRID_9)
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

  const card = page.locator(FIRST_PROJECT_CARD).first()
  await showCard(page)
  const box = await card.boundingBox()

  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6)
  await page.waitForTimeout(50)
  await page.mouse.move(box.x - 50, box.y - 50)

  await page.waitForTimeout(1500 + 400) // into the fade, not through it

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(200)

  const { before, after, stable } = await waitFramesStable(page, FIRST_PROJECT_FIGURE, 1000)
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

  await page.locator(FIRST_PROJECT_CARD).first().focus()
  await page.waitForTimeout(1200)

  const alphas = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, GRID_9)
  check(
    'B3 focus: bleed bloom reveals colour at all 9 grid points within 1.2s',
    Array.isArray(alphas) && alphas.every((a) => a > 0),
    JSON.stringify(alphas),
  )

  await context.close()
}

// B4: under reduced motion, BrushReveal never mounts a canvas at all, and
// the plain CSS fallback swaps the grey overlay's opacity off instantly on
// hover -- R4-4: the overlay is now a baked-grey `<img class="brush-grey">`
// stacked over the colour `<img>`, not a filter on a single image, so this
// has to target that overlay specifically rather than "the" img.
async function testBrushReducedMotion(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const card = page.locator(FIRST_PROJECT_CARD).first()
  await showCard(page)
  const box = await card.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(50)

  // 2026-09-28 engine rewrite: the colour `<img class="brush-colour">` now
  // sits *above* the grey one, so the CSS fallback shows it on hover
  // (opacity 0 -> 1) instead of hiding the grey overlay.
  const opacity = await page.evaluate((sel) => {
    const img = document.querySelector(`${sel} img.brush-colour`)
    return img ? getComputedStyle(img).opacity : null
  }, FIRST_PROJECT_FIGURE)
  check('B4 reduced motion: colour layer opacity is 1 within 50ms of hover', opacity === '1', `opacity="${opacity}"`)

  const engineMounted = await page.evaluate((sel) => {
    const img = document.querySelector(`${sel} img.brush-colour`)
    return Boolean(img?.style.clipPath) || document.documentElement.classList.contains('brush-ready')
  }, FIRST_PROJECT_FIGURE)
  check('B4 reduced motion: the brush engine never mounts (no clip on the colour layer)', engineMounted === false)

  await context.close()
}

// B5 (R4-4: replaces round 3's per-stroke painting, which this used to
// test): entering a figure, then immediately making a few more rapid
// pointer moves inside it (a fast real mouse, not a still one), still
// lands full colour everywhere with no residual gaps once the splash
// completes -- the splash is one deterministic animation from the entry
// point, unaffected by pointer movement after entry, not a path that has
// to be re-painted to avoid holes.
async function testBrushFastStroke(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  // The mouse targets and the alpha samples both have to be fractions of
  // the *figure*'s own box: the card link (FIRST_PROJECT_CARD) also wraps the
  // title row below the image, so its box is taller than, and offset from,
  // the figure/canvas the fractions land on -- sampling against the
  // link's box put "top" test points tens of pixels above where the mouse
  // actually was on the canvas.
  await showCard(page)
  const box = await page.locator(FIRST_PROJECT_FIGURE).first().boundingBox()

  const start = { x: box.x + box.width * 0.08, y: box.y + box.height * 0.12 }
  const end = { x: box.x + box.width * 0.92, y: box.y + box.height * 0.88 }
  await page.mouse.move(start.x, start.y)
  await page.waitForTimeout(20) // one rAF tick so pointerenter settles before the jumps
  for (let i = 1; i <= 3; i++) {
    const t = i / 3
    await page.mouse.move(start.x + (end.x - start.x) * t, start.y + (end.y - start.y) * t)
    await page.waitForTimeout(20)
  }
  // Margin past BLOOM_MS (R4-4b fix 1: ~1.5s, was ~1s): the splash
  // triggered by the very first `mouse.move` (the entry) should have
  // finished spreading regardless of the extra moves that followed it.
  await page.waitForTimeout(1700)

  const samples = 30
  const points = Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1)
    return [0.08 + (0.92 - 0.08) * t, 0.12 + (0.88 - 0.12) * t]
  })
  const alphas = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, points)
  const gaps = Array.isArray(alphas) ? alphas.filter((a) => a === 0).length : samples
  check(
    'B5 fast pointer path: no gaps across 30 samples once the entry splash completes (~1.5s)',
    gaps === 0,
    `zero-alpha samples=${gaps}/${samples}`,
  )

  await context.close()
}

// B6 (R4-4: the automatic S-stroke this used to test is gone -- D5's touch
// trigger is now the same instant entry-splash as pointer/focus, seeded at
// the figure's centre): a coarse-pointer/touch context scrolling a card
// through the viewport's middle band gets one splash from the centre,
// scrolling itself is never blocked, and the canvas stays
// pointer-events:none throughout.
async function testBrushTouch(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(1200)

  const pointerEvents = await page.evaluate((sel) => {
    const canvas = document.querySelector(sel)
    return canvas ? getComputedStyle(canvas).pointerEvents : null
  }, FIRST_PROJECT_CANVAS)
  check('B6 touch: the colour layer keeps pointer-events:none', pointerEvents === 'none', `pointerEvents="${pointerEvents}"`)

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
  // Past BLOOM_MS (R4-4b fix 1: ~1.5s, was ~1s) with margin from whenever
  // mid-band was actually crossed during the scroll loop above, so the
  // splash has had time to reach full coverage, not just started.
  await page.waitForTimeout(1800)

  const scrollAfter = await page.evaluate(() => window.scrollY)
  check('B6 touch: scrollY advanced (native scroll unblocked)', scrollAfter > scrollBefore, `before=${scrollBefore} after=${scrollAfter}`)

  const alphas = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, GRID_9)
  check(
    'B6 touch: the mid-band entry splash reveals colour at all 9 grid points',
    Array.isArray(alphas) && alphas.every((a) => a > 0),
    JSON.stringify(alphas),
  )

  await context.close()
}

// B7 (49-round4-plan.md §E2, item 4, R4-4 in 41-ink-replace-map.md):
// replaces round 3's hover-dwell bloom. The moment the pointer enters the
// figure, colour spreads from that entry point -- no dwell timer. Enters
// near one corner, holds the pointer still (no further movement), and
// checks: (a) colour has already started right at the entry point almost
// immediately (proving there's no dwell), and (b) it has reached the
// opposite far corner within ~BLOOM_MS of that same entry, with the
// pointer never having moved again -- so any colour there can only be the
// splash, never a stroke following the pointer (there is no such stroke
// any more).
async function testBrushEntrySplash(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await showCard(page)
  const box = await page.locator(FIRST_PROJECT_FIGURE).first().boundingBox()

  const nearCorner = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.1 }
  const farCorner = [0.9, 0.9]

  await page.mouse.move(nearCorner.x, nearCorner.y) // entry point: the splash's own origin
  await page.waitForTimeout(80) // well under BLOOM_MS (R4-4b fix 1: 1500ms); pointer never moves again

  const near = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, [[0.1, 0.1]])
  check(
    'B7 entry splash: colour starts at the entry point within 80ms of entry (no dwell timer)',
    Array.isArray(near) && near[0] > 0,
    JSON.stringify(near),
  )

  await page.waitForTimeout(1700) // BLOOM_MS (R4-4b fix 1: 1500) + margin

  const far = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, [farCorner])
  check(
    'B7 entry splash: reaches the opposite far corner within ~1.5s of entry, covering the whole figure',
    Array.isArray(far) && far[0] > 0,
    JSON.stringify(far),
  )

  await context.close()
}

// B8 (49-round4-plan.md §Run mode change, owner fix 3: "the decay should be
// the opposite direction of the painting"): triggers a splash, lets it
// finish and hold, then leaves and samples partway into the fade. Under the
// *old* uniform alpha fade, the entry point and the far corner would read
// identically at any instant. Under the new directional dry-back
// (brush.ts's `drawFadeFrame`, the same ray field run backward), the shape
// covering the figure at any `s` is provably bounded within `maxRadius * s
// * (1 + SPLASH_SPEED_JITTER)` of the entry point (paintRayBlob's fill is
// the convex hull of points each within that radius, and distance-from-a-
// point is maximised at a convex hull's vertices) -- so a `t_fade` chosen
// so that bound already sits inside the 0.9,0.9 sample's fixed ~0.89x-of-
// maxRadius distance from a 0.1,0.1 entry point (true for *any* figure
// aspect ratio, since the farthest canvas corner from a near-(0,0) point is
// always the far corner) guarantees the far corner has dried while the
// entry point -- inside the blob for any s>0 -- has not, regardless of the
// entry's fixed-seed noise. t_fade=0.6 gives s~0.30, comfortably under the
// ~0.56 threshold that bound requires.
async function testBrushDryBackDirection(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await showCard(page)
  const box = await page.locator(FIRST_PROJECT_FIGURE).first().boundingBox()

  const nearCorner = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.1 }
  const origin = [0.1, 0.1]
  const farCorner = [0.9, 0.9]

  await page.mouse.move(nearCorner.x, nearCorner.y) // entry point: the splash's own origin
  // Leave almost immediately -- fix 2's "can't cancel" means the splash
  // still has to run to its full BLOOM_MS regardless, so this doubles as a
  // regression guard: if leaving early ever froze or restarted it, the
  // entry point wouldn't read coloured below.
  await page.mouse.move(box.x - 50, box.y - 50)

  // BLOOM_MS (1500) to full colour, then HOLD_MS (1500) fully held, then
  // 60% into FADE_MS (1200 * 0.6 = 720), plus scheduling margin.
  await page.waitForTimeout(1500 + 1500 + 720 + 150)

  const near = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, [origin])
  const far = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, [farCorner])
  check(
    'B8 dry-back direction: the entry point is still coloured 60% into the fade',
    Array.isArray(near) && near[0] > 0,
    JSON.stringify(near),
  )
  check(
    'B8 dry-back direction: the far corner (painted last, so the first to recede) is already grey',
    Array.isArray(far) && far[0] === 0,
    JSON.stringify(far),
  )

  await context.close()
}

// B9 (49-round4-plan.md §Run mode change, owner fix 4: "change cursor when
// hover after fully painted to the open cursor"): while a figure is still
// mid-splash the cursor stays 'brush' (unchanged, T10's own "cursor shows
// brush state over card media" already covers the steady-state case); once
// it's fully painted, Cursor.tsx falls through the still-hovered brush
// figure to its enclosing link's own 'text'/"open" cursor instead; leaving
// and letting it dry fully back to grey, then re-entering before it's
// fully painted again, reads 'brush' once more.
async function testBrushCursorHandoff(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const card = page.locator(FIRST_PROJECT_CARD).first()
  await showCard(page)
  const box = await page.locator(FIRST_PROJECT_FIGURE).first().boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.mouse.move(cx, cy)
  await page.mouse.move(cx + 2, cy + 2)
  await page.waitForTimeout(250) // well under BLOOM_MS (1500) -- still mid-splash
  check(
    'B9 cursor handoff: immediately the "open" label over card media',
    (await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorState)) === 'text',
  )
  check(
    'B9 cursor handoff: trail suppressed immediately over card media',
    (await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorNoTrail)) === '',
  )

  await page.waitForTimeout(1700) // past BLOOM_MS (1500) + margin: fully painted now, pointer never left
  const stateAfterFull = await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorState)
  const labelAfterFull = await page.evaluate(() => document.querySelector('[data-cursor-dot] + span span')?.textContent)
  check('B9 cursor handoff: swaps to the "open" label once fully painted', stateAfterFull === 'text', `state="${stateAfterFull}"`)
  check('B9 cursor handoff: label text is "open"', labelAfterFull === 'open', `label="${labelAfterFull}"`)

  // 51-round5-plan.md item 2 (R5j): the label's *rendered* opacity, not just
  // `dataset.cursorState` -- what the owner actually sees. The diagnosed bug
  // (Cursor.tsx's `showLabel` early-returning on a re-entry inside
  // `hideLabel`'s own 300ms fade, `DURATION.state`, leaving that fade
  // uncancelled) produced a correct `state=text, text="open"` over an
  // *invisible* label; B9's checks above never caught it because they only
  // ever entered once and let the splash fully settle first. Re-enters at
  // several gaps inside and straddling that 300ms window -- each re-entry
  // cancels the figure's hold timer (brush.ts's `reengage`), so the figure
  // stays fully painted (`data-brush-full`) across the whole loop and every
  // gap keeps resolving to the same "open" target. Must read back opacity 1
  // once settled on every gap; this is the direct regression test and must
  // fail on the pre-fix code.
  const REENTRY_GAPS_MS = [60, 120, 200, 300, 500]
  for (const gap of REENTRY_GAPS_MS) {
    await page.mouse.move(box.x - 50, box.y - 50) // leave -- hideLabel's fade starts
    await page.waitForTimeout(gap)
    await page.mouse.move(cx, cy) // re-enter
    await page.mouse.move(cx + 2, cy + 2)
    await page.waitForTimeout(400) // let any tween fully settle before sampling (> DURATION.state)
    const sample = await page.evaluate(() => {
      const dot = document.querySelector('[data-cursor-dot]')
      const label = document.querySelector('[data-cursor-dot] + span')
      return {
        state: dot?.dataset.cursorState,
        opacity: label ? getComputedStyle(label).opacity : null,
        text: label?.querySelector('span')?.textContent,
      }
    })
    check(
      `B9 label opacity: re-entry ${gap}ms after leaving reads visible "open" (opacity 1)`,
      sample.state === 'text' && sample.text === 'open' && sample.opacity === '1',
      JSON.stringify(sample),
    )
  }

  // R4-4c fix 2 ("with no trail"): the handoff also flips `data-cursor-no-
  // trail` on straight away (no state-ease, no waiting on a second
  // MutationObserver round-trip) -- Cursor.tsx's own `buildJobs` reads this
  // same `suppressTrail` flag to skip painting the trail loop entirely.
  // Asserted as a flag rather than sampling rendered trail pixels: the
  // trail's actual on-screen reach depends on card layout/geometry this
  // suite can't see ahead of time, but the flag is the one thing standing
  // between "trail drawn" and "trail not drawn" in `buildJobs`, so it's the
  // precise, geometry-independent thing to assert.
  const noTrailAfterFull = await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorNoTrail)
  check(
    'B9 cursor handoff: trail suppressed immediately once fully painted (open state, no trail)',
    noTrailAfterFull === '',
    `data-cursor-no-trail="${noTrailAfterFull}"`,
  )

  await page.mouse.move(box.x - 50, box.y - 50) // leave -- D4 dry-back starts
  await page.waitForTimeout(50) // let onPointerOut's leaveTarget()/setNoTrail(false) actually run
  const noTrailAfterLeave = await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorNoTrail)
  check(
    'B9 cursor handoff: trail resumes as soon as the cursor leaves the figure',
    noTrailAfterLeave === undefined,
    `data-cursor-no-trail="${noTrailAfterLeave}"`,
  )
  await page.waitForTimeout(1500 + 1200 + 300) // HOLD_MS + FADE_MS + margin: fully dried back to grey

  await page.mouse.move(cx, cy)
  await page.mouse.move(cx + 2, cy + 2)
  await page.waitForTimeout(80) // re-entry on card media resolves directly to 'open'
  check(
    'B9 cursor handoff: resolves to "open" label on re-entry',
    (await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorState)) === 'text',
  )
  check(
    'B9 cursor handoff: trail suppressed on the re-entry',
    (await page.evaluate(() => document.querySelector('[data-cursor-dot]')?.dataset.cursorNoTrail)) === '',
  )

  await context.close()
}

// B10 (round-4 owner bug report, "u can only trigger once until it resets
// again"): re-entering a figure must never start or restart a splash while
// one is already running (bloom/hold/fade) -- fixed by gating startBloom on
// `!state.bloomed`. The direct, geometry-independent proof: the entry
// point -- inside the splash's blob for as long as any coverage remains,
// by `paintRayBlob`'s own construction -- must never read back to zero
// alpha once it's first covered, no matter how many times the pointer
// leaves and re-enters mid-splash from a *different* point. A restart would
// rebuild the field around that new point and, for at least one frame
// before the tiny fresh blob grows back out, the old entry point would fall
// outside it and read alpha=0 -- which this catches directly, without
// needing to reason about the noise field's per-angle geometry.
async function testBrushReentryNoRestart(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await showCard(page)
  const box = await page.locator(FIRST_PROJECT_FIGURE).first().boundingBox()

  const nearCorner = { x: box.x + box.width * 0.1, y: box.y + box.height * 0.1 }
  const origin = [0.1, 0.1]
  const farCorner = [0.9, 0.9]

  await page.mouse.move(nearCorner.x, nearCorner.y) // entry point: splash starts, clock starts here
  await page.waitForTimeout(700) // partway through BLOOM_MS (1500) -- origin should already be covered

  const originMid = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, [origin])
  check(
    'B10 re-entry: the entry point is covered partway through the first splash',
    Array.isArray(originMid) && originMid[0] > 0,
    JSON.stringify(originMid),
  )

  // Leave, then re-enter from a DIFFERENT point (the figure's centre) --
  // must not restart: no fresh bloomField seeded there, no reset coverage.
  await page.mouse.move(box.x - 50, box.y - 50)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
  await page.waitForTimeout(100) // a couple of rAF ticks -- enough for a restart's tiny fresh blob to show

  const originAfterReentry = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, [origin])
  check(
    'B10 re-entry: coverage at the original entry point never drops back to zero after re-entering mid-splash',
    Array.isArray(originAfterReentry) && originAfterReentry[0] > 0,
    `before=${JSON.stringify(originMid)} after=${JSON.stringify(originAfterReentry)}`,
  )

  // The splash must still complete on its ORIGINAL ~1.5s schedule (counted
  // from the very first entry, not the re-entry): wait only the remaining
  // BLOOM_MS from that first entry, plus margin, then confirm full
  // coverage via the guaranteed whole-canvas fillRect drawBloomFrame does
  // once tRaw>=1 (44 §check:transitions, same guarantee B7 relies on).
  await page.waitForTimeout(1500 - 700 + 250)

  const farAfter = await sampleCanvasAlpha(page, FIRST_PROJECT_CANVAS, [farCorner])
  check(
    "B10 re-entry: the splash still completes on its original ~1.5s schedule, not restarted by the re-entry",
    Array.isArray(farAfter) && farAfter[0] > 0,
    JSON.stringify(farAfter),
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
  await page.click('a[href="/projects/malware-detection"]')

  await page.waitForTimeout(50)
  check('T1 html[data-transition]="covering" within 50ms', (await page.evaluate(() => document.documentElement.dataset.transition)) === 'covering')

  // 47 §R4 retimed cover 600ms->450ms: the "still covering" checkpoint moves
  // in from 400ms to 200ms (comfortably under 450ms, same margin ratio as
  // before) and the "URL has changed" checkpoint from 700ms to 550ms
  // (cover 450 + navigate/ready margin), so this still proves the same two
  // things — unchanged mid-cover, changed after — just retuned to the new
  // duration instead of loosened.
  await page.waitForTimeout(150)
  check('T1 URL unchanged at ~200ms', page.url() === startUrl)
  check('T1 window marker survives (no document reload)', (await page.evaluate(() => window.__marker)) !== undefined)

  await page.waitForTimeout(350)
  check('T1 URL is /projects/malware-detection by ~550ms', page.url().endsWith('/projects/malware-detection'))

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
  const card = page.locator('a[href="/projects/malware-detection"]').first()
  await card.click()
  await card.click({ force: true })
  await page.waitForTimeout(NAV_SETTLE_MS)
  const after = await page.evaluate(() => window.history.length)
  check('T2 double click adds exactly one history entry', after - before === 1, `before=${before} after=${after}`)
  check('T2 lands on /projects/malware-detection once', page.url().endsWith('/projects/malware-detection'))

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
  await page.click('a[href="/projects/malware-detection"]', { modifiers: ['Control'] })
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

// R5 (47-round3-plan.md §R5 item 6): desktop scroll collapse -- past 50px
// the inline links travel into the burger and fade over the last ~40% of
// their own travel, the burger inks in; scrolling back reverses it, and a
// mid-flight reversal must settle cleanly (no stuck transform/opacity).
// Also covers the burger <-> X morph (rotate/translate only, decomposed
// from the computed transform matrix) and the topmost hit-test.
async function testNavCollapseBurger(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const button = page.locator('[data-menu-button]')
  check('R5 burger aria-label is "Open menu" before scroll', (await button.getAttribute('aria-label')) === 'Open menu')

  const readLink = () =>
    page.evaluate(() => {
      const el = document.querySelector('header ul [data-nav-item]')
      if (!el) return null
      const style = getComputedStyle(el)
      return { opacity: style.opacity, visibility: style.visibility, transform: style.transform }
    })
  const readButton = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-menu-button]')
      return el ? getComputedStyle(el).opacity : null
    })
  // 49-round4-plan.md §E3 item 2: the burger is now 3 lines (outer two +
  // a static middle that only dissolves). Selected by `data-menu-burger-
  // line` rather than DOM index/position so this stays correct regardless
  // of markup order -- "outer" is exactly the two lines this morph check
  // cares about; the middle line is asserted separately below.
  const readMorphCenters = () =>
    page.evaluate(() => {
      const paths = document.querySelectorAll('[data-menu-button] path[data-menu-burger-line="outer"]')
      const button = document.querySelector('[data-menu-button]')
      if (paths.length < 2 || !button) return null
      const centerOf = (el) => {
        const r = el.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }
      return { line1: centerOf(paths[0]), line2: centerOf(paths[1]), button: centerOf(button) }
    })
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)

  // R4-2 (49 §E3 item 2): reads the raw SVG `transform` *attribute* string
  // off each outer line and the middle line's computed opacity -- the
  // exact numeric proof the plan calls for ("read both outer lines'
  // transformed centres and assert they coincide at (12,12) ... and that
  // their angles are ±45°"), in the svg's own unscaled user-space units,
  // not screen pixels (so it's independent of viewport/zoom/DPR, unlike
  // readMorphCenters above). Each line's own-centre coordinates below,
  // (12,6)/(12,18), match the `LINE1`/`LINE2` constants Nav.tsx defines.
  const OUTER_OWN_CENTRES = [
    { cx: 12, cy: 6 }, // LINE1 (top)
    { cx: 12, cy: 18 }, // LINE2 (bottom)
  ]
  const readBurgerMatrixState = () =>
    page.evaluate(() => {
      const outer = Array.from(document.querySelectorAll('[data-menu-button] path[data-menu-burger-line="outer"]'))
      const mid = document.querySelector('[data-menu-button] path[data-menu-burger-line="mid"]')
      if (outer.length < 2 || !mid) return null
      return {
        outerTransforms: outer.map((el) => el.getAttribute('transform')),
        midOpacity: getComputedStyle(mid).opacity,
      }
    })
  function parseSvgMatrix(transformAttr) {
    if (!transformAttr) return null
    const m = /matrix\(([^)]+)\)/.exec(transformAttr)
    if (!m) return null
    const [a, b, c, d, e, f] = m[1].trim().split(/[\s,]+/).map(Number)
    return { a, b, c, d, e, f }
  }
  const matrixAngleDeg = (m) => (Math.atan2(m.b, m.a) * 180) / Math.PI
  const matrixMapPoint = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f })

  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(700)

  const collapsed = await readLink()
  check('R5 collapse: inline links fade to opacity 0', collapsed?.opacity === '0', `opacity=${collapsed?.opacity}`)
  check('R5 collapse: inline links end visibility:hidden', collapsed?.visibility === 'hidden', `visibility=${collapsed?.visibility}`)
  check('R5 collapse: burger inks in to opacity 1', (await readButton()) === '1')

  // Hit-test: the burger stays topmost at its own centre point.
  const topmostIsButton = await page.evaluate(() => {
    const el = document.querySelector('[data-menu-button]')
    if (!el) return false
    const rect = el.getBoundingClientRect()
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return top === el || el.contains(top)
  })
  check('R5 burger stays topmost (hit-test at its own centre)', topmostIsButton)

  // Morph, open: the two lines must actually cross through the icon's own
  // centre, not just rotate in place (orchestrator review round 2 -- a
  // prior rotate+translate fix landed as a "^" chevron: rotated correctly,
  // but the two centres never converged). Both line centres and the
  // button's own centre must coincide within 0.5px.
  const preOpenCenters = await readMorphCenters()
  check(
    'R5 morph: closed lines are not coincident (two distinct bars)',
    dist(preOpenCenters.line1, preOpenCenters.line2) > 4,
    JSON.stringify(preOpenCenters),
  )
  // R4-2: closed state reads unmistakably as 3 lines -- the middle line is
  // fully opaque (not mid-dissolve) before the button has ever been opened.
  const preOpenMatrixState = await readBurgerMatrixState()
  check(
    'R5 morph: middle line is fully opaque at closed (reads as 3 lines)',
    preOpenMatrixState?.midOpacity === '1',
    `midOpacity=${preOpenMatrixState?.midOpacity}`,
  )

  await button.click()
  await page.waitForTimeout(400)
  check('R5 morph: aria-expanded=true, aria-label="Close menu" on open', (await button.getAttribute('aria-expanded')) === 'true' && (await button.getAttribute('aria-label')) === 'Close menu')
  const openCenters = await readMorphCenters()
  check(
    'R5 morph: open line centres coincide (within 0.5px)',
    dist(openCenters.line1, openCenters.line2) < 0.5,
    JSON.stringify(openCenters),
  )
  check(
    'R5 morph: open line centres match the button centre (within 0.5px)',
    dist(openCenters.line1, openCenters.button) < 0.5 && dist(openCenters.line2, openCenters.button) < 0.5,
    JSON.stringify(openCenters),
  )

  // R4-2 (49-round4-plan.md §E3 item 2): the exact numeric proof against a
  // chevron shipping again -- decode both outer lines' own explicit SVG
  // `transform` matrix (not the rendered/screen-space bounding box above)
  // and assert each one's own centre lands on (12,12) within 0.01 units
  // and its rotation is exactly ±45°, plus that the middle line has fully
  // dissolved (opacity 0, no ghost stroke) at the open state.
  const openMatrixState = await readBurgerMatrixState()
  const openMatrices = openMatrixState?.outerTransforms.map(parseSvgMatrix) ?? []
  const openMappedCentres = openMatrices.map((m, i) => (m ? matrixMapPoint(m, OUTER_OWN_CENTRES[i].cx, OUTER_OWN_CENTRES[i].cy) : null))
  const openAngles = openMatrices.map((m) => (m ? matrixAngleDeg(m) : null))
  check(
    'R5 morph matrix: both outer lines land on (12,12) within 0.01 units',
    openMappedCentres.every((p) => p && Math.abs(p.x - 12) < 0.01 && Math.abs(p.y - 12) < 0.01),
    JSON.stringify(openMappedCentres),
  )
  check(
    'R5 morph matrix: outer line angles are exactly ±45deg (no chevron)',
    openAngles.length === 2 && Math.abs(Math.abs(openAngles[0]) - 45) < 0.01 && Math.abs(Math.abs(openAngles[1]) - 45) < 0.01 && Math.sign(openAngles[0]) !== Math.sign(openAngles[1]),
    JSON.stringify(openAngles),
  )
  check(
    'R5 morph: middle line fully dissolved at open (opacity 0, no ghost)',
    openMatrixState?.midOpacity === '0',
    `midOpacity=${openMatrixState?.midOpacity}`,
  )

  await button.click()
  await page.waitForTimeout(400)
  const closedCenters = await readMorphCenters()
  check(
    'R5 morph: close separates the lines again (two distinct bars)',
    dist(closedCenters.line1, closedCenters.line2) > 4,
    JSON.stringify(closedCenters),
  )

  // Expand (scroll back): the reverse of collapse.
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(1000)
  const expanded = await readLink()
  check('R5 expand: inline links fade back to opacity 1', expanded?.opacity === '1', `opacity=${expanded?.opacity}`)
  check('R5 expand: burger fades back to opacity 0', (await readButton()) === '0')

  // Mid-flight reversal: scroll down, wait partway through the collapse
  // travel (well under navCollapseTravel), then reverse before it
  // finishes. It must still settle cleanly with no leftover mid-flight
  // transform or opacity -- the "no jump" contract, checked at rest.
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(120)
  await page.mouse.wheel(0, -300)
  await page.waitForTimeout(1300)
  const midFlight = await readLink()
  check('R5 mid-flight reversal settles at opacity 1 (no stuck fade)', midFlight?.opacity === '1', `opacity=${midFlight?.opacity}`)
  // Close to identity, not exact-string identity: a real settle has a
  // sub-percent easing tail (power3.out's own asymptote), not a hard snap.
  // DOMMatrix only exists in the page, so decompose it there.
  const nearIdentity = await page.evaluate(() => {
    const el = document.querySelector('header ul [data-nav-item]')
    if (!el) return false
    const t = getComputedStyle(el).transform
    if (t === 'none') return true
    const m = new DOMMatrix(t)
    return Math.abs(m.a - 1) < 0.02 && Math.abs(m.e) < 1 && Math.abs(m.f) < 1
  })
  check('R5 mid-flight reversal settles with no leftover transform', nearIdentity, `transform=${midFlight?.transform}`)

  await context.close()
}

// R6b (47-round3-plan.md §R6): the home h1 collapses into the fixed
// Monogram once its top crosses ~18% of the viewport, and expands back on
// the way up. Also proves a fast scroll through both directions ends in
// the correct state, and that the landing swap (ghost -> real Monogram) is
// pop-free within the spec's own 0.5px tolerance.
async function testHeroCollapse(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  const monoVisibility = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('[data-monogram]')).visibility)
  const letterVisibility = () =>
    page.evaluate(() => getComputedStyle(document.querySelector('[data-collapse-letter]')).visibility)
  const monoRect = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-mono="B"]')
      const r = el.getBoundingClientRect()
      return { top: r.top, left: r.left }
    })
  const ghostCount = () => page.evaluate(() => document.querySelectorAll('[data-hero-ghost]').length)

  check('R6b monogram starts hero (hidden) on /', (await monoVisibility()) === 'hidden')

  const rectBefore = await monoRect()

  // Collapse: scroll the h1's top past ~18% of the viewport.
  await page.mouse.wheel(0, 900)
  await waitForStableScroll(page)
  await page.waitForTimeout(900) // flight (~550ms, 49 §F2 retune, was 700ms) + margin

  check('R6b monogram shown after collapse trigger', (await monoVisibility()) === 'visible')
  check('R6b h1 B/W hidden after collapse', (await letterVisibility()) === 'hidden')
  check('R6b ghost removed once landed (collapse)', (await ghostCount()) === 0)

  const rectAfter = await monoRect()
  const dx = Math.abs(rectAfter.left - rectBefore.left)
  const dy = Math.abs(rectAfter.top - rectBefore.top)
  check(
    'R6b landing swap is pop-free (Monogram rect stable <=0.5px across the flight)',
    dx <= 0.5 && dy <= 0.5,
    `dx=${dx.toFixed(2)} dy=${dy.toFixed(2)}`,
  )

  // Expand: scroll back above the trigger.
  await page.mouse.wheel(0, -900)
  await waitForStableScroll(page)
  await page.waitForTimeout(900)

  check('R6b monogram back to hero after expand', (await monoVisibility()) === 'hidden')
  check('R6b h1 B/W visible after expand', (await letterVisibility()) === 'visible')
  check('R6b ghost removed once landed (expand)', (await ghostCount()) === 0)

  // Fast scroll through both directions (net back to the top): must still
  // land expanded, not stuck mid-flight or in the wrong state.
  await page.mouse.wheel(0, 2000)
  await page.mouse.wheel(0, -2000)
  await waitForStableScroll(page)
  await page.waitForTimeout(900)
  const scrollYNow = await page.evaluate(() => window.scrollY)
  const finalMono = await monoVisibility()
  check(
    'R6b fast scroll through both ways ends expanded (net scroll back to top)',
    finalMono === 'hidden',
    `scrollY=${scrollYNow} monoVisibility=${finalMono}`,
  )
  check('R6b no leftover ghost after the fast scroll', (await ghostCount()) === 0)

  await context.close()
}

// Item 5 regression (51-round5-plan.md item 5, R5i): a first load creates
// `[data-hero-ghost]` elements twice, so `collapse()` always finds a
// flight target there -- the bug only ever showed up after a client-side
// navigation away from and back to `/`. Diagnosed cause (Monogram.tsx):
// `bEl`/`wEl` used to be nulled by the `[pathname]` effect's own cleanup on
// every route change (a React callback-ref re-run/cleanup ordering quirk,
// not a `/` vs project-page difference), so after a nav round-trip
// `getMonogramLetters()` returned null and `collapse()` took its `!target`
// branch straight into `applyCollapsedInstant()` -- an instant snap, no
// `[data-hero-ghost]` ever created. This test's own navigation round-trip
// (`/` -> a project -> `/` again) is exactly the scenario that exposed it;
// testHeroCollapse above never caught it because it never navigates away
// first. Must fail on the pre-fix code.
async function testHeroCollapseGhostAfterNav(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.click('a[href="/projects/malware-detection"]')
  await page.waitForTimeout(NAV_SETTLE_MS)
  await page.click('[data-monogram]')
  await page.waitForTimeout(NAV_SETTLE_MS)

  const ghostCount = () => page.evaluate(() => document.querySelectorAll('[data-hero-ghost]').length)
  check('item-5: no leftover ghost before scrolling', (await ghostCount()) === 0)

  await page.mouse.wheel(0, 900)
  // Sample mid-flight, well inside the ~550ms collapse flight
  // (`DURATION.heroCollapseFlightMs`), not after it has landed.
  await page.waitForTimeout(220)
  const midCollapseGhosts = await ghostCount()
  check(
    'item-5: a ghost letter exists mid-collapse after project -> home navigation',
    midCollapseGhosts > 0,
    `ghosts=${midCollapseGhosts}`,
  )

  await page.waitForTimeout(900)
  check('item-5: ghost removed once landed', (await ghostCount()) === 0)

  await context.close()
}

// R4-5 (49-round4-plan.md §E4b): the raindrop splash hero intro, replacing
// round 3's one-stroke version (motion/heroStroke.ts, deleted -- its own
// checks never existed in this suite, so these four are new, not edited).
// Cold load: the cover canvas mounts under html.motion-ready almost
// immediately, then unmounts once the ~1.9s splash resolves (R4-5b retune,
// was ~2.3s) ("the canvas is removed from the DOM when done").
async function testHeroSplashColdLoad(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })

  await page.waitForTimeout(150)
  const hasCoverEarly = await page.evaluate(() => Boolean(document.querySelector('.hero-cover canvas')))
  check('R4-5 cold load: the splash cover canvas mounts shortly after load', hasCoverEarly)

  const nameVisible = await page.evaluate(() => {
    const h1 = document.querySelector('h1[aria-label]')
    return h1 ? getComputedStyle(h1).visibility !== 'hidden' : false
  })
  check('R4-5 cold load: the h1 (name) is present underneath the cover, not hidden by anything else', nameVisible)

  await page.waitForTimeout(1700) // heroSplashTotalMs (1400 after the owner's 2026-09-28 "0.5s faster"; 2300 -> 1900 -> 1400) + 300ms margin
  const hasCoverLate = await page.evaluate(() => Boolean(document.querySelector('.hero-cover canvas')))
  check('R4-5 cold load: the splash cover canvas is removed from the DOM once the intro resolves', hasCoverLate === false)

  await context.close()
}

// Reduced motion: static end state, no canvas, no rAF (same contract every
// other motion module in this codebase gets -- B4's own test is the
// pattern this mirrors).
async function testHeroSplashReducedMotion(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(600)

  const hasCanvas = await page.evaluate(() => Boolean(document.querySelector('.hero-cover canvas')))
  check('R4-5 reduced motion: no splash canvas ever mounts', hasCanvas === false)

  const nameVisible = await page.evaluate(() => {
    const h1 = document.querySelector('h1[aria-label]')
    return h1 ? getComputedStyle(h1).visibility !== 'hidden' : false
  })
  check('R4-5 reduced motion: the hero name is visible with no cover to remove', nameVisible)

  await context.close()
}

// Scrolled entry: Home.tsx reads `window.scrollY > 4` the moment its
// pageEnter('first') callback fires (within DURATION.fontsCapMs of load) --
// scrolling before that must make the splash resolve instantly, no ~2.3s
// wait.
async function testHeroSplashScrolledEntry(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.evaluate(() => window.scrollTo(0, 600))
  await page.waitForTimeout(1000) // fontsCapMs (800) + margin -- pageEnter('first') fires within this window

  const hasCanvas = await page.evaluate(() => Boolean(document.querySelector('.hero-cover canvas')))
  check('R4-5 scrolled entry: the splash resolves instantly, no lingering cover canvas', hasCanvas === false)

  await context.close()
}

// Pop navigation: instant, same contract as the scrolled-entry case above,
// triggered by mode === 'pop' instead of scroll position. Same nav pattern
// as testBack (menu -> /about -> browser back).
async function testHeroSplashPopEntry(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  // Orchestrator fix (R4-5, 2026-09-28): this used to navigate via the
  // burger, copying testBack's pattern -- but testBack scrolls 900px first,
  // which is what makes the compact MenuButton appear at all (it's
  // `md:hidden`, so at 1440 it only exists once the nav collapses past
  // 50px). Unscrolled, the click timed out and took the whole suite down
  // with it. Scrolling first isn't an option here: a restored scrollY > 4
  // would make the splash resolve through the *scrolled*-entry path, which
  // is testHeroSplashScrolledEntry's job, and would stop this test proving
  // anything about `mode === 'pop'`. At scroll 0 the inline desktop nav is
  // visible (M6 only fades it past 50px), so use that instead.
  await page.click('nav ul a[href="/about"]')
  await page.waitForTimeout(NAV_SETTLE_MS)

  await page.goBack()
  await page.waitForTimeout(NAV_SETTLE_MS + 300) // ink-cover recede (~1.2s, app/inkCover.ts) + margin, well under the splash's own ~1.9s (R4-5b, was ~2.3s)

  const hasCanvas = await page.evaluate(() => Boolean(document.querySelector('.hero-cover canvas')))
  check('R4-5 pop navigation: the splash resolves instantly, no lingering cover canvas', hasCanvas === false)

  await context.close()
}

// T8: NextProject wraps the last project back to the first (instatags ->
// malware-detection).
async function testNextProject(browser, base) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(new URL('/projects/instatags', base).toString(), { waitUntil: 'load' })
  await page.waitForTimeout(SETTLE_MS)

  await page.locator('a[data-cursor-text="next"]').click()
  await page.waitForTimeout(NAV_SETTLE_MS)
  check('T8 instatags -> malware-detection via NextProject', page.url().endsWith('/projects/malware-detection'), page.url())

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
  await page.click('a[href="/projects/malware-detection"]')
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

  const card = page.locator('a[href="/projects/malware-detection"]').first()
  await showCard(page)
  await page.waitForTimeout(100)
  // 44 §check:transitions "changed (2)": hovering the card's *media*
  // specifically now resolves to the 'brush' state (src/components/
  // Cursor.tsx's [data-brush] target), not 'text' — the outer link still
  // shows 'text'/"open" over the title row below it.
  const box = await page.locator(FIRST_PROJECT_FIGURE).first().boundingBox()
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
  await page.click('a[href="/projects/malware-detection"]')

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

// 51-round5-plan.md §E2, 45-ink-approved.md R5b: the malware-detection
// trailer's poster must be the page's preloaded LCP, and reduced motion
// must never fetch/autoplay the muted loop -- appended by E2, after E1's
// checks above, without touching them. Wired in once E3 mounts
// <ProjectVideo> inside ProjectCollage on the malware-detection page (this
// agent only builds the component and the assets it needs).
async function testProjectVideoPoster(browser, base) {
  const url = new URL('/projects/malware-detection', base).toString()

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(300)

  const posterPreloaded = await page.evaluate(() => {
    const link = document.querySelector(
      'link[rel="preload"][as="image"][href*="/projects/malware-detection/poster"]',
    )
    return Boolean(link)
  })
  check('V1 malware trailer poster is preloaded as the page LCP', posterPreloaded)
  await context.close()

  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  const reducedPage = await reducedContext.newPage()
  attachConsoleWatcher(reducedPage)
  await reducedPage.goto(url, { waitUntil: 'load' })
  await reducedPage.waitForTimeout(300)

  const state = await reducedPage.evaluate(() => {
    const loop = document.querySelector('video[data-loop-video]')
    return { loopExists: Boolean(loop), loopAutoplay: loop ? loop.hasAttribute('autoplay') : false }
  })
  check(
    'V2 reduced motion: no loop <video> carries autoplay (poster only, never fetched to play)',
    state.loopAutoplay === false,
    JSON.stringify(state),
  )
  await reducedContext.close()
}

// 55-projectpage-plan.md §E7 A (superseding 51 §E3/E6's two-grid "Hotel"
// layout): the collage replaces `Gallery` and mounts E2's `<ProjectVideo>`
// as the malware page's hero tile, and is **one** grid, not a hero grid
// sitting beside an independent 2x2 grid.
//
// Updated for round 6 (58 §F3, 45 R6e/R6f): `totalTiles` is each
// project's real `projects.ts` tile count (btardew-walley's 4B ink-print
// recapture grew it to 12; instatags' recapture grew it to 7), but the
// grid itself only ever renders up to four tile cells -- past that, the
// fourth becomes the R6f album-stack overflow tile instead of a fifth+
// cell ever existing -- so `renderedTiles` (`Math.min(totalTiles, 4)`) is
// what `[data-collage-tile]` actually counts. W1-W3 keep their original
// shape; W4 no longer counts *direct*-child triggers, because the
// overflow tile's own leaves need a non-clipping wrapper `<div>` around
// its trigger (see ProjectCollage.tsx's file comment on why the leaves
// can't live on the same element as the crop's `overflow-hidden`) --
// that wrapper is still a single grid cell, not a second grid, so W4 now
// asserts the actual invariant it was a proxy for: no direct child of
// `[data-collage]` is itself `display: grid` (the two-independent-grids
// regression this guards against would show up exactly there).
async function testProjectCollage(browser, base) {
  const cases = [
    { slug: 'malware-detection', totalTiles: 4, heroKind: 'video' },
    { slug: 'btardew-walley', totalTiles: 12, heroKind: 'image' },
    { slug: 'instatags', totalTiles: 7, heroKind: 'image' },
  ]

  for (const { slug, totalTiles, heroKind } of cases) {
    const renderedTiles = Math.min(totalTiles, 4)
    const url = new URL(`/projects/${slug}`, base).toString()
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    attachConsoleWatcher(page)
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(300)

    const state = await page.evaluate(() => ({
      galleryMounted: Boolean(document.querySelector('[data-gallery], .gallery')),
      collageMounted: Boolean(document.querySelector('[data-collage]')),
      tileCount: document.querySelectorAll('[data-collage-tile]').length,
      heroHasVideo: Boolean(document.querySelector('[data-collage-hero] video')),
      nestedGridChildren: Array.from(document.querySelectorAll('[data-collage] > *')).filter(
        (el) => getComputedStyle(el).display === 'grid',
      ).length,
    }))

    check(`W1 ${slug} renders no Gallery`, state.galleryMounted === false, JSON.stringify(state))
    check(
      `W2 ${slug} collage renders its ${renderedTiles} visible tile${renderedTiles === 1 ? '' : 's'} (of ${totalTiles} total, capped by the album-stack overflow)`,
      state.collageMounted && state.tileCount === renderedTiles,
      JSON.stringify(state),
    )
    check(
      `W3 ${slug} hero tile is ${heroKind === 'video' ? 'the video' : 'the cover image'}`,
      state.heroHasVideo === (heroKind === 'video'),
      JSON.stringify(state),
    )
    check(
      `W4 ${slug} collage is one grid: no direct child of [data-collage] is itself a nested grid`,
      state.nestedGridChildren === 0,
      JSON.stringify(state),
    )

    await context.close()
  }
}

// 51-round5-plan.md §E4, 45-ink-approved.md R5a: the monogram tone
// registry -- appended by E4, after E3's checks above, without touching
// them. Asserts `html[data-nav-on-ink]` follows a `data-tone="dark"`
// surface into and back out of the cropped nav-band observer, on the
// home route (the hero painting, tagged directly in Hero.tsx) and on a
// project route (a collage tile, tagged from its own `tone` field).
async function testMonogramToneRegistry(browser, base) {
  // Home: the hero painting is `data-tone="dark"` and sits at the very
  // top of the page, so at scrollY 0 it's under the nav band already.
  const homeUrl = new URL('/', base).toString()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(homeUrl, { waitUntil: 'load' })
  await page.waitForTimeout(300)

  const atTop = await page.evaluate(() => document.documentElement.hasAttribute('data-nav-on-ink'))
  check('N1 home: data-nav-on-ink set while the hero painting is under the nav band', atTop)

  // Scroll the dark hero painting out from under the (fixed, viewport-
  // relative) nav band -- it's the page's first section, so any scroll
  // past its own height clears it.
  await page.evaluate(() => window.scrollTo(0, 2000))
  await page.waitForTimeout(300)
  const afterScroll = await page.evaluate(() => document.documentElement.hasAttribute('data-nav-on-ink'))
  check('N2 home: data-nav-on-ink clears once the hero painting scrolls out of the nav band', !afterScroll)
  await context.close()

  // A project page's dark collage tile: same assertion, different tagged
  // surface, proving the registry reads `data-tone` generically rather
  // than special-casing the hero painting.
  const projectUrl = new URL('/projects/malware-detection', base).toString()
  const projectContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const projectPage = await projectContext.newPage()
  attachConsoleWatcher(projectPage)
  await projectPage.goto(projectUrl, { waitUntil: 'load' })
  await projectPage.waitForTimeout(300)

  const projectState = await projectPage.evaluate(() => {
    const darkTiles = document.querySelectorAll('[data-tone="dark"]')
    const rect = darkTiles[0]?.getBoundingClientRect()
    return {
      darkTileCount: darkTiles.length,
      navOnInk: document.documentElement.hasAttribute('data-nav-on-ink'),
      firstTileTop: rect?.top ?? null,
    }
  })
  check(
    'N3 malware-detection: has at least one data-tone="dark" surface (the video mount)',
    projectState.darkTileCount > 0,
    JSON.stringify(projectState),
  )
  await projectContext.close()

  // Reduced motion: the crossfade must apply with no transition (instant
  // end state), never a lingering animated colour.
  const reducedContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  const reducedPage = await reducedContext.newPage()
  attachConsoleWatcher(reducedPage)
  await reducedPage.goto(homeUrl, { waitUntil: 'load' })
  await reducedPage.waitForTimeout(300)
  const reducedTransition = await reducedPage.evaluate(() => {
    const mono = document.querySelector('[data-monogram]')
    return mono ? getComputedStyle(mono).transitionDuration : null
  })
  check(
    'N4 reduced motion: the monogram carries no colour transition (instant end state)',
    reducedTransition === '0s' || reducedTransition === null,
    String(reducedTransition),
  )
  await reducedContext.close()
}

// 51-round5-plan.md §E6, 45-ink-approved.md R5k: the collage lightbox --
// appended by E6, after E4's checks above, without touching them. Asserts
// opening from a tile, the "Photo n of N" counter, prev/next wrap-around,
// Escape closing with focus returned to the trigger, and that the malware
// page's <video> hero tile is never wrapped as a lightbox trigger (only
// images are).
async function testProjectLightbox(browser, base) {
  const url = new URL('/projects/btardew-walley', base).toString()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(300)

  const triggerCount = await page.locator('[data-collage-trigger]').count()
  // Btardew's hero is an image, so it is a trigger too. Round 6's 4B
  // ink-print recapture grew Btardew to 12 collage tiles (58 §F2/§F3), but
  // the grid only ever renders four tile cells -- the fourth becomes the
  // R6f album-stack overflow tile once there are more than four -- so the
  // trigger count is still hero + 4 visible tiles = 5, unchanged from
  // round 5's number; the other 8 tiles reach the visitor only through
  // this same lightbox's prev/next (see L10 below for that overflow tile
  // itself).
  check('L1 btardew-walley collage renders a lightbox trigger per visible cell (hero + 4 tiles)', triggerCount === 5, String(triggerCount))

  await page.locator('[data-collage-trigger]').first().focus()
  await page.locator('[data-collage-trigger]').first().click()
  await page.waitForTimeout(400)

  const opened = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
    return {
      dialogOpen: Boolean(dialog),
      labelled: Boolean(dialog && dialog.getAttribute('aria-label')),
      focusInside: Boolean(dialog && dialog.contains(document.activeElement)),
      counter: document.querySelector('[data-lightbox-counter]')?.textContent ?? null,
    }
  })
  check('L2 clicking a tile opens role=dialog aria-modal with a label', opened.dialogOpen && opened.labelled, JSON.stringify(opened))
  check('L3 focus moves into the dialog on open', opened.focusInside, JSON.stringify(opened))
  check('L4 counter reads "Photo 1 of N" for the first tile', /^Photo 1 of \d+$/.test(opened.counter ?? ''), String(opened.counter))

  const total = Number((opened.counter ?? '').match(/of (\d+)/)?.[1] ?? 0)

  // ArrowLeft from the first photo wraps to the last.
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(150)
  const afterPrev = await page.evaluate(() => document.querySelector('[data-lightbox-counter]')?.textContent ?? null)
  check(`L5 ArrowLeft on photo 1 wraps to photo ${total}`, afterPrev === `Photo ${total} of ${total}`, String(afterPrev))

  // ArrowRight wraps back from the last photo to the first.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(150)
  const afterNext = await page.evaluate(() => document.querySelector('[data-lightbox-counter]')?.textContent ?? null)
  check('L6 ArrowRight wraps from the last photo back to photo 1', afterNext === `Photo 1 of ${total}`, String(afterNext))

  // Escape closes and returns focus to the trigger that opened it.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const closed = await page.evaluate(() => ({
    dialogOpen: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
    activeIsTrigger: document.activeElement?.hasAttribute('data-collage-trigger') ?? false,
  }))
  check('L7 Escape closes the dialog', !closed.dialogOpen, JSON.stringify(closed))
  check('L8 focus returns to the trigger after Escape', closed.activeIsTrigger, JSON.stringify(closed))

  await context.close()

  // The malware page's hero tile is E2's <video> -- never a lightbox
  // trigger, only images are.
  const malwareUrl = new URL('/projects/malware-detection', base).toString()
  const malwareContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const malwarePage = await malwareContext.newPage()
  attachConsoleWatcher(malwarePage)
  await malwarePage.goto(malwareUrl, { waitUntil: 'load' })
  await malwarePage.waitForTimeout(300)
  const heroState = await malwarePage.evaluate(() => ({
    heroHasVideo: Boolean(document.querySelector('[data-collage-hero] video')),
    heroIsTrigger: Boolean(document.querySelector('[data-collage-hero] [data-collage-trigger]')),
    tileTriggerCount: document.querySelectorAll('[data-collage-trigger]').length,
  }))
  check(
    'L9 malware-detection: the video hero is never a lightbox trigger, only its image tiles are',
    heroState.heroHasVideo && !heroState.heroIsTrigger && heroState.tileTriggerCount === 4,
    JSON.stringify(heroState),
  )
  await malwareContext.close()
}

// R6e/R6f (45 §Round 6, 58 §F3 "5:1.5:1.5 collage and the album-stack
// overflow"): the four assertions 58 §F3 calls for -- the hero cell's
// rendered aspect equals its media's own aspect (±1%, so the fix actually
// stops any crop rather than merely rendering *something*), the four
// visible side cells are equal size (so the 5:1.5:1.5 columns really do
// divide the right-hand 2x2 evenly, not just by class name), the overflow
// tile shows "+N" with the right N, and it opens the lightbox at the
// right index with the full (uncapped) photo count.
async function testCollageOverflowAndAspect(browser, base) {
  // Btardew: image hero, 1600x1000 (8:5), 12 real tiles -- so the grid
  // caps at 4 and the fourth is the overflow tile, N = 12 - 4 = 8.
  const btardewUrl = new URL('/projects/btardew-walley', base).toString()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(btardewUrl, { waitUntil: 'load' })
  await page.waitForTimeout(300)

  const layout = await page.evaluate(() => {
    const hero = document.querySelector('[data-collage-hero]')
    const heroImg = hero?.querySelector('img')
    const heroRect = hero?.getBoundingClientRect()
    const sideCells = Array.from(document.querySelectorAll('[data-collage-tile]')).map((tile) => {
      const cellEl = tile.parentElement // the trigger <button> (or, for the
      // overflow tile, the <button> too -- data-collage-tile's own parent
      // is always the sizeable cell, never the outer non-clipping wrapper).
      const rect = cellEl.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })
    const overflowTrigger = document.querySelector('[data-collage-overflow]')
    const overflowText = overflowTrigger?.textContent?.trim() ?? null
    return {
      heroNaturalAspect: heroImg ? heroImg.naturalWidth / heroImg.naturalHeight : null,
      heroRenderedAspect: heroRect ? heroRect.width / heroRect.height : null,
      sideCells,
      overflowAriaLabel: overflowTrigger?.getAttribute('aria-label') ?? null,
      overflowText,
    }
  })

  const aspectDelta = Math.abs((layout.heroRenderedAspect ?? 0) - (layout.heroNaturalAspect ?? 0)) / (layout.heroNaturalAspect ?? 1)
  check(
    "R6e-1 btardew-walley hero cell's rendered aspect matches its cover image's own aspect within 1% (never cropped)",
    layout.heroNaturalAspect !== null && aspectDelta <= 0.01,
    JSON.stringify({ heroNaturalAspect: layout.heroNaturalAspect, heroRenderedAspect: layout.heroRenderedAspect }),
  )

  const widths = layout.sideCells.map((c) => Math.round(c.width))
  const heights = layout.sideCells.map((c) => Math.round(c.height))
  check(
    'R6e-2 the four visible side cells are equal size (5:1.5:1.5 columns split the right-hand 2x2 evenly)',
    layout.sideCells.length === 4 && widths.every((w) => w === widths[0]) && heights.every((h) => h === heights[0]),
    JSON.stringify(layout.sideCells),
  )

  check(
    'R6f-1 the overflow tile shows "+8" (12 tiles - 4 rendered cells)',
    layout.overflowText === '+8',
    String(layout.overflowText),
  )
  check(
    'R6f-2 the overflow tile\'s aria-label states the extra count ("8 more")',
    /8 more/.test(layout.overflowAriaLabel ?? ''),
    String(layout.overflowAriaLabel),
  )

  // Clicking the overflow tile opens the lightbox at *that* photo (index
  // 4, the 5th photo: hero + 3 plain tiles + this one), with the counter
  // reflecting the full, uncapped photo count (13 = hero + all 12 tiles),
  // not the 4 tiles the grid actually rendered.
  await page.locator('[data-collage-overflow]').focus()
  await page.locator('[data-collage-overflow]').click()
  await page.waitForTimeout(400)
  const opened = await page.evaluate(() => document.querySelector('[data-lightbox-counter]')?.textContent ?? null)
  check(
    'R6f-3 clicking the overflow tile opens the lightbox at photo 5 of 13 (the full photo count, not the capped grid count)',
    opened === 'Photo 5 of 13',
    String(opened),
  )

  await context.close()

  // Malware-detection: the one video hero, fixed at 16/9 (58 §F3) rather
  // than read off an `Img`'s width/height. No overflow here (only 4
  // tiles), so this just confirms the hero-aspect mechanism also holds
  // for the video branch, not only the image branch above.
  const malwareUrl = new URL('/projects/malware-detection', base).toString()
  const malwareContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const malwarePage = await malwareContext.newPage()
  attachConsoleWatcher(malwarePage)
  await malwarePage.goto(malwareUrl, { waitUntil: 'load' })
  await malwarePage.waitForTimeout(300)
  const heroRect = await malwarePage.evaluate(() => {
    const hero = document.querySelector('[data-collage-hero]')
    const rect = hero?.getBoundingClientRect()
    return rect ? rect.width / rect.height : null
  })
  check(
    "R6e-3 malware-detection video hero cell's rendered aspect is 16:9 within 1%",
    heroRect !== null && Math.abs(heroRect - 16 / 9) / (16 / 9) <= 0.01,
    String(heroRect),
  )
  await malwareContext.close()
}

// R6a (45 §Round 6, 58 §F1 "drop fill"): the blot-masked `.ink-wash` becomes
// a flat solid disc with no mask at all, sized `width: 300%; aspect-ratio: 1`
// of its control so it covers the control's full diagonal from any entry
// point by construction (58 §F1's math: 1.5w >= sqrt(w^2+h^2) whenever
// h/w <= sqrt(1.25)). Checked on a real PillButton outline (the
// malware-detection page's repo link) and on NextProject's circle -- the
// plan's two named `.ink-wash` users -- plus the reduced-motion instant end
// state (bar §F: no transition at all under `prefers-reduced-motion`).
async function testDropFillDisc(browser, base) {
  const url = new URL('/projects/malware-detection', base).toString()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  attachConsoleWatcher(page)
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(300)

  const readWash = (selector) =>
    page.evaluate((sel) => {
      const wash = document.querySelector(sel)
      if (!wash) return null
      const style = getComputedStyle(wash)
      const control = wash.parentElement
      if (!control) return null
      const controlRect = control.getBoundingClientRect()
      const washRect = wash.getBoundingClientRect()
      return {
        maskImage: style.maskImage || style.webkitMaskImage,
        borderRadius: style.borderRadius,
        widthRatio: controlRect.width > 0 ? washRect.width / controlRect.width : null,
      }
    }, selector)

  const pillWash = await readWash('a[href*="github.com"] .ink-wash')
  check(
    "R6a a pill's .ink-wash has no mask-image",
    pillWash !== null && (pillWash.maskImage === 'none' || pillWash.maskImage === ''),
    JSON.stringify(pillWash),
  )
  check(
    'R6a the pill wash disc is ~300% of its control width (coverage by construction)',
    pillWash !== null && pillWash.widthRatio !== null && Math.abs(pillWash.widthRatio - 3) < 0.05,
    JSON.stringify(pillWash),
  )

  const nextWash = await readWash('a[data-cursor-text="next"] .ink-wash')
  check(
    "R6a NextProject's circle .ink-wash also has no mask-image",
    nextWash !== null && (nextWash.maskImage === 'none' || nextWash.maskImage === ''),
    JSON.stringify(nextWash),
  )
  check(
    "R6a NextProject's wash disc is ~300% of the circle's own width (h/w=1.0 clears the 1.118 bound)",
    nextWash !== null && nextWash.widthRatio !== null && Math.abs(nextWash.widthRatio - 3) < 0.05,
    JSON.stringify(nextWash),
  )

  await context.close()

  const reducedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const reducedPage = await reducedContext.newPage()
  attachConsoleWatcher(reducedPage)
  await reducedPage.goto(url, { waitUntil: 'load' })
  await reducedPage.waitForTimeout(300)
  const reducedDuration = await reducedPage.evaluate(() => {
    const wash = document.querySelector('.ink-wash')
    return wash ? getComputedStyle(wash).transitionDuration : null
  })
  check(
    'R6a reduced motion: the wash carries no transition (instant end state)',
    reducedDuration === '0s',
    String(reducedDuration),
  )
  await reducedContext.close()
}

// R6b (45 §Round 6, 58 §F1 "colophon triptych"): after the collage, the
// three `project.sections` beats render as one aged-paper `.colophon` sheet
// holding three `.colophon-leaf` numbered `01`-`03`, each with a Cormorant
// `<h2>` label -- side by side at md+, stacked with the seam rotated to
// horizontal on phones.
async function testColophonTriptych(browser, base) {
  const url = new URL('/projects/malware-detection', base).toString()

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const desktopPage = await desktopContext.newPage()
  attachConsoleWatcher(desktopPage)
  await desktopPage.goto(url, { waitUntil: 'load' })
  await desktopPage.waitForTimeout(300)

  const desktopState = await desktopPage.evaluate(() => {
    const sheets = document.querySelectorAll('.colophon')
    const leaves = document.querySelectorAll('.colophon-leaf')
    const headings = document.querySelectorAll('.colophon h2')
    const numerals = Array.from(leaves).map((leaf) => leaf.querySelector('p')?.textContent ?? null)
    const rects = Array.from(leaves).map((leaf) => leaf.getBoundingClientRect())
    return {
      sheetCount: sheets.length,
      leafCount: leaves.length,
      headingCount: headings.length,
      numerals,
      tops: rects.map((r) => Math.round(r.top)),
      lefts: rects.map((r) => Math.round(r.left)),
    }
  })
  check('R6b one colophon sheet renders after the collage', desktopState.sheetCount === 1, JSON.stringify(desktopState))
  check('R6b the sheet holds three leaves', desktopState.leafCount === 3, JSON.stringify(desktopState))
  check('R6b three Cormorant h2 labels render inside the colophon', desktopState.headingCount === 3, JSON.stringify(desktopState))
  check(
    'R6b plain numerals read 01, 02, 03 in order',
    JSON.stringify(desktopState.numerals) === JSON.stringify(['01', '02', '03']),
    JSON.stringify(desktopState.numerals),
  )
  check(
    'R6b md+: the three leaves sit side by side (same top, increasing left)',
    desktopState.tops.length === 3 &&
      desktopState.tops[0] === desktopState.tops[1] &&
      desktopState.tops[1] === desktopState.tops[2] &&
      desktopState.lefts[0] < desktopState.lefts[1] &&
      desktopState.lefts[1] < desktopState.lefts[2],
    JSON.stringify(desktopState),
  )
  await desktopContext.close()

  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const phonePage = await phoneContext.newPage()
  attachConsoleWatcher(phonePage)
  await phonePage.goto(url, { waitUntil: 'load' })
  await phonePage.waitForTimeout(300)

  const phoneState = await phonePage.evaluate(() => {
    const leaves = document.querySelectorAll('.colophon-leaf')
    const rects = Array.from(leaves).map((leaf) => leaf.getBoundingClientRect())
    return {
      leafCount: leaves.length,
      tops: rects.map((r) => Math.round(r.top)),
      lefts: rects.map((r) => Math.round(r.left)),
    }
  })
  check(
    'R6b phones: the three leaves stack (same left, increasing top, horizontal seams)',
    phoneState.leafCount === 3 &&
      phoneState.lefts[0] === phoneState.lefts[1] &&
      phoneState.lefts[1] === phoneState.lefts[2] &&
      phoneState.tops[0] < phoneState.tops[1] &&
      phoneState.tops[1] < phoneState.tops[2],
    JSON.stringify(phoneState),
  )
  await phoneContext.close()
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
    await testInkCoverageDuringSwap(browser, base)
    await testDoubleClick(browser, base)
    await testBack(browser, base)
    await testCtrlClick(browser, base)
    await testWorkSamePage(browser, base)
    await testWorkFromAbout(browser, base)
    await testMenuToAbout(browser, base)
    await testNavCollapseBurger(browser, base)
    await testHeroCollapse(browser, base)
    await testHeroCollapseGhostAfterNav(browser, base)
    await testHeroSplashColdLoad(browser, base)
    await testHeroSplashReducedMotion(browser, base)
    await testHeroSplashScrolledEntry(browser, base)
    await testHeroSplashPopEntry(browser, base)
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
    await testBrushEntrySplash(browser, base)
    await testBrushDryBackDirection(browser, base)
    await testBrushCursorHandoff(browser, base)
    await testBrushReentryNoRestart(browser, base)
    await testProjectVideoPoster(browser, base)
    await testProjectCollage(browser, base)
    await testMonogramToneRegistry(browser, base)
    await testProjectLightbox(browser, base)
    await testCollageOverflowAndAspect(browser, base)
    await testDropFillDisc(browser, base)
    await testColophonTriptych(browser, base)

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
