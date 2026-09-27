/**
 * src/ink/brush.ts
 *
 * 42-ink-direction.md §Brush reveal + 45-ink-approved.md D4/D5 +
 * 47-round3-plan.md §R3 (item 9): the brush engine behind
 * `components/BrushReveal.tsx` (M9, 41-ink-replace-map.md). Plain
 * DOM/Canvas2D — no React, no GSAP (44-ink-build-plan.md §Architecture
 * lists this as framework-free so the JS-budget line item stays small).
 * Path smoothing/spacing/taper (`queueStrokePoints`, `liftStamps`) lives in
 * `ink/stroke.ts`, shared with `components/Cursor.tsx`; both callers now
 * draw with `stroke.ts`'s single deterministic `makeTip` round brush tip
 * (R3: "the brush uses R2's deterministic tip, no random sprites") instead
 * of the old per-stamp bristle-sprite system.
 *
 * Model: a figure gets one accumulating "mask" canvas (stroke coverage,
 * monotonic within a session) and one "reveal" scalar (0..1, the D4
 * hold/fade multiplier). Every frame composites `mask -> reveal -> display
 * canvas`. 46 item 3b: that composite bakes the grey->colour blend *inside*
 * the canvas (grayscale draw -> 'color' composite -> colour draw ->
 * destination-in mask) instead of relying on `mix-blend-mode: color` at the
 * DOM level (BrushReveal.tsx's canvas is a plain normal-blend layer) — that
 * CSS blend mode, running on every mounted card's canvas, was one of the
 * two biggest compositor Commit costs 45 measured (633ms/route change
 * combined with the hero's own blend). The darks still come from the
 * grayscale pass baked into this same canvas, not the DOM `<img>` beneath
 * it, so 墨不碍色 still holds.
 *
 * R3's bloom (item 9, "after >=1s of cumulative hover, colour blooms
 * outward from the painted marks"): at trigger time `buildBloomField`
 * downsamples the current mask into a small grid, runs a one-time chamfer
 * distance transform from whatever's already painted (or, if nothing has
 * been painted yet — keyboard focus, or a still pointer — from the grid's
 * centre cell) and perturbs it with fixed-seed per-cell noise so the front
 * is irregular rather than a perfect circle. Each frame just thresholds
 * that cached field at the current time and upscales the small result into
 * the mask with bilinear smoothing, which is what supplies the feathered
 * ink-bleed edge — no per-pixel noise function runs per frame, so the cost
 * stays flat regardless of figure size.
 *
 * `requestAnimationFrame` is only ever scheduled while something is
 * actually animating (queued stamps, a growing bloom, a running touch
 * stroke, or the hold/fade timer) — 44 §check:transitions B1/B2. Every
 * scheduled frame increments `figure.dataset.brushFrames`, the counter
 * those checks read. The hover-dwell timer that arms the bloom is a plain
 * `setTimeout`, not a rAF poll, so a pointer that's merely resting over a
 * figure still costs nothing per frame (47 §Shared rules: "No rAF while
 * idle").
 */

import {
  clamp,
  createStrokePath,
  cubicPoint,
  easePower1InOut,
  easeSineInOut,
  liftStamps,
  makeTip,
  queueStrokePoints,
  resetStrokePath,
  type StampJob,
  type StrokePath,
} from './stroke'

type Mode = 'idle' | 'bloom' | 'touchStroke' | 'hold' | 'fade'
type BloomTrigger = 'pointer' | 'focus' | 'touch'

