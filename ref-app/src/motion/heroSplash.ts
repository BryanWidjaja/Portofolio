/**
 * src/motion/heroSplash.ts
 *
 * 49-round4-plan.md §E4b (item 5, R4-5 in 41-ink-replace-map.md): replaces
 * round 3's one-stroke hero intro (`motion/heroStroke.ts`, deleted with
 * this change). That module's single S-curve stroke, at any middling
 * frame, read as "a round window wipe" — the defect the owner named
 * explicitly. This module instead lands raindrops across the hero in a
 * staggered, organic rhythm -- **11** of them (R4-5b, up from the original
 * 6: the owner's round-4 note "more and faster paint drops" raised the
 * count into the plan's 10–12 range and sped up each drop's own growth;
 * see DROP_COUNT/riseMs below). Each lands as a **splash** — an
 * irregular crown with satellite droplets, noise-perturbed so it is never
 * a clean circle — and bleeds outward, carving a hole in the paper cover
 * (`destination-out`) that reveals the painting and the two-line name
 * underneath. At the same time the cover's own opacity ramps from 1 toward
 * 0 (a `<canvas>` element CSS property, so it composites for free), so any
 * patch the splashes miss still arrives, just gradually — "no hard
 * circular edge at any frame" holds everywhere, not only inside a splash.
 *
 * Technique (49 §E4b: "noise-perturbed radial fronts with fwidth-style
 * analytic AA and a pre-baked noise texture … the same approach already
 * used elsewhere in this codebase"). Two things already in this codebase
 * match that description: app/inkCover.ts's WebGL shader (a real noise
 * *texture*, sampled with `fwidth`-based edge AA), and ink/brush.ts's own
 * R4-4 pattern (`buildBloomField`/`drawBloomFrame`) — itself this same
 * round's example of that exact brief, for the project-card colour splash.
 * This module follows brush.ts's route: a second WebGL context + shader
 * pair would cost far more of the 180kB budget than deleting 401 lines of
 * heroStroke.ts frees, for an intro that only ever plays once per session.
 * Concretely: one shared 1D angular noise ring is baked once at module
 * load (three tileable value-noise octaves at non-harmonic periods, the
 * same layered-octave idea as inkCover.ts's `bakeNoiseTexture`, just 1D and
 * tiny) — "a pre-baked noise texture". Every drop samples that *same* ring
 * (at its own offset) to perturb its crown's radius per angle — an
 * SDF-like `radius(angle) = base + noise(angle)`, "noise-perturbed radial
 * front" — filled as one closed path through the sampled points
 * (`quadraticCurveTo` through their midpoints, ink/brush.ts's own
 * technique), which the canvas rasteriser anti-aliases at native
 * device-pixel resolution: the "2D-canvas equivalent" of `fwidth` AA the
 * round-4 brief allows in place of a shader (the same allowance §E2 used
 * for the per-card splash). Satellite droplets are small peer blobs of
 * their own (fewer rays, same technique), seeded at a handful of angles
 * around each crown and unioned into the same hole by drawing with the
 * same `destination-out` operation — a boolean union on the shared canvas
 * bitmap, cheaper than true metaball field-blending and visually
 * equivalent for a reveal mask (nothing ever reads the field's scalar
 * value, only whether a pixel got painted — "SDF/metaball shapes give the
 * crown and satellites cheaply").
 *
 * LCP / cover contract, unchanged from heroStroke.ts (styles/base.css
 * `.hero-cover`'s own comment has the full reasoning): the `<canvas>`
 * carries the same CSS paper background so it is opaque from first paint
 * with zero JS; this module draws the identical tile into the bitmap
 * before any erasing, then drops the CSS layer so future erasing actually
 * uncovers the page below. `instant`/`reduced` both skip straight to the
 * cleared end state with no rAF, exactly as heroStroke.ts's did (relying
 * on the promise settling on the very next microtask, so pages/Home.tsx's
 * `.then(() => setSplashDone(true))` unmounts the cover before the browser
 * ever paints a frame with it — the CSS background is deliberately left
 * alone in this path since the element is gone before it would matter).
 *
 * Deterministic placement: one fixed-seed PRNG (mulberry32, never
 * `Math.random`), so every drop's position, timing and crown shape is
 * identical on every run — needed both for "crisp, not blurred" (nothing
 * to average away between runs) and so check:transitions gets a stable
 * target to assert against.
 */

