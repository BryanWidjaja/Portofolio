/**
 * src/ink/brush.ts
 *
 * 42-ink-direction.md §Brush reveal + 45-ink-approved.md D4/D5 +
 * 49-round4-plan.md §E2 (R4-4 in 41-ink-replace-map.md): the brush engine
 * behind `components/BrushReveal.tsx`. Plain DOM, no React, no GSAP.
 *
 * What it does (unchanged from R4-4/R4-4b/R4-4c): the moment the pointer
 * enters a figure (or it gets keyboard focus, or a touch figure's centre
 * crosses the viewport's middle band), colour splashes outward from that
 * entry point as one irregular, fibrous ink blob and covers the whole
 * figure in `BLOOM_MS`. Once the pointer/focus leaves, the colour holds
 * `HOLD_MS`, then dries back over `FADE_MS` -- the splash run in reverse, so
 * the outer edge dries first and the entry point last. A splash can't be
 * cancelled, and re-entering a figure that is still splashing, holding or
 * drying never restarts it (R4-4b fix 2, R4-4c).
 *
 * How it does it (2026-09-28 performance rewrite). The old engine
 * composited pixels on two `<canvas>`es every animation frame: a full-size
 * `filter: grayscale(1)` draw, a `color`-blend draw and a `destination-in`
 * mask draw of the colour image, on contexts created with
 * `willReadFrequently` (which pins them to CPU raster). Measured at the
 * home lead card's 1280x630 under a 4x CPU throttle, that was ~177ms per
 * frame (grayscale 122, colour blend 31, mask 24) -- a p95 frame of
 * 100-150ms whenever a card was painting. None of it was necessary: the
 * grey base is already its own pre-baked `<img>` underneath, so all the
 * canvas ever produced was the colour image, masked by a blob.
 *
 * Now the colour `<img>` itself sits on top of the grey one and is clipped
 * by the blob, as a CSS `clip-path: polygon()`. Each splash precomputes its
 * blob at `KEYFRAMES` points in time and hands them to the Web Animations
 * API, which interpolates the polygon natively: no JavaScript runs per
 * frame, no canvas, no per-pixel compositing -- the browser just repaints
 * one clipped image layer. The colour image also renders at full device
 * resolution now, where the canvas ran at 1x CSS px. Coordinates are
 * percentages of the figure, so a resize mid-splash stretches the blob
 * instead of misplacing it.
 *
 * The blob itself is the same shape as before: `SPLASH_RAYS` rays around
 * the entry point, each with its own fixed-seed speed (smoothed so the
 * front reads as a few broad tendrils), each ray's radius
 * `maxRadius * min(1, s * speed)` for a shared progress `s`. The canvas
 * version drew a quadratic curve through the rays' midpoints; this samples
 * that same curve (two points per ray) into the polygon's vertices.
 *
 * `figure.dataset.brushFrames` counts animation *segments* started (a
 * splash, a dry-back), so check:transitions' B1/B2 can still assert the
 * engine goes quiet when idle and off-screen.
 */

type Mode = 'idle' | 'bloom' | 'hold' | 'fade'
type BloomTrigger = 'pointer' | 'focus' | 'touch'

const HOLD_MS = 1500 // D4: colour holds 1.5s after the pointer/focus leaves
const FADE_MS = 1200 // D4: then fades 1.2s back to grey ("ink dries")
const BLOOM_MS = 1500 // R4-4b fix 1: ~1.5s ink-splash spread from the entry point to full coverage
// Angular samples of the splash's irregular front around the entry point.
const SPLASH_RAYS = 48
// Each ray's own speed is 1..1+this, so some tendrils race ahead of others.
// Always >= 1, so every ray reaches full radius by s=1.
const SPLASH_SPEED_JITTER = 0.6
// Blob snapshots per splash/dry-back handed to the Web Animations API,
// which interpolates between them. One every ~50ms reads as continuous.
const KEYFRAMES = 30
// The curve through the rays' midpoints sags ~0.3% inside the rays' own
// circle, so the last snapshot overshoots slightly to be sure it covers the
// farthest corner.
const FULL_OVERSHOOT = 1.01
// Nothing visible: all vertices on one point. Same vertex count as a blob,
// so the browser can interpolate between them.
const EMPTY_CLIP = `polygon(${Array.from({ length: SPLASH_RAYS * 2 }, () => '0% 0%').join(', ')})`

interface BloomField {
  originX: number
  originY: number
  maxRadius: number
  speeds: Float32Array
  w: number
  h: number
}