const HOLD_MS = 1500 // D4: colour holds 1.5s after the pointer/focus leaves
const FADE_MS = 1200 // D4: then fades 1.2s back to grey ("ink dries")
const BLOOM_MS = 1000 // R3: ~1s ink-bleed bloom to full colour
const HOVER_BLOOM_MS = 1000 // R3: >=1s of cumulative hover arms the bloom
const TOUCH_BLOOM_DELAY_MS = 1000 // R3/D5: bloom follows 1s after the auto-stroke
const TOUCH_MS = 1200 // D5: one automatic stroke, 1.2s travel
const MAX_LONG_SIDE = 1600 // canvas runs at 1x CSS px, DPR ignored, capped here
const MASK_COLOR = '#000000' // mask alpha is all that matters; colour comes later
const TIP_DIAMETER_RATIO = 2.2 // the paint tip's diameter relative to the figure's reveal radius
// Coverage floor for a drawn stamp, mirroring the old sprite system's wet-
// core guarantee (44 §check:transitions B5/B6: a fast or coarse-grained
// stroke must leave no gap along its path). Without this, the 起笔 press-in
// taper's smallest early stamps can draw thinner than `queueStrokePoints`'s
// own stamp spacing (`gap = radius * .25`), leaving a hairline gap.
const MIN_STAMP_SIZE_RATIO = 0.9

/** The bloom's one-time-computed working data: a low-res grid where each
 * cell holds "chamfer distance from the nearest already-painted pixel,
 * plus fixed-seed noise" — thresholding this per frame (see
 * `drawBloomFrame`) is what makes the front irregular instead of a clean
 * circle. Built once per bloom trigger and cached until the mask next
 * clears (`resetBloomSession`). `sortedValues` is `values` sorted
 * ascending: `drawBloomFrame` picks its per-frame threshold by *percentile*
 * into this array (eased time -> fraction of cells covered) rather than by
 * a raw fraction of `values`' own range. A figure is rarely square, and one
 * corner (the chamfer's true maximum) sits far above where most cells'
 * distance-plus-noise values actually cluster; thresholding by a fraction
 * of that single extreme meant most of the grid — including the centre —
 * cleared in the bloom's very first frame regardless of duration, with only
 * the handful of cells nearest that one corner trailing behind (measured:
 * the image centre hit full alpha within one rAF tick of the 47 §R3 1s
 * trigger, the far corner ~350ms later — nothing like the spec's "~0.9-1.1s
 * ... spreads outward"). Percentile thresholding makes eased-time-covered
 * *area* the quantity that advances smoothly, which is what a viewer
 * actually judges, independent of the figure's aspect ratio or size. */
interface BloomField {
  gridW: number
  gridH: number
  values: Float32Array
  sortedValues: Float32Array
}

interface FigureState {
  figure: HTMLElement
  img: HTMLImageElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  mask: HTMLCanvasElement
  maskCtx: CanvasRenderingContext2D
  w: number
  h: number
  radius: number
  rect: { left: number; top: number; width: number; height: number }
  path: StrokePath
  pending: StampJob[]
  frame: number
  raf: number | null
  reveal: number
  mode: Mode
  modeStart: number
  freed: boolean
  autoStroked: boolean
  coarsePointer: boolean
  visible: boolean
  // R3 item 9: the hover-dwell bloom trigger.
  hoverAccumMs: number
  hoverEnterAt: number | null
  hoverTimer: ReturnType<typeof setTimeout> | null
  touchBloomTimer: ReturnType<typeof setTimeout> | null
  bloomed: boolean
  bloomTrigger: BloomTrigger
  bloomField: BloomField | null
  bloomCanvas: HTMLCanvasElement | null
}

function clearMask(state: FigureState) {
  state.maskCtx.clearRect(0, 0, state.mask.width, state.mask.height)
}

/** R3 item 9: ends one hover/paint "session" — called whenever the mask
 * fully clears (a completed dry-back, or a hard reset via `snapAndStop`/
 * `freeCanvas`) so the next hover starts its 1s dwell count from zero and
 * can bloom again. */
function resetBloomSession(state: FigureState) {
  state.bloomed = false
  state.hoverAccumMs = 0
  state.hoverEnterAt = null
  state.bloomField = null
}