const TOTAL_MS = 900 // owner, 2026-09-28: "hero anim should be 0.5s faster aswell as a whole, the intro anim" -- a second cut, 1400 -> 900 (first cut was 1900 -> 1400). Same technique both times: every phase scaled by the same factor (900/1400 here), so the composition is untouched and only the tempo changes -- the last drop's worst-case finish is still comfortably inside the total (793 of 900ms), so the cover's opacity tail doesn't turn into a flat fade -- kept in sync by hand with motion/tokens.ts's DURATION.heroSplashTotalMs
const DROP_COUNT = 11 // 10-12 (R4-5b, up from 6/5-7) -- more drops is a *count*, not new drawing code: the same fillBlob/noise-ring path just runs 11 times instead of 6
const NAME_DROPS = 5 // the first 5 of DROP_COUNT target the name box, and start earliest -- "the name is revealed early" (scaled up from 3-of-6 so the name is still front-loaded at the new count)
const SEED = 20260928 // fixed seed -- deterministic placement (49 §E4b)
const OPACITY_FADE_POWER = 2.2 // holds near 1 early (splashes read first), rushes to 0 by TOTAL_MS -- "not a linear ramp". Shape unchanged; now riding the shorter TOTAL_MS so it still finishes flush with the (faster-arriving) drops instead of lingering as a flat tail once they're all done growing
const CROWN_RAYS = 22 // angular samples around each drop's own crown
const SATELLITE_RAYS = 7 // angular samples around each (much smaller) satellite droplet

const PAPER_SRC = '/ink/paper.webp'
const PAPER_TILE_CSS = 512 // matches `.ink-paper`/`.hero-cover canvas`'s own `background-size`

export interface HeroSplashOptions {
  canvas: HTMLCanvasElement
  /** The home h1 -- read once, at splash start, so the name-weighted drops
   * land around the *actual* rendered (two-line) name box at any
   * breakpoint. `null` falls back to a fixed lower-left box (still
   * correct, just not name-shaped -- e.g. if called before layout). */
  nameEl: HTMLElement | null
  /** POP entries, or an entry already scrolled past the trigger -- shows
   * the finished state instantly, no rAF (same contract heroStroke.ts had:
   * "plays on first and push … on a pop, or when entering already
   * scrolled past the trigger, it shows instantly in the correct state"). */
  instant: boolean
  /** Reduced motion: static, no canvas, no rAF (bar §Shared rules). */
  reduced: boolean
}

/** mulberry32 -- a tiny deterministic PRNG. Fixed seed, so every drop's
 * placement/timing/shape this bakes is the same on every run. */