interface FigureState {
  figure: HTMLElement
  colour: HTMLImageElement
  segments: number
  mode: Mode
  animation: Animation | null
  holdTimer: number | null
  touchSplashed: boolean
  coarsePointer: boolean
  engaged: boolean // pointer is over, or focus is on, the figure right now
  pointerInside: boolean // R4-4c: pointer specifically (vs. focus) -- decides the fade-completion re-arm's origin
  focusInside: boolean
  lastPointerX: number // R4-4c: last known pointer position, CSS px within the figure
  lastPointerY: number
  bloomed: boolean // a splash session is live (splashing, full, holding or drying)
  bloomTrigger: BloomTrigger
  field: BloomField | null
}

/** R4-4b fix 4: publishes "this figure is fully painted" for
 * components/Cursor.tsx (an attribute, not an import). */
function markFullyPainted(state: FigureState) {
  state.figure.dataset.brushFull = ''
}
function clearFullyPainted(state: FigureState) {
  delete state.figure.dataset.brushFull
}

/** Per-ray speeds around the entry point: fixed-seed noise (mulberry32-
 * style, not Math.random()), smoothed twice so the front reads as a few
 * broad tendrils. `maxRadius` reaches the farthest corner, so every ray at
 * full length covers the whole figure wherever it was entered. */
function buildField(originX: number, originY: number, w: number, h: number): BloomField {
  const maxRadius =
    Math.max(
      Math.hypot(originX, originY),
      Math.hypot(w - originX, originY),
      Math.hypot(originX, h - originY),
      Math.hypot(w - originX, h - originY),
    ) || 1

  let seedState = (Math.round(originX * 97) * 73856093) ^ (Math.round(originY * 97) * 19349663) ^ (Math.round(w) * 83492791)
  const rand = () => {
    seedState |= 0
    seedState = (seedState + 0x6d2b79f5) | 0
    let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  let speeds = new Float32Array(SPLASH_RAYS)
  for (let i = 0; i < SPLASH_RAYS; i++) speeds[i] = rand()
  for (let pass = 0; pass < 2; pass++) {
    const smoothed = new Float32Array(SPLASH_RAYS)
    for (let i = 0; i < SPLASH_RAYS; i++) {
      const prev = speeds[(i - 1 + SPLASH_RAYS) % SPLASH_RAYS]
      const next = speeds[(i + 1) % SPLASH_RAYS]
      smoothed[i] = (prev + speeds[i] * 2 + next) / 4
    }
    speeds = smoothed
  }
  for (let i = 0; i < SPLASH_RAYS; i++) speeds[i] = 1 + speeds[i] * SPLASH_SPEED_JITTER

  return { originX, originY, maxRadius, speeds, w, h }
}

/** Front-loaded overall progress (not a linear ramp); the per-ray speeds
 * supply the irregular shape. The dry-back runs it mirrored. */
function easeBloomOut(t: number): number {
  return 1 - Math.pow(1 - t, 1.3)
}

/** The blob at shared progress `s` as a `clip-path` polygon: each ray's
 * tip at `maxRadius * min(1, s * speed) * scale`, then the smooth closed
 * curve through the tips' midpoints (each tip the control point of a
 * quadratic), sampled twice per ray. Percentages of the figure box. */
function blobClip(field: BloomField, s: number, scale = 1): string {
  const { originX, originY, maxRadius, speeds, w, h } = field
  const n = speeds.length
  const clamped = Math.max(0, Math.min(1, s))
  const xs = new Float32Array(n)
  const ys = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2
    const r = maxRadius * Math.min(1, clamped * speeds[i]) * scale
    xs[i] = originX + Math.cos(angle) * r
    ys[i] = originY + Math.sin(angle) * r
  }
  const pct = (x: number, y: number) => `${((x / w) * 100).toFixed(2)}% ${((y / h) * 100).toFixed(2)}%`
  const vertices: string[] = []
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n
    const next = (i + 1) % n
    const m0x = (xs[prev] + xs[i]) / 2
    const m0y = (ys[prev] + ys[i]) / 2
    const m1x = (xs[i] + xs[next]) / 2
    const m1y = (ys[i] + ys[next]) / 2
    vertices.push(pct(m0x, m0y)) // the curve at its segment start (t=0)
    vertices.push(pct(0.25 * m0x + 0.5 * xs[i] + 0.25 * m1x, 0.25 * m0y + 0.5 * ys[i] + 0.25 * m1y)) // and midway (t=0.5)
  }
  return `polygon(${vertices.join(', ')})`
}