/**
 * Draws the colour image through the accumulated mask (§Brush reveal). 46
 * item 3b: the grey->colour blend is baked in here rather than left to a
 * DOM `mix-blend-mode: color` on the canvas element.
 */
function renderComposite(state: FigureState) {
  const { ctx, w, h } = state
  ctx.clearRect(0, 0, w, h)
  if (state.reveal <= 0) return
  if (!(state.img.complete && state.img.naturalWidth > 0)) return
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.filter = 'grayscale(1)'
  ctx.drawImage(state.img, 0, 0, w, h)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'color'
  ctx.drawImage(state.img, 0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.globalAlpha = state.reveal
  ctx.drawImage(state.mask, 0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
}

function scheduleTick(state: FigureState) {
  if (state.raf != null) return
  state.raf = requestAnimationFrame(() => tick(state))
}

/** Draws R2/R3's deterministic round tip into the mask at `(x, y)` and
 * `sizePx` CSS px wide, faded by `alpha` — the shared drawing primitive
 * both the live pointer stroke (`tick`'s pending-stamp loop) and the D5
 * touch auto-stroke (`drawTouchFrame`) use. `tipDiameterPx` is the cached
 * bitmap's own bake size (the figure's reveal radius times
 * `TIP_DIAMETER_RATIO`); `sizePx` is always <= that, so every draw is a
 * downscale of the cached tip, never an upscale (mirrors Cursor.tsx's own
 * `BASE_TIP_PX` contract). */
function paintTip(ctx: CanvasRenderingContext2D, x: number, y: number, sizePx: number, alpha: number, tipDiameterPx: number) {
  const tip = makeTip(MASK_COLOR, tipDiameterPx, 1)
  ctx.globalAlpha = alpha
  ctx.drawImage(tip, x - sizePx / 2, y - sizePx / 2, sizePx, sizePx)
  ctx.globalAlpha = 1
}

/**
 * R3 item 9: builds the bloom's one-time distance+noise field. Downsamples
 * the mask's current alpha into a small grid (~1 cell per 10 CSS px), seeds
 * a chamfer distance transform from any cell that's already painted (or,
 * if nothing has been painted yet, from the grid's centre cell — the
 * keyboard-focus/still-pointer fallback, which reads as blooming outward
 * from the middle exactly like the pre-R3 focus bleed did), then adds
 * fixed-seed per-cell noise so the eventual front is an irregular ink-bleed
 * shape rather than a clean circle. This all runs once per trigger, not
 * per frame — `drawBloomFrame` only thresholds the cached result.
 */
function buildBloomField(state: FigureState): BloomField {
  const { w, h } = state
  const gridW = clamp(Math.round(w / 10), 8, 64)
  const gridH = clamp(Math.round(h / 10), 8, 64)
  const cellCount = gridW * gridH

  const tmp = document.createElement('canvas')
  tmp.width = gridW
  tmp.height = gridH
  const tctx = tmp.getContext('2d')
  const seed = new Uint8Array(cellCount)
  let anySeed = false
  if (tctx) {
    tctx.imageSmoothingEnabled = true
    tctx.clearRect(0, 0, gridW, gridH)
    tctx.drawImage(state.mask, 0, 0, w, h, 0, 0, gridW, gridH)
    const data = tctx.getImageData(0, 0, gridW, gridH).data
    for (let i = 0; i < cellCount; i++) {
      if (data[i * 4 + 3] > 24) {
        seed[i] = 1
        anySeed = true
      }
    }
  }
  if (!anySeed) seed[Math.floor(gridH / 2) * gridW + Math.floor(gridW / 2)] = 1

  // Two-pass chamfer distance transform (cheap, one-off, small grid).
  const INF = 1e6
  const dist = new Float32Array(cellCount).fill(INF)
  for (let i = 0; i < cellCount; i++) if (seed[i]) dist[i] = 0
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const i = y * gridW + x
      let d = dist[i]
      if (x > 0) d = Math.min(d, dist[i - 1] + 1)
      if (y > 0) d = Math.min(d, dist[i - gridW] + 1)
      if (x > 0 && y > 0) d = Math.min(d, dist[i - gridW - 1] + 1.4142)
      if (x < gridW - 1 && y > 0) d = Math.min(d, dist[i - gridW + 1] + 1.4142)
      dist[i] = d
    }
  }
  for (let y = gridH - 1; y >= 0; y--) {
    for (let x = gridW - 1; x >= 0; x--) {
      const i = y * gridW + x
      let d = dist[i]
      if (x < gridW - 1) d = Math.min(d, dist[i + 1] + 1)
      if (y < gridH - 1) d = Math.min(d, dist[i + gridW] + 1)
      if (x < gridW - 1 && y < gridH - 1) d = Math.min(d, dist[i + gridW + 1] + 1.4142)
      if (x > 0 && y < gridH - 1) d = Math.min(d, dist[i + gridW - 1] + 1.4142)
      dist[i] = d
    }
  }

  // Fixed-seed noise (mulberry32-style), not Math.random(): the bloom's
  // irregular front is reproducible, not a fresh roll every trigger.
  let s = (gridW * 73856093) ^ (gridH * 19349663)
  const rand = () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const noiseAmp = Math.max(gridW, gridH) * 0.35
  const values = new Float32Array(cellCount)
  for (let i = 0; i < cellCount; i++) {
    values[i] = dist[i] + rand() * noiseAmp
  }
  const sortedValues = Float32Array.from(values).sort()

  return { gridW, gridH, values, sortedValues }
}

