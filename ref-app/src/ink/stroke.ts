/**
 * src/ink/stroke.ts
 *
 * 46-polish-plan.md item 1/2/7: the calligraphy core shared by
 * `ink/brush.ts` (the project-card reveal) and `components/Cursor.tsx` (the
 * brush cursor + trail canvas), extracted from the reveal engine so there
 * is one stamp/interpolation implementation instead of two. Plain
 * Canvas2D, no React/GSAP — framework-free like the module it was pulled
 * out of.
 *
 * A "stroke" is a sequence of stamps placed along a quadratic-smoothed path
 * through the caller's raw input points (`queueStrokePoints`), tight enough
 * (`gap <= .25 * radius`) that a fast pointer move still leaves a
 * continuously-painted line rather than beads (44 §check:transitions
 * B5/B6, and 46 item 2's Cursor equivalent).
 *
 * 47-round3-plan.md §R2/§R3 (owner: "no randomness anywhere per stamp"):
 * the 4-randomly-generated-bristle-sprite system this module used to stamp
 * with (`getSprites`/`stampAt`) is gone. Both callers now draw with
 * `makeTip`'s single deterministic round tip instead — `queueStrokePoints`/
 * `liftStamps` below still do the path smoothing/spacing/taper math (still
 * shared by both callers) but no longer own how a stamp is *drawn*; that's
 * each caller's own business (`ink/brush.ts` draws the tip into its mask
 * canvas, `components/Cursor.tsx` draws it into the cursor canvas).
 */

export type Pt = { x: number; y: number; t: number }
export type StampJob = { x: number; y: number; scale: number; alpha: number; rot: number; dry: boolean; spriteVariant?: number }

/** Per-stroke state: the caller (brush.ts's FigureState, Cursor.tsx's
 * trail engine) owns one of these and passes it into `queueStrokePoints`/
 * `liftStamps`; nothing here reaches back into the caller. */
export interface StrokePath {
  history: Pt[]
  emaSpeed: number
  stampCount: number
  // 2026-09-24 owner feedback ("too sporadic/random"): a real brush stroke
  // has a continuous spine, not a fresh dice-roll every ~4px. These three
  // carry state *across* queueStrokePoints calls so consecutive stamps
  // read as one pass instead of independent noise -- see queueStrokePoints'
  // own comment for how each is used.
  dryState: boolean
  spriteVariant: number
  stampsSinceSpriteRoll: number
  wobble: number
}

export function createStrokePath(): StrokePath {
  return { history: [], emaSpeed: 0, stampCount: 0, dryState: false, spriteVariant: -1, stampsSinceSpriteRoll: 0, wobble: 0 }
}

/** Starts a fresh stroke: clears the smoothing history and speed average,
 * and resets the 起笔 (stroke-start) taper counter so the next stroke's
 * first stamps taper in again instead of picking up mid-width. Also drops
 * the dry/wet hysteresis and forces a fresh sprite-variant roll, so a new
 * stroke never opens mid-texture from whatever the last one ended on. */
export function resetStrokePath(path: StrokePath): void {
  path.history.length = 0
  path.emaSpeed = 0
  path.stampCount = 0
  path.dryState = false
  path.spriteVariant = -1
  path.stampsSinceSpriteRoll = 0
  path.wobble = 0
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function midpoint(a: Pt, b: Pt) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function quadPoint(p0: { x: number; y: number }, ctrl: { x: number; y: number }, p1: { x: number; y: number }, t: number) {
  const mt = 1 - t
  return {
    x: mt * mt * p0.x + 2 * mt * t * ctrl.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * ctrl.y + t * t * p1.y,
  }
}

export function cubicPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) {
  const mt = 1 - t
  const a = mt * mt * mt
  const b = 3 * mt * mt * t
  const c = 3 * mt * t * t
  const d = t * t * t
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
}

