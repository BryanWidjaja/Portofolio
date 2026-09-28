/**
 * src/ink/brush.ts
 *
 * 42-ink-direction.md §Brush reveal + 45-ink-approved.md D4/D5 +
 * 49-round4-plan.md §E2 (item 4, R4-4 in 41-ink-replace-map.md): the brush
 * engine behind `components/BrushReveal.tsx`. Plain DOM/Canvas2D -- no
 * React, no GSAP (44-ink-build-plan.md §Architecture lists this as
 * framework-free so the JS-budget line item stays small).
 *
 * Model: a figure gets one accumulating "mask" canvas (splash coverage,
 * reset on every dry-back) and one "reveal" scalar (0..1, the D4 hold/fade
 * multiplier). Every frame composites `mask -> reveal -> display canvas`
 * (`renderComposite`); 46 item 3b bakes the grey->colour blend *inside*
 * that composite (grayscale draw -> 'color' composite -> colour draw ->
 * destination-in mask) rather than a DOM `mix-blend-mode: color`. The grey
 * *base* this reveals over (R4-4's other half) is now a pre-baked raster
 * asset behind `components/BrushReveal.tsx`'s own overlay `<img>`
 * (`scripts/placeholders.mjs`), not a CSS `filter`/`mix-blend-mode` -- this
 * module's own composite math is unchanged by that half of R4-4.
 *
 * R4-4 (item 4) replaces both round 3's per-stroke painting (the pointer
 * dragged a tip along its own path) and its 1s hover-dwell bloom with one
 * instant radial ink-splash: the moment the pointer enters the figure (or
 * it gets keyboard focus, or a touch figure's centre crosses the
 * viewport's middle band), colour spreads outward from that entry point
 * and covers the whole figure in ~`BLOOM_MS` (1.5s, R4-4b fix 1), no dwell.
 * `buildBloomField` computes, once per trigger, `SPLASH_RAYS` angular samples' own
 * fixed-seed noise speed around the entry point -- a single point needs no
 * chamfer distance transform (that machinery, still in git history,
 * existed only to find the distance from an arbitrary already-painted
 * blob, which no longer exists now that per-stroke painting is gone).
 * `drawBloomFrame` fills one smooth closed blob through those samples
 * every frame, each ray's radius eased by time and scaled by its own
 * speed, so some tendrils reach full radius sooner than others -- an
 * irregular, fibrous front, never a scalloped circle. Canvas path fill is
 * anti-aliased at native device-pixel resolution, which is what keeps the
 * front crisp: there is no raster grid or bilinear upscale left to feather
 * it the way the old grid-and-threshold bloom did.
 *
 * `requestAnimationFrame` is only ever scheduled while something is
 * actually animating (a running splash, or the hold/fade timer) -- 44
 * §check:transitions B1/B2. Every scheduled frame increments
 * `figure.dataset.brushFrames`, the counter those checks read.
 *
 * R4-4b (49-round4-plan.md §Run mode change, the owner's 4 fixes to R4-4):
 * fix 1 is just `BLOOM_MS` above. Fix 2 ("can't cancel the painting") was
 * already this module's `state.engaged` design -- see `tick`'s 'bloom'
 * case, unchanged here, just re-verified across every exit path. Fix 3
 * ("decay should be the opposite direction") is `drawFadeFrame`: the same
 * cached `bloomField` the splash used, run through the same `paintRayBlob`
 * helper at a *shrinking* `s`, the exact time-reversal of the splash's
 * *growing* `s` -- see that function's own comment for why this makes the
 * outer edge dry first and the entry point dry last without any new
 * per-pixel distance logic. Fix 4 ("open" cursor once fully painted) is
 * the `data-brush-full` attribute `drawBloomFrame`/`resetBloomSession`/
 * `startBloom` set and clear on the figure -- `components/Cursor.tsx`
 * reads it (an attribute, not an import) to fall through a fully-painted
 * figure to its enclosing link's own cursor.
 *
 * R4-4c (41-ink-replace-map.md, the owner's round-4 follow-up: "u can only
 * trigger once until it resets again"): R4-4b's fix 2 stopped a splash from
 * being *cancelled*, but every `pointerenter`/`focusin` still called
 * `startBloom` unconditionally, so leaving and re-entering while one was
 * still running (bloom/hold/fade) *restarted* it from the new point -- the
 * bug the owner actually reported. `onPointerEnter`/`onFocusIn` below now
 * only call `startBloom` when the figure is fully reset (`!state.bloomed`,
 * true only once a dry-back has actually finished or the figure was never
 * touched); otherwise they just re-engage it (`state.pointerInside`/
 * `focusInside`, ORed into `state.engaged` as before) and, for 'hold'/
 * 'fade', fold back to 'idle' (hold: already full, nothing to touch; fade:
 * `drawBloomFrame(state, 1)` re-fills the *same cached field* to full so a
 * dried-partway image never sits half-grey under a hovering pointer) --
 * 'bloom' is left completely untouched, still growing on its own schedule.
 * The mirror edge case: if a dry-back finishes while the pointer/focus
 * never actually left (`state.engaged` still true -- e.g. keyboard focus
 * moved away while the mouse was already resting on the figure, so no new
 * `pointerenter` will ever fire), `tick`'s 'fade' case arms a fresh splash
 * itself the instant it resets, from `state.lastPointerX/Y` (kept current
 * by `onPointerEnter`) or the centre if only focus is what's still engaged
 * -- instead of leaving a fully reset, grey figure sitting under a
 * hovering cursor forever.
 */