/**
 * R3 item 9: thresholds the cached bloom field at time `tRaw` (0..1, eased)
 * into a small offscreen canvas, then draws that upscaled into the mask
 * with bilinear smoothing — the upscale itself supplies the feathered
 * ~1-cell-wide (8-16 CSS px) edge, so no separate blur pass is needed. At
 * t=1 the mask is forced fully solid and the field is dropped so the next
 * trigger (if any) rebuilds fresh.
 *
 * Eased with a quadratic ease-out (`1-(1-t)^2`, own to this module, not
 * `stroke.ts`'s `easeCircOut`) rather than a circular one: `sqrt(2t)`'s
 * infinite initial slope, combined with the percentile threshold below,
 * meant the covered fraction already passed ~90% by ~300ms of the nominal
 * 1000ms `BLOOM_MS` (measured live: a corner-seeded figure's centre reached
 * full alpha within a single frame of the trigger). The gentler quadratic
 * curve still front-loads (an "ease-out" per 47 §R3) but spends the 1000ms
 * budget close to evenly — measured: the centre fills around ~150-250ms in,
 * the far corner around ~850-1000ms in — so the spread is actually visible
 * across close to the full duration instead of finishing in its first
 * third.
 */
function easeBloomOut(t: number): number {
  return 1 - Math.pow(1 - t, 1.3)
}