function mulberry32(seed: number) {
  let a = seed
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasDpr() {
  return Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
}

// A single shared angular noise ring, baked once at module load -- "a
// pre-baked noise texture" (49 §E4b), 1D since every drop only ever
// samples it by angle (0..2π, wrapped). Three octaves at non-harmonic
// periods (the same layered idea as app/inkCover.ts's `bakeNoiseTexture`),
// smoothstep-interpolated so nearby angles correlate into a few broad
// lobes rather than jaggy per-sample static -- "irregular ... fibrous",
// never a scalloped circle.
const NOISE_RING_SIZE = 256
function buildNoiseRing(): Float32Array {
  const rand = mulberry32(SEED ^ 0x9e3779b9)
  function octave(period: number): Float32Array {
    const lattice = new Float32Array(period)
    for (let i = 0; i < period; i++) lattice[i] = rand()
    const out = new Float32Array(NOISE_RING_SIZE)
    for (let i = 0; i < NOISE_RING_SIZE; i++) {
      const g = (i / NOISE_RING_SIZE) * period
      const i0 = Math.floor(g) % period
      const i1 = (i0 + 1) % period
      const f = g - Math.floor(g)
      const s = f * f * (3 - 2 * f)
      out[i] = lattice[i0] + (lattice[i1] - lattice[i0]) * s
    }
    return out
  }
  const base = octave(5)
  const mid = octave(11)
  const fine = octave(23)
  const ring = new Float32Array(NOISE_RING_SIZE)
  for (let i = 0; i < NOISE_RING_SIZE; i++) ring[i] = base[i] * 0.55 + mid[i] * 0.3 + fine[i] * 0.15
  return ring
}
const noiseRing = buildNoiseRing()

/** Samples the shared ring at angle `angle01` (0..1 fraction of a full
 * turn), offset by `offset` (also 0..1) so different drops/satellites read
 * different, uncorrelated-looking slices of the same baked ring. Linearly
 * interpolated between neighbouring ring cells for a smooth curve. */
function sampleRing(angle01: number, offset: number): number {
  const u = (((angle01 + offset) % 1) + 1) % 1
  const g = u * NOISE_RING_SIZE
  const i0 = Math.floor(g) % NOISE_RING_SIZE
  const i1 = (i0 + 1) % NOISE_RING_SIZE
  const f = g - Math.floor(g)
  return noiseRing[i0] + (noiseRing[i1] - noiseRing[i0]) * f
}

/** Fast start, decelerating creep -- reads as a "pulse" (the quick initial
 * splat) that keeps "bleeding outward" more slowly after, never a linear
 * ramp, never a `back`/`elastic` overshoot (banned, quality-bar §D). */
function easeOutCubic(t: number): number {
  const u = 1 - t
  return 1 - u * u * u
}

type Satellite = {
  angle: number // radians, absolute (around the drop's own centre)
  gapFrac: number // fraction of the drop's maxRadius, beyond the crown's *current* edge
  radiusFrac: number // fraction of the drop's maxRadius, this satellite's own final size
  delay: number // 0..1 of the drop's own local progress before this satellite starts growing
  ringOffset: number // this satellite's own slice of the shared noise ring
}

type Drop = {
  cx: number // device px
  cy: number
  maxRadius: number // device px, this drop's own final crown radius
  startMs: number
  riseMs: number
  ringOffset: number // this drop's own slice of the shared noise ring
  satellites: Satellite[]
}

// Stagger bases + jitter ranges (ms), one pair per drop index -- "a
// staggered, organic rhythm (not evenly spaced in time)": gaps between
// bases widen through the sequence, and each drop's jitter window grows
// too, so the real gaps between arrivals are irregular, not a fixed
// interval. The first NAME_DROPS start earliest -- "the name is revealed
// early". R4-5b (owner: "more and faster paint drops"): 11 entries now,
// not 6 -- same widening-gap shape, just denser, so drops keep arriving at
// a quicker rhythm without becoming periodic. The gaps between consecutive
// bases (45,50,55,70,100,110,130,140,160,170) still widen overall but by
// irregular steps (5,5,15,30,10,20,10,20,10), never a fixed interval.
const START_BASE_MS = [0, 21, 45, 71, 104, 152, 204, 266, 332, 408, 488]
const START_JITTER_MS = [19, 26, 31, 38, 45, 52, 59, 66, 73, 80, 87]
const SATELLITE_BASE_ANGLES = [1.22, 3.32, 5.24] // ~70deg/190deg/300deg apart -- roughly spread, not symmetric

type NameBox = { left: number; right: number; top: number; bottom: number }

/** Builds the drops deterministically from `rand`. `nameBox` is the home
 * h1's own rect in the cover's unit space (0..1) -- the first `NAME_DROPS`
 * land inside (a small margin around) that box; the rest scatter across
 * the whole hero. */
function buildDrops(rand: () => number, w: number, h: number, nameBox: NameBox): Drop[] {
  const marginX = (nameBox.right - nameBox.left) * 0.12
  const marginY = (nameBox.bottom - nameBox.top) * 0.18

  const drops: Drop[] = []
  for (let i = 0; i < DROP_COUNT; i++) {
    const isName = i < NAME_DROPS
    const xFracRaw = isName
      ? nameBox.left - marginX + rand() * (nameBox.right - nameBox.left + marginX * 2)
      : 0.08 + rand() * 0.84
    const yFracRaw = isName
      ? nameBox.top - marginY + rand() * (nameBox.bottom - nameBox.top + marginY * 2)
      : 0.08 + rand() * 0.84
    const xFrac = Math.min(0.98, Math.max(0.02, xFracRaw))
    const yFrac = Math.min(0.98, Math.max(0.02, yFracRaw))

    const satellites: Satellite[] = SATELLITE_BASE_ANGLES.map((base) => ({
      angle: base + (rand() - 0.5) * 0.9,
      gapFrac: 0.1 + rand() * 0.12,
      radiusFrac: 0.05 + rand() * 0.09,
      delay: 0.2 + rand() * 0.2,
      ringOffset: rand(),
    }))

    drops.push({
      cx: xFrac * w,
      cy: yFrac * h,
      // R4-5b: radius trimmed from h*0.20-0.36 -- with nearly double the
      // drop count, keeping the old (larger) radii would overlap into a
      // wash of discs rather than reading as distinct splashes.
      maxRadius: h * (0.17 + rand() * 0.14),
      startMs: START_BASE_MS[i] + rand() * START_JITTER_MS[i],
      // R4-5b: growth sped up from 500-760ms to 300-460ms -- "each
      // individual splash grows noticeably quicker, landing and bleeding
      // faster" -- same easeOutCubic shape, just compressed in time.
      riseMs: 142 + rand() * 76,
      ringOffset: rand(),
      satellites,
    })
  }
  return drops
}

/** Fills one closed, noise-perturbed blob (crown or satellite) through
 * `rays` angular samples around `(cx, cy)`, `radiusAt(angle)` giving each
 * sample's own radius. Identical technique to ink/brush.ts's
 * `drawBloomFrame`: a smooth path through the samples' own midpoints
 * (`quadraticCurveTo`), anti-aliased at native device-pixel resolution by
 * the canvas rasteriser -- crisp by construction, no gradient feather. */
function fillBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, rays: number, radiusAt: (angle: number) => number) {
  const points: { x: number; y: number }[] = new Array(rays)
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2
    const r = radiusAt(angle)
    points[i] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
  }
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  ctx.beginPath()
  const start = mid(points[rays - 1], points[0])
  ctx.moveTo(start.x, start.y)
  for (let i = 0; i < rays; i++) {
    const next = points[(i + 1) % rays]
    const m = mid(points[i], next)
    ctx.quadraticCurveTo(points[i].x, points[i].y, m.x, m.y)
  }
  ctx.closePath()
  ctx.fill()
}