type Mode = 'idle' | 'bloom' | 'hold' | 'fade'
type BloomTrigger = 'pointer' | 'focus' | 'touch'

const HOLD_MS = 1500 // D4: colour holds 1.5s after the pointer/focus leaves
const FADE_MS = 1200 // D4: then fades 1.2s back to grey ("ink dries")
// R4-4b (owner fix 1, "0.5s more cursor time... to fully get painted"):
// was 1000ms; the ease shape (easeBloomOut) is unchanged, just stretched.
const BLOOM_MS = 1500 // item 4: ~1.5s ink-splash spread from the entry point to full coverage
const MASK_COLOR = '#000000' // mask alpha is all that matters; colour comes later
const MAX_LONG_SIDE = 1600 // canvas runs at 1x CSS px, DPR ignored, capped here
// item 4: angular samples of the splash's irregular front around the entry
// point -- enough to read as organic tendrils, cheap enough to rebuild on
// every trigger and refill every frame (no per-pixel work, just a fill()).
const SPLASH_RAYS = 48
// Each ray's own speed is 1..1+this, so some tendrils race ahead of others
// ("irregular ... fibrous tendrils, not a scalloped circle"). Always >=1 so
// every ray still reaches its full radius by t=1 -- the whole figure is
// covered by the end of BLOOM_MS regardless of the noise, per D4/D5.
const SPLASH_SPEED_JITTER = 0.6

/** item 4: the splash's one-time-computed per-ray data -- built once per
 * trigger from the entry point (`originX`/`originY`, in the same
 * CSS-px-in-canvas-space units as `state.w`/`h`) and cached until the mask
 * next clears (`resetBloomSession`). `maxRadius` is the distance to the
 * *farthest* canvas corner from the entry point, so filling every ray out
 * to `maxRadius` at t=1 always reaches the whole figure regardless of where
 * it was entered. */
interface BloomField {
  originX: number
  originY: number
  maxRadius: number
  speeds: Float32Array
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
  frame: number
  raf: number | null
  reveal: number
  mode: Mode
  modeStart: number
  freed: boolean
  touchSplashed: boolean
  coarsePointer: boolean
  visible: boolean
  engaged: boolean // item 4: pointer is over, or focus is on, the figure right now
  pointerInside: boolean // R4-4c: pointer specifically (vs. focus) -- decides the fade-completion re-arm's origin
  focusInside: boolean // R4-4c: focus specifically (vs. pointer) -- same
  lastPointerX: number // R4-4c: last known pointer position in canvas space, kept fresh only while pointerInside
  lastPointerY: number
  bloomed: boolean
  bloomTrigger: BloomTrigger
  bloomOriginX: number
  bloomOriginY: number
  bloomField: BloomField | null
}

function clearMask(state: FigureState) {
  state.maskCtx.clearRect(0, 0, state.mask.width, state.mask.height)
}