// Approximations of the named eases in motion/tokens.ts, re-implemented
// here (rather than imported) since this module stays framework-free.
export const easeCircOut = (t: number) => Math.sqrt(1 - Math.pow(t - 1, 2)) // EASE.bleed
export const easeSineInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2 // EASE.disperse
export const easePower1InOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) // EASE.travel

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const int = parseInt(full, 16) || 0
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/**
 * Interpolates a quadratic path through the last 3 raw points (a standard
 * "curve through midpoints" smoother) and returns stamps spaced every
 * <= .25 * radius along it, so a fast stroke -- or a synthetic multi-
 * hundred-pixel jump -- never leaves a gap (44 §check:transitions B5).
 * Pure: the caller (brush.ts, Cursor.tsx) draws the returned jobs itself,
 * onto whatever canvas/colour it owns.
 */
export function queueStrokePoints(path: StrokePath, x: number, y: number, now: number, radius: number): StampJob[] {
  path.history.push({ x, y, t: now })
  if (path.history.length > 3) path.history.shift()
  if (path.history.length < 2) return []

  const prev = path.history[path.history.length - 2]
  const dt = Math.max(1, now - prev.t)
  const dist = Math.hypot(x - prev.x, y - prev.y)
  path.emaSpeed = path.emaSpeed * 0.7 + (dist / dt) * 0.3

  const heading = Math.atan2(y - prev.y, x - prev.x)
  const normal = heading + Math.PI / 2
  const speedT = clamp(path.emaSpeed, 0, 3)
  const scaleBase = clamp(1.25 - 0.35 * speedT, 0.6, 1.25)
  const alphaBase = clamp(0.95 - 0.25 * speedT, 0.45, 0.95)
  // 2026-09-24 owner feedback ("too sporadic"): a single threshold on a
  // noisy per-event speed estimate flips `dry` back and forth between
  // consecutive stamps whenever emaSpeed hovers near it, which alternates
  // the wet dot-cloud and dry streak sprites stamp-to-stamp -- two visually
  // unrelated textures interleaved reads as noise, not a stroke. Hysteresis
  // (a wider "on" than "off" threshold) makes dry/wet a state that persists
  // across a run of stamps instead of chattering.
  if (path.dryState) {
    if (path.emaSpeed < 0.9) path.dryState = false
  } else if (path.emaSpeed > 1.3) {
    path.dryState = true
  }
  const dry = path.dryState

  // Same complaint, different cause: stampAt used to roll a fresh random
  // wet-sprite variant on *every* stamp, so a run of stamps along one
  // stroke showed unrelated bristle patterns with no visual continuity.
  // Hold one variant for a run of stamps instead, re-rolling only every
  // few, so texture drifts slowly along the stroke rather than flickering.
  const SPRITE_ROLL_STAMPS = 10
  if (path.spriteVariant < 0 || path.stampsSinceSpriteRoll >= SPRITE_ROLL_STAMPS) {
    path.spriteVariant = Math.floor(Math.random() * 3)
    path.stampsSinceSpriteRoll = 0
  }

  // Third complaint: independent per-stamp Math.random() jitter (position
  // *and* rotation) scattered consecutive stamps away from a shared line
  // instead of wavering together like a hand actually holding a brush
  // would. `wobble` is a damped random walk, advanced once per call (not
  // per emitted stamp below) so a burst of interpolated stamps from one
  // event still shares a single offset -- correlated drift, not scatter.
  path.wobble = clamp(path.wobble * 0.85 + (Math.random() - 0.5) * 0.3, -1, 1)
  const lateralJitter = path.wobble * 1.2 // px, was independent +/-2px
  const rotJitter = path.wobble * (Math.PI / 45) // ~+/-4deg, was independent +/-8deg

  // Only 2 raw points exist yet (the very first move after enter) -- there
  // is no earlier point to curve through, so this first hop is a straight
  // line. (A quadratic with ctrl==p0 is *not* the same as a line: it's
  // bowed as (1-t^2)/t^2, which bunches steps near p0 and leaves a gap
  // just before p1.)
  //
  // The curved case ends at the *raw* current point, not at
  // midpoint(history[1], history[2]): ending at that midpoint is the
  // textbook "quadratic through midpoints" smoother, but it structurally
  // lags one point behind, so a stroke that stops moving (or a synthetic
  // multi-hundred-pixel jump with only a couple of events, 44 §check-
  // transitions B5/B6) never paints the last stretch up to the pointer's
  // actual position. Always reaching the current point trades a sliver of
  // corner smoothing (invisible under stamps this size) for guaranteed
  // coverage; each call still bows through the previous point via `ctrl`.
  const useLine = path.history.length < 3
  const p0 = useLine ? prev : midpoint(path.history[0], path.history[1])
  const ctrl = useLine ? prev : path.history[1]
  const p1 = { x, y }

  const approxLength = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const gap = Math.max(2, radius * 0.25)
  const steps = Math.max(1, Math.ceil(approxLength / gap))

  const jobs: StampJob[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const pt = useLine ? { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t } : quadPoint(p0, ctrl, p1, t)
    // 起笔: the stroke's first 3 stamps scale up from .35, so a stroke's
    // head tapers in like a brush touching down instead of starting at
    // full width instantly (46 item 1).
    const pressT = clamp(path.stampCount / 2, 0, 1)
    const pressScale = 0.35 + 0.65 * pressT
    path.stampCount += 1
    path.stampsSinceSpriteRoll += 1
    jobs.push({
      x: pt.x + Math.cos(normal) * lateralJitter,
      y: pt.y + Math.sin(normal) * lateralJitter,
      scale: scaleBase * pressScale,
      alpha: alphaBase,
      rot: heading + rotJitter,
      dry,
      spriteVariant: path.spriteVariant,
    })
  }
  return jobs
}