/** Draws one drop's current frame: its crown (noise-perturbed radius per
 * angle, growing on `easeOutCubic`) plus any satellites whose own delay
 * has passed (each growing on the same curve, offset outward from the
 * crown's *current* edge so they read as flung droplets, not a ring). */
function drawDrop(ctx: CanvasRenderingContext2D, drop: Drop, localT: number) {
  const eased = easeOutCubic(localT)
  const baseRadius = drop.maxRadius * eased

  fillBlob(ctx, drop.cx, drop.cy, CROWN_RAYS, (angle) => {
    const n = sampleRing(angle / (Math.PI * 2), drop.ringOffset)
    return Math.max(2, baseRadius * (0.72 + n * 0.56))
  })

  for (const sat of drop.satellites) {
    if (localT <= sat.delay) continue
    const sLocal = Math.min(1, (localT - sat.delay) / (1 - sat.delay))
    const sEased = easeOutCubic(sLocal)
    const dist = baseRadius + drop.maxRadius * sat.gapFrac
    const scx = drop.cx + Math.cos(sat.angle) * dist
    const scy = drop.cy + Math.sin(sat.angle) * dist
    const sRadius = drop.maxRadius * sat.radiusFrac * sEased
    if (sRadius <= 1) continue
    fillBlob(ctx, scx, scy, SATELLITE_RAYS, (angle) => {
      const n = sampleRing(angle / (Math.PI * 2), sat.ringOffset)
      return Math.max(1, sRadius * (0.8 + n * 0.4))
    })
  }
}

/** Loads (and decodes) the page's own paper tile once per module instance
 * -- likely already warm in the browser's cache/decode pipeline since
 * `body` uses the same file. `null` on failure (offline, blocked asset):
 * `paintCover` falls back to a flat colour rather than throwing. */
let paperImagePromise: Promise<HTMLImageElement | null> | null = null
function loadPaperImage(): Promise<HTMLImageElement | null> {
  if (!paperImagePromise) {
    paperImagePromise = new Promise((resolve) => {
      const img = new Image()
      img.src = PAPER_SRC
      if (typeof img.decode === 'function') {
        img.decode().then(
          () => resolve(img),
          () => resolve(null),
        )
      } else {
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
      }
    })
  }
  return paperImagePromise
}