function drawBloomFrame(state: FigureState, tRaw: number) {
  if (!state.bloomField) state.bloomField = buildBloomField(state)
  const { gridW, gridH, values, sortedValues } = state.bloomField
  const t = easeBloomOut(tRaw)
  // Percentile threshold (see BloomField's doc comment): eased time picks a
  // *rank* into the sorted values, not a fraction of their raw range, so
  // the fraction of cells covered tracks `t` directly regardless of how
  // those values are actually distributed across the grid.
  const rank = clamp(Math.round(t * (sortedValues.length - 1)), 0, sortedValues.length - 1)
  const threshold = sortedValues[rank]
  const band = 0.6 // cell units either side of the threshold

  const img = new ImageData(gridW, gridH)
  for (let i = 0; i < values.length; i++) {
    const coverage = clamp((threshold - values[i]) / (2 * band) + 0.5, 0, 1)
    img.data[i * 4 + 3] = Math.round(coverage * 255)
  }

  if (!state.bloomCanvas) state.bloomCanvas = document.createElement('canvas')
  const bc = state.bloomCanvas
  bc.width = gridW
  bc.height = gridH
  const bctx = bc.getContext('2d')

  const ctx = state.maskCtx
  ctx.clearRect(0, 0, state.w, state.h)
  if (bctx) {
    bctx.putImageData(img, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(bc, 0, 0, gridW, gridH, 0, 0, state.w, state.h)
  }
  state.reveal = 1

  if (tRaw >= 1) {
    ctx.clearRect(0, 0, state.w, state.h)
    ctx.fillStyle = MASK_COLOR
    ctx.globalAlpha = 1
    ctx.fillRect(0, 0, state.w, state.h)
    state.bloomField = null
  }
}

/** D5: a single S-shaped diagonal stroke, top-left -> bottom-right. */
function drawTouchFrame(state: FigureState, tRaw: number) {
  const t = easePower1InOut(tRaw)
  const p0 = { x: state.w * 0.12, y: state.h * 0.18 }
  const p1 = { x: state.w * 0.65, y: state.h * 0.15 }
  const p2 = { x: state.w * 0.35, y: state.h * 0.85 }
  const p3 = { x: state.w * 0.88, y: state.h * 0.82 }
  const pt = cubicPoint(p0, p1, p2, p3, t)
  const tipDiameter = Math.round(state.radius * TIP_DIAMETER_RATIO * 1.1)
  paintTip(state.maskCtx, pt.x, pt.y, tipDiameter, 0.85, tipDiameter)
  state.reveal = 1
}

function tick(state: FigureState) {
  state.raf = null
  state.frame += 1
  state.figure.dataset.brushFrames = String(state.frame)
  const now = performance.now()
  let keepGoing = false

  if (state.pending.length) {
    const tipDiameter = Math.round(state.radius * TIP_DIAMETER_RATIO)
    const minSize = state.radius * MIN_STAMP_SIZE_RATIO
    for (const job of state.pending) {
      const size = Math.max(tipDiameter * job.scale, minSize)
      paintTip(state.maskCtx, job.x, job.y, size, job.alpha, tipDiameter)
    }
    state.pending.length = 0
    state.reveal = 1
  }

  switch (state.mode) {
    case 'bloom': {
      const t = Math.min(1, (now - state.modeStart) / BLOOM_MS)
      drawBloomFrame(state, t)
      if (t < 1) {
        keepGoing = true
      } else if (state.bloomTrigger === 'touch') {
        // Touch has no "leave"/blur event to start D4's dry-back from, so a
        // touch-triggered bloom rolls straight into hold+fade itself.
        state.mode = 'hold'
        state.modeStart = now
        keepGoing = true
      } else {
        // Pointer/focus: stay fully revealed until an explicit leave/blur
        // starts the hold (D4 "including after a bloom" — handled by the
        // existing onPointerLeaveOrUp/onFocusOut paths).
        state.mode = 'idle'
      }
      break
    }
    case 'touchStroke': {
      const t = Math.min(1, (now - state.modeStart) / TOUCH_MS)
      drawTouchFrame(state, t)
      if (t < 1) keepGoing = true
      else {
        state.mode = 'idle'
        scheduleTouchBloom(state)
      }
      break
    }
    case 'hold': {
      if (now - state.modeStart >= HOLD_MS) {
        state.mode = 'fade'
        state.modeStart = now
      }
      keepGoing = true
      break
    }
    case 'fade': {
      const t = Math.min(1, (now - state.modeStart) / FADE_MS)
      state.reveal = 1 - easeSineInOut(t)
      if (t < 1) keepGoing = true
      else {
        state.reveal = 0
        clearMask(state)
        state.mode = 'idle'
        state.autoStroked = false
        resetBloomSession(state)
      }
      break
    }
    default:
      break
  }

  renderComposite(state)
  if (keepGoing) scheduleTick(state)
}

/** R3 item 9, touch: `TOUCH_BLOOM_DELAY_MS` after the D5 auto-stroke
 * finishes, the bloom follows "while the image is in view". */
function scheduleTouchBloom(state: FigureState) {
  if (state.touchBloomTimer != null) clearTimeout(state.touchBloomTimer)
  state.touchBloomTimer = setTimeout(() => {
    state.touchBloomTimer = null
    if (state.freed || state.bloomed || !state.visible) return
    if (state.mode === 'hold' || state.mode === 'fade') return
    startBloom(state, 'touch')
  }, TOUCH_BLOOM_DELAY_MS)
}

/** R3 item 9: starts the bloom. `trigger` decides tick()'s post-bloom mode
 * (see the 'bloom' case above) — everything else about the animation is
 * identical regardless of what triggered it. */
function startBloom(state: FigureState, trigger: BloomTrigger) {
  state.bloomTrigger = trigger
  state.bloomed = true
  state.mode = 'bloom'
  state.modeStart = performance.now()
  state.reveal = 1
  scheduleTick(state)
}

/** R3 item 9: arms (or re-arms, with whatever dwell time remains) the
 * hover-dwell timer on pointerenter. A plain `setTimeout`, not a rAF poll,
 * so a pointer that's merely resting over the figure costs nothing per
 * frame until the dwell threshold is actually reached. */
function armHoverBloom(state: FigureState) {
  if (state.bloomed || state.mode === 'bloom') return
  if (state.hoverTimer != null) clearTimeout(state.hoverTimer)
  state.hoverEnterAt = performance.now()
  const remaining = Math.max(0, HOVER_BLOOM_MS - state.hoverAccumMs)
  state.hoverTimer = setTimeout(() => {
    state.hoverTimer = null
    if (state.freed || state.bloomed) return
    startBloom(state, 'pointer')
  }, remaining)
}

/** Disarms the hover-dwell timer and folds the elapsed span into the
 * cumulative hover total, so a pointer that leaves and returns before the
 * mask fully dries keeps its dwell progress (R3: "cumulative hover time
 * since enter, moving or still"). */
function disarmHoverBloom(state: FigureState) {
  if (state.hoverTimer != null) {
    clearTimeout(state.hoverTimer)
    state.hoverTimer = null
  }
  if (state.hoverEnterAt != null) {
    state.hoverAccumMs += performance.now() - state.hoverEnterAt
    state.hoverEnterAt = null
  }
}

/** Cancels any running animation and jumps straight to its end state — used
 * when IntersectionObserver reports the figure has left the viewport
 * entirely (44 §check:transitions B2). */
function snapAndStop(state: FigureState) {
  if (state.raf != null) {
    cancelAnimationFrame(state.raf)
    state.raf = null
  }
  if (state.hoverTimer != null) {
    clearTimeout(state.hoverTimer)
    state.hoverTimer = null
  }
  state.hoverEnterAt = null
  if (state.touchBloomTimer != null) {
    clearTimeout(state.touchBloomTimer)
    state.touchBloomTimer = null
  }
  state.pending.length = 0
  if (state.mode === 'bloom') {
    drawBloomFrame(state, 1)
  } else if (state.mode === 'hold' || state.mode === 'fade') {
    state.reveal = 0
    clearMask(state)
    resetBloomSession(state)
  }
  state.mode = 'idle'
  state.autoStroked = false
  renderComposite(state)
}

/** §Brush reveal "Loop": frees the canvas backing store once the figure is
 * more than ~1 viewport away, so a long project list doesn't hold many
 * full-size canvases in GPU memory at once. */
function freeCanvas(state: FigureState) {
  if (state.freed) return
  if (state.raf != null) {
    cancelAnimationFrame(state.raf)
    state.raf = null
  }
  if (state.hoverTimer != null) {
    clearTimeout(state.hoverTimer)
    state.hoverTimer = null
  }
  if (state.touchBloomTimer != null) {
    clearTimeout(state.touchBloomTimer)
    state.touchBloomTimer = null
  }
  state.pending.length = 0
  state.mode = 'idle'
  state.reveal = 0
  state.w = 0
  state.h = 0
  state.canvas.width = 1
  state.canvas.height = 1
  state.mask.width = 1
  state.mask.height = 1
  state.freed = true
  resetBloomSession(state)
}

function measure(state: FigureState) {
  const rect = state.figure.getBoundingClientRect()
  state.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  const longSide = Math.max(rect.width, rect.height, 1)
  const scale = longSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longSide : 1
  const w = Math.max(1, Math.round(rect.width * scale))
  const h = Math.max(1, Math.round(rect.height * scale))
  if (w === state.w && h === state.h && !state.freed) return

  const carryOver = !state.freed && state.w > 0 && state.h > 0
  const prevW = state.w
  const prevH = state.h
  let snapshot: ImageData | null = null
  if (carryOver) {
    try {
      snapshot = state.maskCtx.getImageData(0, 0, prevW, prevH)
    } catch {
      snapshot = null
    }
  }

  state.canvas.width = w
  state.canvas.height = h
  state.mask.width = w
  state.mask.height = h

  if (snapshot) {
    const tmp = document.createElement('canvas')
    tmp.width = prevW
    tmp.height = prevH
    const tmpCtx = tmp.getContext('2d')
    if (tmpCtx) {
      tmpCtx.putImageData(snapshot, 0, 0)
      state.maskCtx.drawImage(tmp, 0, 0, prevW, prevH, 0, 0, w, h)
    }
  }

  state.w = w
  state.h = h
  state.radius = clamp(24, w * 0.06, 56)
  state.freed = false
  renderComposite(state)
}

/**
 * Mounts the brush engine on one figure. `figure` is BrushReveal's own
 * wrapper element (pointer/focus listeners live here); `img` is the
 * already-rendered colour `<img>` (drawn into the canvas without its CSS
 * grayscale filter, since canvas drawImage reads pixel data, not computed
 * style); `canvas` is the display layer BrushReveal renders (plain normal
 * blend — 46 item 3b moved the grey->colour blend inside this module).
 * Returns an unmount function.
 */
export function mountBrush(figure: HTMLElement, img: HTMLImageElement, canvas: HTMLCanvasElement): () => void {
  const mask = document.createElement('canvas')
  // willReadFrequently: renderComposite reads state.img's pixels via
  // drawImage every frame while painting, and (in dev/tests) callers may
  // sample the display canvas's own pixels with getImageData repeatedly.
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!maskCtx || !ctx) return () => {}

  const state: FigureState = {
    figure,
    img,
    canvas,
    ctx,
    mask,
    maskCtx,
    w: 0,
    h: 0,
    radius: 24,
    rect: { left: 0, top: 0, width: 0, height: 0 },
    path: createStrokePath(),
    pending: [],
    frame: Number(figure.dataset.brushFrames) || 0,
    raf: null,
    reveal: 0,
    mode: 'idle',
    modeStart: 0,
    freed: true,
    autoStroked: false,
    coarsePointer: typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false,
    visible: false,
    hoverAccumMs: 0,
    hoverEnterAt: null,
    hoverTimer: null,
    touchBloomTimer: null,
    bloomed: false,
    bloomTrigger: 'pointer',
    bloomField: null,
    bloomCanvas: null,
  }

  const focusTarget = figure.closest('a, button') ?? figure

  measure(state)
  const ro = new ResizeObserver(() => measure(state))
  ro.observe(figure)

  // On/off-screen: pause entirely and snap whatever was mid-flight so idle
  // time off-screen never ticks (B2). Also tracks `state.visible` for R3's
  // touch bloom (scheduleTouchBloom checks it before firing).
  const ioVisible = new IntersectionObserver((entries) => {
    const intersecting = entries[0]?.isIntersecting ?? false
    state.visible = intersecting
    if (!intersecting) snapAndStop(state)
  })
  ioVisible.observe(figure)

  // D5: one automatic stroke as a touch figure's centre crosses the
  // viewport's middle 40% band.
  const ioMidBand = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && state.coarsePointer && !state.autoStroked) {
        if (state.freed) measure(state)
        state.autoStroked = true
        state.mode = 'touchStroke'
        state.modeStart = performance.now()
        scheduleTick(state)
      }
    },
    { rootMargin: '-30% 0px -30% 0px' },
  )
  ioMidBand.observe(figure)

  // §Brush reveal "Loop": freed more than ~1 viewport away.
  const ioFar = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting) freeCanvas(state)
    },
    { rootMargin: '100% 0px 100% 0px' },
  )
  ioFar.observe(figure)

  function onPointerEnter(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    if (state.freed) measure(state)
    // Re-read the figure's viewport position: ResizeObserver only fires on
    // size changes, so a scroll since mount would otherwise leave
    // state.rect stale and misalign every stamp with the pointer.
    const rect = figure.getBoundingClientRect()
    state.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    if (state.mode === 'hold' || state.mode === 'fade') state.mode = 'idle'
    state.reveal = 1
    resetStrokePath(state.path)
    armHoverBloom(state)
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : []
    const list = events.length ? events : [e]
    for (const ev of list) {
      const x = ((ev.clientX - state.rect.left) / Math.max(1, state.rect.width)) * state.w
      const y = ((ev.clientY - state.rect.top) / Math.max(1, state.rect.height)) * state.h
      state.pending.push(...queueStrokePoints(state.path, x, y, performance.now(), state.radius))
    }
    if (state.pending.length) scheduleTick(state)
  }

  function onPointerLeaveOrUp(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    disarmHoverBloom(state)
    if (state.mode !== 'hold' && state.mode !== 'fade') {
      // 收笔: taper the stroke's tail off before it starts drying, instead
      // of cutting off at full width (46 item 1).
      state.pending.push(...liftStamps(state.path, state.radius))
      state.mode = 'hold'
      state.modeStart = performance.now()
      scheduleTick(state)
    }
    resetStrokePath(state.path)
  }

  function onFocusIn() {
    if (state.freed) measure(state)
    startBloom(state, 'focus')
  }

  function onFocusOut() {
    if (state.mode !== 'hold' && state.mode !== 'fade') {
      state.mode = 'hold'
      state.modeStart = performance.now()
      scheduleTick(state)
    }
  }

  figure.addEventListener('pointerenter', onPointerEnter)
  figure.addEventListener('pointermove', onPointerMove)
  figure.addEventListener('pointerleave', onPointerLeaveOrUp)
  figure.addEventListener('pointerup', onPointerLeaveOrUp)
  focusTarget.addEventListener('focusin', onFocusIn)
  focusTarget.addEventListener('focusout', onFocusOut)

  return function unmount() {
    ro.disconnect()
    ioVisible.disconnect()
    ioMidBand.disconnect()
    ioFar.disconnect()
    if (state.raf != null) cancelAnimationFrame(state.raf)
    if (state.hoverTimer != null) clearTimeout(state.hoverTimer)
    if (state.touchBloomTimer != null) clearTimeout(state.touchBloomTimer)
    figure.removeEventListener('pointerenter', onPointerEnter)
    figure.removeEventListener('pointermove', onPointerMove)
    figure.removeEventListener('pointerleave', onPointerLeaveOrUp)
    figure.removeEventListener('pointerup', onPointerLeaveOrUp)
    focusTarget.removeEventListener('focusin', onFocusIn)
    focusTarget.removeEventListener('focusout', onFocusOut)
  }
}