/** `KEYFRAMES + 1` evenly spaced snapshots of the blob, `progress(t)`
 * giving the shared `s` at time fraction `t`. */
function blobKeyframes(field: BloomField, progress: (t: number) => number): Keyframe[] {
  const frames: Keyframe[] = []
  for (let k = 0; k <= KEYFRAMES; k++) {
    const t = k / KEYFRAMES
    const s = progress(t)
    frames.push({ clipPath: s >= 1 ? blobClip(field, 1, FULL_OVERSHOOT) : blobClip(field, s) })
  }
  return frames
}

function stopAnimation(state: FigureState) {
  if (state.animation) {
    state.animation.onfinish = null
    state.animation.cancel()
    state.animation = null
  }
}

function clearHoldTimer(state: FigureState) {
  if (state.holdTimer != null) {
    clearTimeout(state.holdTimer)
    state.holdTimer = null
  }
}

/** Resting grey: colour fully clipped away, session over. */
function showGrey(state: FigureState) {
  stopAnimation(state)
  clearHoldTimer(state)
  state.colour.style.clipPath = EMPTY_CLIP
  state.mode = 'idle'
  state.bloomed = false
  state.field = null
  clearFullyPainted(state)
}

/** Fully painted: no clip at all. */
function showColour(state: FigureState) {
  stopAnimation(state)
  state.colour.style.clipPath = 'none'
  markFullyPainted(state)
}

function runSegment(state: FigureState, frames: Keyframe[], duration: number, onDone: () => void) {
  stopAnimation(state)
  state.segments += 1
  state.figure.dataset.brushFrames = String(state.segments)
  const animation = state.colour.animate(frames, { duration, easing: 'linear', fill: 'forwards' })
  animation.onfinish = () => {
    if (state.animation !== animation) return
    onDone()
  }
  state.animation = animation
}

function startHold(state: FigureState) {
  state.mode = 'hold'
  clearHoldTimer(state)
  state.holdTimer = window.setTimeout(() => {
    state.holdTimer = null
    startFade(state)
  }, HOLD_MS)
}

function startFade(state: FigureState) {
  const field = state.field
  if (!field) {
    showGrey(state)
    return
  }
  state.mode = 'fade'
  // No longer at 100% coverage from here on (R4-4b fix 4).
  clearFullyPainted(state)
  // R4-4b fix 3: the splash run backward, same field -- the outer edge
  // (painted last) dries first, the entry point last.
  runSegment(state, blobKeyframes(field, (t) => 1 - easeBloomOut(t)), FADE_MS, () => {
    showGrey(state)
    state.touchSplashed = false
    if (state.engaged) {
      // R4-4c edge case: the pointer/focus never actually left, so no fresh
      // pointerenter will fire -- arm a new splash now instead of sitting
      // grey under a hovering cursor.
      const rect = state.figure.getBoundingClientRect()
      const x = state.pointerInside ? state.lastPointerX : rect.width / 2
      const y = state.pointerInside ? state.lastPointerY : rect.height / 2
      startBloom(state, 'pointer', x, y)
    }
  })
}

/** Starts the splash, instantly, from `(x, y)` (CSS px within the figure).
 * `trigger` decides what happens once it is fully painted. */
function startBloom(state: FigureState, trigger: BloomTrigger, x: number, y: number) {
  const rect = state.figure.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  const field = buildField(x, y, w, h)
  clearHoldTimer(state)
  clearFullyPainted(state)
  state.bloomTrigger = trigger
  state.bloomed = true
  state.field = field
  state.mode = 'bloom'
  runSegment(state, blobKeyframes(field, easeBloomOut), BLOOM_MS, () => {
    showColour(state)
    if (state.bloomTrigger === 'touch') {
      // Touch has no leave/blur to start the dry-back from, so it rolls
      // straight into hold + fade itself.
      startHold(state)
    } else if (state.engaged) {
      // Still hovered/focused: stay painted until an explicit leave/blur.
      state.mode = 'idle'
    } else {
      // Left mid-splash: the splash finishes first (it can't be cancelled,
      // R4-4b fix 2), then dries.
      startHold(state)
    }
  })
}

/** R4-4c: re-entry while a session is live never starts or restarts a
 * splash. 'bloom' keeps growing on its own schedule; 'hold' just stops its
 * countdown; 'fade' snaps back to fully painted (same splash, not a new
 * one) so a hovered figure never sits half-dried. */