/**
 * 收笔 (lift): 3 stamps continuing slightly past the stroke's last point
 * along its last heading, shrinking and fading toward nothing -- called
 * once the caller has *confirmed* the stroke actually stopped (brush.ts's
 * pointerleave/up, Cursor's hold timeout), since there is no way to know a
 * given move is the last one until the pointer has already gone quiet.
 * Marked `dry` so the lift itself reads as a thinning, streaked tail.
 */
export function liftStamps(path: StrokePath, radius: number): StampJob[] {
  if (path.history.length < 2) return []
  const last = path.history[path.history.length - 1]
  const prev = path.history[path.history.length - 2]
  const heading = Math.atan2(last.y - prev.y, last.x - prev.x)
  const step = Math.max(3, radius * 0.35)
  const jobs: StampJob[] = []
  const steps = 3
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    jobs.push({
      x: last.x + Math.cos(heading) * step * i,
      y: last.y + Math.sin(heading) * step * i,
      scale: clamp(1 - t * 0.75, 0.2, 1),
      alpha: clamp(0.8 - t * 0.6, 0.15, 0.8),
      rot: heading,
      dry: true,
    })
  }
  return jobs
}

// ---------------------------------------------------------------------
// 47-round3-plan.md §R2 (item 4): a single deterministic round brush tip,
// first built for `components/Cursor.tsx`'s cursor/trail and now also used
// by `ink/brush.ts` (§R3) to paint its mask, replacing the random-sprite
// system (`getSprites`/`stampAt`, deleted) both callers used to draw with.
// `queueStrokePoints`/`liftStamps` above still do the path smoothing/
// spacing/taper math for both callers; only the stamp *drawing* moved to
// this deterministic tip, which is why it's exported from here rather than
// inlined in either caller.
// ---------------------------------------------------------------------

/** Deterministic PRNG (mulberry32), seeded with a fixed constant that is
 * never re-rolled — unlike the deleted sprite system's `Math.random()`
 * calls, the tip's faint bristle texture looks organic but is baked once
 * and reused forever (46/47 owner decision: "no randomness anywhere per
 * stamp"). */