/** Runs the splash on `canvas` (already an opaque paper cover via its own
 * CSS `background`, see styles/base.css `.hero-cover canvas`) and resolves
 * once every drop has finished and the cover's own opacity has reached 0.
 * `instant`/`reduced` both skip straight to the cleared end state with no
 * rAF. */
export async function playHeroSplash({ canvas, nameEl, instant, reduced }: HeroSplashOptions): Promise<void> {
  const ctxOrNull = canvas.getContext('2d')
  if (!ctxOrNull) return
  const ctx = ctxOrNull

  const parentRect = canvas.parentElement?.getBoundingClientRect()
  const cssWidth = parentRect?.width ?? window.innerWidth
  const cssHeight = parentRect?.height ?? window.innerHeight
  const dpr = canvasDpr()
  const w = Math.max(1, Math.round(cssWidth * dpr))
  const h = Math.max(1, Math.round(cssHeight * dpr))
  canvas.width = w
  canvas.height = h

  if (reduced || instant) {
    // Static end state: nothing painted, cover never shows (the promise
    // settles on the next microtask, unmounting the cover before the
    // browser paints a frame with it -- see this file's header comment).
    ctx.clearRect(0, 0, w, h)
    return
  }

  // The name's own box, in the canvas's own unit space (0..1) -- read
  // *before* the `await` below so it reflects layout at splash-start.
  let nameBox: NameBox = { left: 0.06, right: 0.45, top: 0.7, bottom: 0.94 }
  if (nameEl && parentRect && parentRect.width > 0 && parentRect.height > 0) {
    const r = nameEl.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) {
      nameBox = {
        left: (r.left - parentRect.left) / parentRect.width,
        right: (r.right - parentRect.left) / parentRect.width,
        top: (r.top - parentRect.top) / parentRect.height,
        bottom: (r.bottom - parentRect.top) / parentRect.height,
      }
    }
  }

  const paperImage = await loadPaperImage()

  // Same two-layer handoff as heroStroke.ts (styles/base.css `.hero-cover
  // canvas`'s own comment has the full reasoning): fill the solid paper
  // colour, then the grain tile on top, replicating body's own CSS
  // shorthand inside the bitmap itself, so the CSS-background-to-bitmap
  // handoff below is pixel-identical.
  function paintCover() {
    ctx.globalCompositeOperation = 'source-over'
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim()
    ctx.fillStyle = paper || '#f2ecde'
    ctx.fillRect(0, 0, w, h)
    if (paperImage) {
      const pattern = ctx.createPattern(paperImage, 'repeat')
      if (pattern) {
        const scale = (PAPER_TILE_CSS * dpr) / paperImage.width
        pattern.setTransform(new DOMMatrix().scale(scale, scale))
        ctx.fillStyle = pattern
        ctx.fillRect(0, 0, w, h)
      }
    }
  }

  paintCover()
  // Drop the CSS layer now that the bitmap carries the identical tile (see
  // this file's header + `.hero-cover canvas`'s own comment) -- from here
  // on, erasing the bitmap actually uncovers the page.
  canvas.style.background = 'none'
  canvas.style.willChange = 'opacity' // cleared implicitly: the canvas unmounts the instant this resolves
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0,0,0,1)'

  const rand = mulberry32(SEED)
  const drops = buildDrops(rand, w, h, nameBox)

  return new Promise((resolve) => {
    let start = 0
    function frame(now: number) {
      if (!start) start = now
      const elapsed = now - start

      for (const drop of drops) {
        if (elapsed < drop.startMs) continue
        const localT = Math.min(1, (elapsed - drop.startMs) / drop.riseMs)
        drawDrop(ctx, drop, localT)
      }

      // The whole cover's own opacity, independent of any drop -- "the
      // whole hero rises from low opacity to full, so anywhere the
      // splashes miss still arrives gradually". A CSS property on the
      // canvas element itself, so this composites for free and never
      // touches the bitmap (§Shared rules "transform/opacity only").
      const fadeT = Math.min(1, elapsed / TOTAL_MS)
      canvas.style.opacity = String(1 - Math.pow(fadeT, OPACITY_FADE_POWER))

      if (elapsed < TOTAL_MS) {
        requestAnimationFrame(frame)
      } else {
        // Safety net regardless of drop coverage: nothing stays hidden.
        ctx.clearRect(0, 0, w, h)
        resolve()
      }
    }
    requestAnimationFrame(frame)
  })
}