function reengage(state: FigureState) {
  if (state.mode === 'hold') {
    clearHoldTimer(state)
    state.mode = 'idle'
  } else if (state.mode === 'fade') {
    showColour(state)
    state.mode = 'idle'
  }
}

/** Off-screen: a running splash jumps to fully painted; a hold or dry-back
 * jumps to grey. Nothing keeps running while the figure can't be seen. */
function snapAndStop(state: FigureState) {
  if (state.mode === 'bloom') {
    showColour(state)
    state.mode = 'idle'
  } else if (state.mode === 'hold' || state.mode === 'fade') {
    showGrey(state)
  }
  state.touchSplashed = false
  state.engaged = false
  state.pointerInside = false
  state.focusInside = false
}

/**
 * Mounts the brush engine on one figure. `figure` is BrushReveal's wrapper
 * (pointer/focus listeners live here); `colour` is the colour `<img>` that
 * sits above the grey one and gets clipped. Returns an unmount function.
 */
export function mountBrush(figure: HTMLElement, colour: HTMLImageElement): () => void {
  const state: FigureState = {
    figure,
    colour,
    segments: Number(figure.dataset.brushFrames) || 0,
    mode: 'idle',
    animation: null,
    holdTimer: null,
    touchSplashed: false,
    coarsePointer: typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false,
    engaged: false,
    pointerInside: false,
    focusInside: false,
    lastPointerX: 0,
    lastPointerY: 0,
    bloomed: false,
    bloomTrigger: 'pointer',
    field: null,
  }
  colour.style.clipPath = EMPTY_CLIP

  const focusTarget = figure.closest('a, button') ?? figure

  const ioVisible = new IntersectionObserver((entries) => {
    if (!(entries[0]?.isIntersecting ?? false)) snapAndStop(state)
  })
  ioVisible.observe(figure)

  // D5: on touch, the splash fires once from the image centre as the
  // figure's centre crosses the viewport's middle 40% band.
  const ioMidBand = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && state.coarsePointer && !state.touchSplashed && !state.bloomed) {
        state.touchSplashed = true
        const rect = figure.getBoundingClientRect()
        startBloom(state, 'touch', rect.width / 2, rect.height / 2)
      }
    },
    { rootMargin: '-30% 0px -30% 0px' },
  )
  ioMidBand.observe(figure)

  function onPointerEnter(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    const rect = figure.getBoundingClientRect()
    state.lastPointerX = e.clientX - rect.left
    state.lastPointerY = e.clientY - rect.top
    state.pointerInside = true
    state.engaged = true
    if (!state.bloomed) {
      startBloom(state, 'pointer', state.lastPointerX, state.lastPointerY)
      return
    }
    reengage(state)
  }

  function onPointerLeaveOrUp(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    state.pointerInside = false
    state.engaged = state.pointerInside || state.focusInside
    // Fully painted and just left: start D4's dry-back. A splash still
    // growing starts hold itself once it finishes.
    if (!state.engaged && state.mode === 'idle' && state.bloomed) startHold(state)
  }

  function onFocusIn() {
    state.focusInside = true
    state.engaged = true
    if (!state.bloomed) {
      const rect = figure.getBoundingClientRect()
      startBloom(state, 'focus', rect.width / 2, rect.height / 2)
      return
    }
    reengage(state)
  }

  function onFocusOut() {
    state.focusInside = false
    state.engaged = state.pointerInside || state.focusInside
    if (!state.engaged && state.mode === 'idle' && state.bloomed) startHold(state)
  }

  figure.addEventListener('pointerenter', onPointerEnter)
  figure.addEventListener('pointerleave', onPointerLeaveOrUp)
  figure.addEventListener('pointerup', onPointerLeaveOrUp)
  focusTarget.addEventListener('focusin', onFocusIn)
  focusTarget.addEventListener('focusout', onFocusOut)

  return function unmount() {
    ioVisible.disconnect()
    ioMidBand.disconnect()
    stopAnimation(state)
    clearHoldTimer(state)
    clearFullyPainted(state)
    colour.style.clipPath = ''
    figure.removeEventListener('pointerenter', onPointerEnter)
    figure.removeEventListener('pointerleave', onPointerLeaveOrUp)
    figure.removeEventListener('pointerup', onPointerLeaveOrUp)
    focusTarget.removeEventListener('focusin', onFocusIn)
    focusTarget.removeEventListener('focusout', onFocusOut)
  }
}