/** R4-4b fix 4: publishes/retracts the "this figure is fully painted" fact
 * as a plain `data-*` attribute on the figure -- `components/Cursor.tsx`
 * reads it to swap its brush-footprint cursor for the enclosing link's own
 * label cursor, and back, without this module importing anything cursor-
 * related (or vice versa). */
function markFullyPainted(state: FigureState) {
  state.figure.dataset.brushFull = ''
}
function clearFullyPainted(state: FigureState) {
  delete state.figure.dataset.brushFull
}

/** Ends one splash/paint "session" -- called whenever the mask fully clears
 * (a completed dry-back, or a hard reset via `snapAndStop`/`freeCanvas`) so
 * the next entry can splash fresh. Also always means "no longer fully
 * painted" (R4-4b fix 4): every caller here is a path back to grey. */
function resetBloomSession(state: FigureState) {
  state.bloomed = false
  state.bloomField = null
  clearFullyPainted(state)
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

/**
 * item 4: builds the splash's fixed-seed per-ray speeds around the entry
 * point. A single seed point needs no distance-field/BFS -- the distance
 * from a point is just its own radius -- so this is only a small noise
 * array, not a grid.
 */
function buildBloomField(state: FigureState, originX: number, originY: number): BloomField {
  const { w, h } = state
  const maxRadius =
    Math.max(
      Math.hypot(originX, originY),
      Math.hypot(w - originX, originY),
      Math.hypot(originX, h - originY),
      Math.hypot(w - originX, h - originY),
    ) || 1

  // Fixed-seed noise (mulberry32-style, not Math.random()): the splash's
  // irregular front is reproducible for a given entry point, not a fresh
  // roll every trigger.
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
  // Two circular smoothing passes so the front reads as a few broad,
  // organic tendrils rather than fine jaggy static.
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

  return { originX, originY, maxRadius, speeds }
}

/**
 * item 4: eases the splash's overall progress. Kept as the same
 * quadratic-ish ease-out round 3 tuned for its bloom (front-loaded, not a
 * linear ramp) -- the per-ray speed jitter in `buildBloomField` is what now
 * supplies the irregular spread *shape*, so this only has to supply the
 * overall timing feel. R4-4b fix 3 reuses it, mirrored, for the dry-back --
 * see `drawFadeFrame`.
 */
function easeBloomOut(t: number): number {
  return 1 - Math.pow(1 - t, 1.3)
}

/**
 * item 4 / R4-4b fix 3: fills one smooth, irregular blob through `field`'s
 * rays around its cached entry point, each ray's radius `field.maxRadius *
 * min(1, s * speed)` -- `s` is "how far this ray has grown" on a shared
 * 0..1 scale. `drawBloomFrame` (splashing) passes a *rising* `s`;
 * `drawFadeFrame` (drying back) passes the same field's `s` *falling* --
 * the receding front is the advancing one's shape run backward, not a
 * separately-tuned effect. Canvas path fill is anti-aliased at native
 * device-pixel resolution by the browser's own rasteriser -- crisp by
 * construction, with no upscale step that could feather it.
 */
function paintRayBlob(state: FigureState, field: BloomField, s: number) {
  const ctx = state.maskCtx
  ctx.clearRect(0, 0, state.w, state.h)

  const { originX, originY, maxRadius, speeds } = field
  const clamped = Math.max(0, Math.min(1, s))
  const n = speeds.length
  const points: { x: number; y: number }[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2
    const localT = Math.min(1, clamped * speeds[i])
    const r = maxRadius * localT
    points[i] = { x: originX + Math.cos(angle) * r, y: originY + Math.sin(angle) * r }
  }

  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  ctx.fillStyle = MASK_COLOR
  ctx.globalAlpha = 1
  ctx.beginPath()
  const start = mid(points[n - 1], points[0])
  ctx.moveTo(start.x, start.y)
  for (let i = 0; i < n; i++) {
    const next = points[(i + 1) % n]
    const m = mid(points[i], next)
    ctx.quadraticCurveTo(points[i].x, points[i].y, m.x, m.y)
  }
  ctx.closePath()
  ctx.fill()
}

/**
 * item 4: drives the splash's growth. `tRaw >= 1` short-circuits to a flat
 * `fillRect` instead of `paintRayBlob(state, field, 1)` -- every ray is
 * saturated to `maxRadius` at s=1 regardless of its speed, so a circle of
 * that radius already contains the whole canvas rect by construction (see
 * `buildBloomField`'s own `maxRadius`), and the two are visually identical;
 * the rect fill is just cheaper and free of any seam the AA'd polygon
 * could leave at its tangent corner. R4-4b fix 3: the field is *not*
 * cleared here any more -- `drawFadeFrame` needs the same origin/speeds to
 * run the front backward, so it stays cached until `resetBloomSession`
 * (the dry-back actually finishing, or a hard reset) clears it.
 */
function drawBloomFrame(state: FigureState, tRaw: number) {
  if (!state.bloomField) state.bloomField = buildBloomField(state, state.bloomOriginX, state.bloomOriginY)

  if (tRaw >= 1) {
    const ctx = state.maskCtx
    ctx.clearRect(0, 0, state.w, state.h)
    ctx.fillStyle = MASK_COLOR
    ctx.globalAlpha = 1
    ctx.fillRect(0, 0, state.w, state.h)
    state.reveal = 1
    markFullyPainted(state)
    return
  }

  paintRayBlob(state, state.bloomField, easeBloomOut(tRaw))
  state.reveal = 1
}

/**
 * R4-4b fix 3 ("the decay should be the opposite direction of the
 * painting"): `paintRayBlob` again, same cached field, at `s = 1 -
 * easeBloomOut(t)` -- the exact mirror of `drawBloomFrame`'s `s =
 * easeBloomOut(t)`. A ray that saturated early during the splash (a fast
 * tendril, reaching `maxRadius` well before t=1) also stays saturated
 * latest into the dry-back (recedes last); a ray that only reached
 * `maxRadius` right at t=1 -- the outer edge, painted last -- is the first
 * to fall under full radius here, i.e. dries first. The entry point itself
 * (r=0 on every ray) is inside the blob for as long as s>0, i.e. dries
 * last, by construction: no separate "distance from origin" bookkeeping
 * needed. `state.reveal` stays 1 throughout -- coverage now recedes by
 * mask *shape*, not a global alpha fade, so the two directions are true
 * opposites of the same mechanism.
 */
function drawFadeFrame(state: FigureState, tRaw: number) {
  if (!state.bloomField) state.bloomField = buildBloomField(state, state.bloomOriginX, state.bloomOriginY)

  if (tRaw >= 1) {
    clearMask(state)
    state.reveal = 0
    return
  }

  paintRayBlob(state, state.bloomField, 1 - easeBloomOut(tRaw))
  state.reveal = 1
}

function tick(state: FigureState) {
  state.raf = null
  state.frame += 1
  state.figure.dataset.brushFrames = String(state.frame)
  const now = performance.now()
  let keepGoing = false

  switch (state.mode) {
    case 'bloom': {
      const t = Math.min(1, (now - state.modeStart) / BLOOM_MS)
      drawBloomFrame(state, t)
      if (t < 1) {
        keepGoing = true
      } else if (state.bloomTrigger === 'touch') {
        // Touch has no "leave"/blur event to start D4's dry-back from, so a
        // touch-triggered splash rolls straight into hold+fade itself.
        state.mode = 'hold'
        state.modeStart = now
        keepGoing = true
      } else if (state.engaged) {
        // Pointer/focus still present: stay fully revealed until an
        // explicit leave/blur (onPointerLeaveOrUp/onFocusOut) starts hold.
        state.mode = 'idle'
      } else {
        // item 4: a quick pass-over is now the common case, not an edge
        // case -- the pointer/focus already left while the ~BLOOM_MS
        // splash was still spreading. Let it finish revealing before
        // drying starts, instead of freezing it half-coloured (owner fix
        // 2: "u shouldnt be able to cancel the painting out").
        state.mode = 'hold'
        state.modeStart = now
        keepGoing = true
      }
      break
    }
    case 'hold': {
      if (now - state.modeStart >= HOLD_MS) {
        state.mode = 'fade'
        state.modeStart = now
        // Coverage is about to start receding (drawFadeFrame) -- no longer
        // "fully painted" from this frame on (R4-4b fix 4). Harmless if the
        // pointer isn't there to see it (hold/fade only ever run once the
        // pointer/focus has actually left, except touch, which never shows
        // this cursor) -- cleared here anyway so the attribute always
        // means exactly "at 100% coverage right now", not "was, recently".
        clearFullyPainted(state)
      }
      keepGoing = true
      break
    }
    case 'fade': {
      const t = Math.min(1, (now - state.modeStart) / FADE_MS)
      drawFadeFrame(state, t)
      if (t < 1) keepGoing = true
      else {
        state.mode = 'idle'
        state.touchSplashed = false
        resetBloomSession(state)
        if (state.engaged) {
          // R4-4c edge case: the pointer/focus never actually left (e.g.
          // keyboard focus moved elsewhere while the mouse was already
          // resting on the figure, so no fresh pointerenter will ever fire)
          // -- arm a fresh splash right now instead of sitting fully reset
          // and grey under a hovering cursor/focus.
          const originX = state.pointerInside ? state.lastPointerX : state.w / 2
          const originY = state.pointerInside ? state.lastPointerY : state.h / 2
          startBloom(state, 'pointer', originX, originY)
        }
      }
      break
    }
    default:
      break
  }

  renderComposite(state)
  if (keepGoing) scheduleTick(state)
}

/** item 4: starts the splash, instantly, from `(originX, originY)`.
 * `trigger` decides `tick()`'s post-splash mode (see the 'bloom' case
 * above) -- everything else about the animation is identical regardless of
 * what triggered it. */
function startBloom(state: FigureState, trigger: BloomTrigger, originX: number, originY: number) {
  state.bloomTrigger = trigger
  state.bloomed = true
  state.bloomOriginX = originX
  state.bloomOriginY = originY
  state.bloomField = null
  clearFullyPainted(state) // a fresh splash begins: not fully painted until it completes again
  state.mode = 'bloom'
  state.modeStart = performance.now()
  state.reveal = 1
  scheduleTick(state)
}

/** R4-4c: called on `pointerenter`/`focusin` when the figure is *not* fully
 * reset (`state.bloomed` already true) -- i.e. exactly the re-entry case
 * that must never start or restart a splash. 'bloom' is left completely
 * untouched here: it's already growing toward full on its own schedule, and
 * the caller has already set `engaged`/`pointerInside`/`focusInside`, which
 * is all 'bloom' needs (see `tick`'s 'bloom' case). 'hold' is already at
 * full coverage, so folding it back to 'idle' just stops its HOLD_MS timer
 * from expiring into a dry-back while re-engaged -- `onPointerLeaveOrUp`/
 * `onFocusOut` already know how to re-arm a fresh `hold` from `idle` +
 * `bloomed` once it's left again (the same path a first-time leave-after-
 * bloom already used). 'fade' is the one case that needs actual work: it's
 * mid-recede, so `drawBloomFrame(state, 1)` re-fills the mask to full using
 * the *same cached field* (same entry point, not a new splash) before also
 * folding to 'idle' -- otherwise a hovered figure could sit half-dried
 * indefinitely instead of reading as painted. */
function reengageMidSplash(state: FigureState) {
  if (state.mode === 'hold') {
    state.mode = 'idle'
  } else if (state.mode === 'fade') {
    drawBloomFrame(state, 1)
    state.mode = 'idle'
    renderComposite(state)
  }
}

/** Cancels any running animation and jumps straight to its end state --
 * used when IntersectionObserver reports the figure has left the viewport
 * entirely (44 §check:transitions B2). */
function snapAndStop(state: FigureState) {
  if (state.raf != null) {
    cancelAnimationFrame(state.raf)
    state.raf = null
  }
  if (state.mode === 'bloom') {
    drawBloomFrame(state, 1)
  } else if (state.mode === 'hold' || state.mode === 'fade') {
    state.reveal = 0
    clearMask(state)
    resetBloomSession(state)
  }
  state.mode = 'idle'
  state.touchSplashed = false
  state.engaged = false
  state.pointerInside = false
  state.focusInside = false
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
  state.mode = 'idle'
  state.reveal = 0
  state.w = 0
  state.h = 0
  state.canvas.width = 1
  state.canvas.height = 1
  state.mask.width = 1
  state.mask.height = 1
  state.freed = true
  state.engaged = false
  state.pointerInside = false
  state.focusInside = false
  resetBloomSession(state)
}

function measure(state: FigureState) {
  const rect = state.figure.getBoundingClientRect()
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
  state.freed = false
  renderComposite(state)
}

/**
 * Mounts the brush engine on one figure. `figure` is BrushReveal's own
 * wrapper element (pointer/focus listeners live here); `img` is the
 * already-rendered colour `<img>` (drawn into the canvas without its CSS
 * grayscale filter, since canvas drawImage reads pixel data, not computed
 * style); `canvas` is the display layer BrushReveal renders (plain normal
 * blend -- 46 item 3b moved the grey->colour blend inside this module).
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
    frame: Number(figure.dataset.brushFrames) || 0,
    raf: null,
    reveal: 0,
    mode: 'idle',
    modeStart: 0,
    freed: true,
    touchSplashed: false,
    coarsePointer: typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false,
    visible: false,
    engaged: false,
    pointerInside: false,
    focusInside: false,
    lastPointerX: 0,
    lastPointerY: 0,
    bloomed: false,
    bloomTrigger: 'pointer',
    bloomOriginX: 0,
    bloomOriginY: 0,
    bloomField: null,
  }

  const focusTarget = figure.closest('a, button') ?? figure

  measure(state)
  const ro = new ResizeObserver(() => measure(state))
  ro.observe(figure)

  // On/off-screen: pause entirely and snap whatever was mid-flight so idle
  // time off-screen never ticks (B2). Also tracks `state.visible` for D5's
  // touch splash (the ioMidBand observer below checks it before firing).
  const ioVisible = new IntersectionObserver((entries) => {
    const intersecting = entries[0]?.isIntersecting ?? false
    state.visible = intersecting
    if (!intersecting) snapAndStop(state)
  })
  ioVisible.observe(figure)

  // D5: the splash fires once, from the image centre, as a touch figure's
  // centre crosses the viewport's middle 40% band.
  const ioMidBand = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && state.coarsePointer && !state.touchSplashed) {
        if (state.freed) measure(state)
        state.touchSplashed = true
        startBloom(state, 'touch', state.w / 2, state.h / 2)
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

  // item 4 / R4-4c: the splash fires the instant the pointer enters the
  // figure's bounds, seeded at the entry point -- no dwell timer, but only
  // when the figure is fully reset (`!state.bloomed`). Re-entering a figure
  // that's still bloom/hold/fade never starts or restarts anything -- see
  // the module doc comment's R4-4c paragraph for the full reasoning.
  function onPointerEnter(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    if (state.freed) measure(state)
    const rect = figure.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * state.w
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * state.h
    state.lastPointerX = x
    state.lastPointerY = y
    state.pointerInside = true
    state.engaged = true
    if (!state.bloomed) {
      startBloom(state, 'pointer', x, y)
      return
    }
    reengageMidSplash(state)
  }

  function onPointerLeaveOrUp(e: PointerEvent) {
    if (e.pointerType === 'touch') return
    state.pointerInside = false
    state.engaged = state.pointerInside || state.focusInside
    if (state.mode === 'idle' && state.bloomed) {
      // Fully revealed already, and the pointer just left: start D4's
      // dry-back. If the splash is still mid-flight, tick()'s 'bloom' case
      // lets it finish and starts hold itself instead of freezing it
      // half-coloured here.
      state.mode = 'hold'
      state.modeStart = performance.now()
      scheduleTick(state)
    }
  }

  function onFocusIn() {
    if (state.freed) measure(state)
    state.focusInside = true
    state.engaged = true
    if (!state.bloomed) {
      startBloom(state, 'focus', state.w / 2, state.h / 2)
      return
    }
    reengageMidSplash(state)
  }

  function onFocusOut() {
    state.focusInside = false
    state.engaged = state.pointerInside || state.focusInside
    if (state.mode === 'idle' && state.bloomed) {
      state.mode = 'hold'
      state.modeStart = performance.now()
      scheduleTick(state)
    }
  }

  figure.addEventListener('pointerenter', onPointerEnter)
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
    figure.removeEventListener('pointerenter', onPointerEnter)
    figure.removeEventListener('pointerleave', onPointerLeaveOrUp)
    figure.removeEventListener('pointerup', onPointerLeaveOrUp)
    focusTarget.removeEventListener('focusin', onFocusIn)
    focusTarget.removeEventListener('focusout', onFocusOut)
  }
}