function mulberry32(seed: number) {
  let a = seed
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TIP_SEED = 0x5eed17
const tipCache = new Map<string, CanvasImageSource>()

/**
 * A single round brush-tip bitmap: a dense opaque core with a soft organic
 * silhouette (a low-amplitude fixed-seed radius wobble, not a perfect
 * circle) and a faint fixed-seed speckle grain cut into it. Generated once
 * per `(color, diameterPx, dpr)` and cached — callers scale the cached
 * bitmap to whatever size they need via `drawImage`'s destination rect
 * (Cursor's tapering trail draws it smaller toward the tail) instead of
 * re-baking per stamp. `diameterPx` is CSS px; the canvas itself is
 * `diameterPx * dpr` so it stays crisp at the caller's device resolution
 * (47 §Shared rules: "crisp means device pixels").
 *
 * 2026-09-25 orchestrator fix: the first version's edge texture was radial
 * *lines* (destination-out streaks from centre to rim), which read as wheel
 * spokes at DPR 2 — exactly the "looks like a pattern" failure a brush tip
 * must avoid. Replaced with two fixes that carry no straight radial
 * features at all: the boundary itself is wobbled (below), and the grain
 * is sparse round speckles, not lines.
 */
export function makeTip(color: string, diameterPx: number, dpr: number): CanvasImageSource {
  const key = `${color}|${diameterPx}|${dpr}`
  const cached = tipCache.get(key)
  if (cached) return cached
  const size = Math.max(2, Math.round(diameterPx * dpr))
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : document.createElement('canvas')
  if (!(canvas instanceof OffscreenCanvas)) {
    canvas.width = size
    canvas.height = size
  }
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (ctx) {
    const [r, g, b] = hexToRgb(color)
    const cx = size / 2
    const cy = size / 2
    const radius = size / 2
    const rand = mulberry32(TIP_SEED)

    // Dense core with a defined edge: two fixed-seed sine harmonics (low
    // frequencies, incommensurate 3/5 so they never fall into a symmetric
    // "petal" pattern) perturb the boundary radius by a combined ~3-5%, so
    // the silhouette is a soft irregular blob rather than a perfect disc.
    // The canvas rasteriser's own path fill AA (~1 device px coverage) is
    // the edge softness — no gradient or blur needed, and never a glow.
    const harmonics = [3, 5].map((freq) => ({ freq, phase: rand() * Math.PI * 2, amp: 0.015 + rand() * 0.015 }))
    const steps = 48
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2
      let wobble = 0
      for (const h of harmonics) wobble += Math.sin(angle * h.freq + h.phase) * h.amp
      const rr = radius * (1 + wobble)
      const x = cx + Math.cos(angle) * rr
      const y = cy + Math.sin(angle) * rr
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fill()

    // Faint fixed-seed speckle grain — sparse low-alpha round dots cut out
    // with `destination-out`, no line features anywhere, so the tip reads
    // as soft-bristled rather than a flat disc without ever reading as a
    // deliberate pattern.
    ctx.globalCompositeOperation = 'destination-out'
    const speckles = 36
    for (let i = 0; i < speckles; i++) {
      const angle = rand() * Math.PI * 2
      const dist = Math.sqrt(rand()) * radius * 0.85
      const sx = cx + Math.cos(angle) * dist
      const sy = cy + Math.sin(angle) * dist
      const sr = Math.max(0.4, radius * (0.012 + rand() * 0.018))
      ctx.globalAlpha = 0.04 + rand() * 0.06
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  }
  tipCache.set(key, canvas as CanvasImageSource)
  return canvas as CanvasImageSource
}

/**
 * Catmull-Rom through 4 points, evaluated at `t` in [0,1] for the segment
 * between `p1` and `p2` (`p0`/`p3` only shape the tangents at each end).
 * `Cursor.tsx` uses this to resample its raw pointer samples into a dense,
 * smoothed spine for the tapering trail (47 §R2: "a smoothed spine
 * (Catmull-Rom through pointer samples)") — a different curve than
 * `quadPoint`'s quadratic-through-midpoints above, which stays as-is for
 * brush.ts.
 */
export function catmullRomPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
) {
  const t2 = t * t
  const t3 = t2 * t
  const c = (a: number, b: number, cc: number, d: number) =>
    0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3)
  return { x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) }
}
