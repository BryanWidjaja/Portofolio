import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { gsap, useGSAP } from '../motion/gsap'
import { DURATION, EASE } from '../motion/tokens'
import { catmullRomPoint, clamp, easeSineInOut, makeTip } from '../ink/stroke'

type CursorState = 'boot' | 'default' | 'pointer' | 'text' | 'stick' | 'brush' | 'down' | 'hidden'

type Controls = { lock: () => void; unlock: () => void; reset: () => void }

const noopControls: Controls = { lock: () => {}, unlock: () => {}, reset: () => {} }
let controls: Controls = noopControls

/**
 * 12-motion.md §Cursor "Route change": TransitionProvider calls these
 * around every navigation. Cursor is a singleton that never remounts (13-
 * build-plan.md §Architecture), so — like motion/pageEnter.ts's listener
 * set — plain module-scoped functions are simpler and cheaper than a React
 * context for a value nothing ever needs to read reactively.
 */
export function lockCursor() {
  controls.lock()
}
export function unlockCursor() {
  controls.unlock()
}
export function resetCursor() {
  controls.reset()
}

const STICK_MAX = 6 // px, clamp on the stuck element's own magnetic offset
// `[data-brush]` (src/ink/brush.ts's BrushReveal figures) resolves to the
// 'brush' state without needing its own `data-cursor` attribute — see
// resolveState below.
const CURSOR_TARGETS = '[data-cursor], [data-brush]'

// 47-round3-plan.md §R2 (item 4): the cursor is one deterministic round
// brush tip (src/ink/stroke.ts's `makeTip`), repeated along a smoothed
// spine for the trail. TIP_DIAMETER is the resting footprint (CSS px,
// unchanged from 46's ~14-18/20px tuning); BASE_TIP_PX is the bitmap's own
// bake resolution — the largest diameter any state ever needs (BRUSH_
// DIAMETER), so every drawn size is a downscale of the cached bitmap, never
// an upscale. BRUSH_DIAMETER replaces the old separate 64px `<span>`: the
// tip itself grows to that size at ~30% alpha over reveal media instead of
// a second DOM layer.
const TIP_DIAMETER = 20
const BASE_TIP_PX = 64
const BRUSH_DIAMETER = 64
const TIP_ALPHA = 0.92
const BRUSH_ALPHA = 0.3
// Orchestrator review (47-round3-plan.md §R5 fix-up): at 1.6x diameter and
// TIP_ALPHA, the stuck tip sat fully opaque over the nav burger/X -- both
// paper-flipped the same colour, so the icon vanished underneath it. Low
// alpha here (not a colour change) keeps the control's own icon reading
// through in both the ink and paper colour, in both directions.
const STICK_ALPHA = 0.2

// Trail length adapts to speed (owner: "current length ok, too long at max
// speed"): 130px at v <= 0.8px/ms, easing down to ~75px at v >= 3px/ms. An
// EMA of speed (SPEED_EMA_MS's time constant) feeds this, and the length
// itself is smoothed frame to frame (LEN_SMOOTH_MS) so it never pops.
const SPEED_EMA_MS = 80
const LEN_SLOW_PX = 130
const LEN_FAST_PX = 75
const LEN_V_LO = 0.8 // px/ms
const LEN_V_HI = 3 // px/ms
const LEN_SMOOTH_MS = 120
// Stamps are spaced <= 0.2 * the tip's current diameter along the spine, so
// the trail reads as one continuous tapered stroke rather than beads.
const TRAIL_SPACING_RATIO = 0.2
// How long the raw pointer must go quiet before the trail is considered
// "stopped" and starts retracting (DURATION.trailRetract) into the tip.
const STOP_GRACE_MS = 50
// Bounded history for the spine (device-independent CSS px of path length
// retained) — generous headroom above the longest possible trail (130px)
// so the backward walk never runs out of history mid-trail.
const SPINE_MAX_PX = 220
// Owner, 2026-09-28: "cursor trail lasts too long when near 0 velocity ...
// the cursor lingers too long". Length alone (above) never forgets: a slow
// or intermittent drag stays 'active' (the stop grace below never trips)
// with the *longest* target length, so it kept drawing path laid down
// seconds ago. Only path from the last TRAIL_MAX_AGE_MS is ever drawn now:
// at normal/fast speed (>~0.93px/ms) the length cap still binds, so that
// feel is unchanged; slower, the trail shortens with speed (0.2px/ms ->
// ~28px) and a near-still pointer draws essentially just the tip.
const TRAIL_MAX_AGE_MS = 140

function targetDiameter(state: CursorState): number {
  if (state === 'brush') return BRUSH_DIAMETER
  if (state === 'pointer') return TIP_DIAMETER * 2.4
  if (state === 'stick') return TIP_DIAMETER * 1.6
  if (state === 'text') return 0
  return TIP_DIAMETER
}

function targetAlpha(state: CursorState): number {
  if (state === 'text') return 0
  if (state === 'brush') return BRUSH_ALPHA
  if (state === 'stick') return STICK_ALPHA
  return TIP_ALPHA
}

/** L(v): 130px at slow/normal speed, easing (smoothstep) down to ~75px by
 * v = 3px/ms — see SPEED_EMA_MS's comment above for how `v` is smoothed. */
function targetTrailLength(v: number): number {
  const t = clamp((v - LEN_V_LO) / (LEN_V_HI - LEN_V_LO), 0, 1)
  const eased = t * t * (3 - 2 * t) // smoothstep
  return LEN_SLOW_PX - eased * (LEN_SLOW_PX - LEN_FAST_PX)
}

type RawPt = { x: number; y: number; t: number }
type SpinePt = { x: number; y: number; d: number; t: number } // t: when the pointer was here (event time)
type BBox = { x0: number; y0: number; x1: number; y1: number }

function unionBBox(a: BBox | null, b: BBox | null): BBox | null {
  if (!a) return b
  if (!b) return a
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
}

/**
 * 12-motion.md §Cursor: fixed siblings, never remounted, rendered once by
 * RootLayout above the ink cover (z-cursor 100 > z-curtain 90). All state
 * lives in plain closures instead of React state — a pointermove-driven
 * re-render on every frame would be its own performance bug.
 */
export function Cursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const labelSpanRef = useRef<HTMLSpanElement>(null)
  const location = useLocation()

  useGSAP(
    () => {
      const canvasEl = canvasRef.current
      const labelEl = labelRef.current
      const labelTextEl = labelSpanRef.current
      if (!canvasEl || !labelEl || !labelTextEl) return

      const canvas = canvasEl
      const label = labelEl
      const labelText = labelTextEl

      const ctxMaybe = canvas.getContext('2d')
      if (!ctxMaybe) return
      // Rebound as a fresh const: TS's control-flow narrowing above doesn't
      // carry into the nested closures below, but a `const` initialised
      // from an already-narrowed value keeps its non-null type wherever
      // it's captured.
      const ctx = ctxMaybe

      gsap.set(label, { xPercent: -50, yPercent: -50 })
      const setLabelX = gsap.quickTo(label, 'x', { duration: DURATION.followLabel, ease: EASE.follow })
      const setLabelY = gsap.quickTo(label, 'y', { duration: DURATION.followLabel, ease: EASE.follow })

      // 46 owner decision 4: no mix-blend-mode on the canvas (a full-
      // viewport blended layer is exactly the compositor cost this round
      // removes) — instead the stamp colour itself flips between ink and
      // paper. `--color-ink`/`--color-background` are read once (they're
      // static design tokens, not something that changes at runtime);
      // `data-menu-open` on <html> is the dark-surface contract the open
      // menu panel (46 item 6) is expected to set.
      let cachedInk = ''
      let cachedPaper = ''
      function resolveInkColors() {
        const style = getComputedStyle(document.documentElement)
        cachedInk = style.getPropertyValue('--color-ink').trim() || '#141a1e'
        cachedPaper = style.getPropertyValue('--color-background').trim() || '#f2ecde'
      }
      function inkColor() {
        return document.documentElement.hasAttribute('data-menu-open') ? cachedPaper : cachedInk
      }
      resolveInkColors()

      // 47 §Shared rules ("crisp means device pixels"): the canvas backing
      // store is sized at min(devicePixelRatio, 2) so the tip's AA edge
      // stays ~1.5 *device* px regardless of screen density, instead of
      // being drawn at CSS resolution and upscaled.
      let dpr = 1
      function sizeCanvas() {
        dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(window.innerWidth * dpr)
        canvas.height = Math.round(window.innerHeight * dpr)
      }
      sizeCanvas()

      // Raw pointer samples (<=4, just enough for one Catmull-Rom window)
      // and the dense, smoothed spine resampled from them (kept, trimmed to
      // SPINE_MAX_PX of path length) — see `commitPoint` below.
      let raw: RawPt[] = []
      let spine: SpinePt[] = []
      let emaSpeed = 0 // px/ms
      let trailLen = 0 // current smoothed painted length, px
      let stopAt: number | null = null // set once the pointer's confirmed stopped
      let lenAtStop = 0
      let lastMoveAt = 0
      let lastTickAt = 0
      let mode: 'idle' | 'active' = 'idle'
      let raf: number | null = null
      let frame = 0
      let prevBBox: BBox | null = null
      // The tip's own diameter/alpha, eased toward the current state's
      // target (DURATION.tipState) rather than snapped — always drawn,
      // mid-move or at rest, at the pointer's last known position.
      let curDiameter = TIP_DIAMETER
      let curAlpha = TIP_ALPHA
      let lastTipX = 0
      let lastTipY = 0

      function scheduleTrailTick() {
        if (raf != null) return
        raf = requestAnimationFrame(trailTick)
      }

      /** Resamples `raw`'s newest segment into the dense spine via
       * Catmull-Rom (ink/stroke.ts's `catmullRomPoint`), so a fast pointer
       * move — or a synthetic multi-hundred-pixel jump — still paints a
       * continuous curve instead of a straight hop. `p3` duplicates the
       * newest point when there's no later sample yet to shape its tangent
       * from; the tiny straightening this causes is only ever visible at
       * the very tip of the spine and is superseded next call. */
      function commitPoint(x: number, y: number, now: number) {
        raw.push({ x, y, t: now })
        if (raw.length > 4) raw.shift()
        if (spine.length === 0) spine.push({ x, y, d: 0, t: now })
        if (raw.length < 2) return
        const p1 = raw[raw.length - 2]
        const p2 = raw[raw.length - 1]
        const p0 = raw.length >= 3 ? raw[raw.length - 3] : p1
        const p3 = p2
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        const steps = Math.max(1, Math.min(40, Math.ceil(dist / 2)))
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const pt = catmullRomPoint(p0, p1, p2, p3, t)
          const last = spine[spine.length - 1]
          const d = last.d + Math.hypot(pt.x - last.x, pt.y - last.y)
          spine.push({ x: pt.x, y: pt.y, d, t: p1.t + (p2.t - p1.t) * t })
        }
        const total = spine[spine.length - 1].d
        let cut = 0
        while (cut < spine.length - 2 && total - spine[cut].d > SPINE_MAX_PX) cut++
        if (cut > 0) spine.splice(0, cut)
      }

      function resetTrail() {
        raw = []
        spine = []
        trailLen = 0
        stopAt = null
        emaSpeed = 0
      }

      type DrawJob = { x: number; y: number; size: number; alpha: number }

      /** How much of the spine (px back from the tip) is younger than
       * TRAIL_MAX_AGE_MS at `now`, in the same event-time clock `t` was
       * recorded on. */
      function freshLength(now: number): number {
        if (spine.length < 2) return 0
        const cutoff = now - TRAIL_MAX_AGE_MS
        const tipD = spine[spine.length - 1].d
        let i = spine.length - 1
        while (i > 0 && spine[i - 1].t >= cutoff) i--
        return tipD - spine[i].d
      }

      function buildJobs(now: number): DrawJob[] {
        const jobs: DrawJob[] = []
        if (state === 'hidden') return jobs
        // The painted length this frame: the speed-driven length, capped by
        // how much path is still fresh (TRAIL_MAX_AGE_MS). The taper below
        // spans whatever that is, so a short slow trail still reads as a
        // whole tapered stroke, not a clipped one.
        const drawLen = Math.min(trailLen, freshLength(now))
        // Trail: walk the spine backward from the tip for `trailLen` px,
        // tapering scale 1.0->0.2 and alpha 1.0->~0.3 on an ease-in curve
        // (47 §R2), so it reads as one continuous stroke shrinking to a
        // tail rather than a row of identical dots. R4-4c fix 2: suppressed
        // entirely for the brush-full "open" handoff -- only the tip (the
        // label cursor's own dot) is drawn in that state.
        if (!suppressTrail && drawLen > 1 && spine.length > 1) {
          const tipD = spine[spine.length - 1].d
          const spacing = Math.max(1, curDiameter * TRAIL_SPACING_RATIO)
          const steps = Math.floor(drawLen / spacing)
          let searchIdx = spine.length - 1
          for (let k = 1; k <= steps; k++) {
            const distFromTip = k * spacing
            const targetD = tipD - distFromTip
            if (targetD < spine[0].d) break
            while (searchIdx > 0 && spine[searchIdx - 1].d > targetD) searchIdx--
            const a = spine[Math.max(0, searchIdx - 1)]
            const b = spine[searchIdx]
            const span = b.d - a.d
            const frac = span > 0 ? (targetD - a.d) / span : 0
            const x = a.x + (b.x - a.x) * frac
            const y = a.y + (b.y - a.y) * frac
            const t = clamp(distFromTip / drawLen, 0, 1)
            const scale = 1 - 0.8 * t // 1.0 -> 0.2
            const alphaT = t * t // ease-in, not linear
            const alpha = (1 - 0.7 * alphaT) * curAlpha // 1.0 -> ~0.3 of curAlpha
            jobs.push({ x: x * dpr, y: y * dpr, size: curDiameter * scale * dpr, alpha })
          }
        }
        // The tip itself, drawn last (on top) when visible, at the
        // pointer's last known position and the current eased diameter/alpha.
        if (curAlpha > 0.005 && curDiameter > 0.1) {
          jobs.push({ x: lastTipX * dpr, y: lastTipY * dpr, size: curDiameter * dpr, alpha: curAlpha })
        }
        return jobs
      }

      function trailTick(now: number) {
        raf = null
        frame += 1
        canvas.dataset.cursorFrames = String(frame)

        if (mode === 'active' && stopAt == null && now - lastMoveAt > STOP_GRACE_MS) {
          stopAt = now
          lenAtStop = trailLen
        }

        const dtFrame = lastTickAt ? clamp(now - lastTickAt, 1, 64) : 16
        lastTickAt = now

        if (stopAt == null) {
          const target = targetTrailLength(emaSpeed)
          trailLen += (target - trailLen) * clamp(dtFrame / LEN_SMOOTH_MS, 0, 1)
        } else {
          const t = clamp((now - stopAt) / (DURATION.trailRetract * 1000), 0, 1)
          trailLen = lenAtStop * (1 - easeSineInOut(t))
        }
        trailLen = Math.max(0, trailLen)

        const wantDiameter = targetDiameter(state) * (pressDown ? 0.85 : 1)
        const wantAlpha = targetAlpha(state)
        const k = clamp(dtFrame / (DURATION.tipState * 1000), 0, 1)
        curDiameter += (wantDiameter - curDiameter) * k
        curAlpha += (wantAlpha - curAlpha) * k

        const color = inkColor()
        const tipImg = makeTip(color, BASE_TIP_PX, dpr)
        const jobs = buildJobs(now)

        let frameBBox: BBox | null = null
        for (const job of jobs) {
          const half = job.size / 2
          frameBBox = unionBBox(frameBBox, { x0: job.x - half, y0: job.y - half, x1: job.x + half, y1: job.y + half })
        }
        const clearBox = unionBBox(prevBBox, frameBBox)
        if (clearBox) {
          ctx.clearRect(
            Math.floor(clearBox.x0) - 2,
            Math.floor(clearBox.y0) - 2,
            Math.ceil(clearBox.x1 - clearBox.x0) + 4,
            Math.ceil(clearBox.y1 - clearBox.y0) + 4,
          )
        }
        for (const job of jobs) {
          ctx.globalAlpha = job.alpha
          ctx.drawImage(tipImg, job.x - job.size / 2, job.y - job.size / 2, job.size, job.size)
        }
        ctx.globalAlpha = 1
        prevBBox = frameBBox

        const retracting = stopAt != null && now - stopAt < DURATION.trailRetract * 1000
        const settling = trailLen > 0.5 || Math.abs(curDiameter - wantDiameter) > 0.05 || Math.abs(curAlpha - wantAlpha) > 0.002
        const keepGoing = stopAt == null || retracting || settling
        if (keepGoing) scheduleTrailTick()
        else mode = 'idle'
      }

      function clearTrail() {
        if (raf != null) {
          cancelAnimationFrame(raf)
          raf = null
        }
        resetTrail()
        mode = 'idle'
        lastTickAt = 0
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        prevBBox = null
      }

      function onResize() {
        sizeCanvas()
        clearTrail()
      }

      let state: CursorState = 'boot'
      let moved = false
      let locked = false
      let pressDown = false
      let currentEl: HTMLElement | null = null // closest(CURSOR_TARGETS) match -- boundary-crossing dedup key, never the fallthrough ancestor
      let resolvedEl: HTMLElement | null = null // element whose own dataset actually drove the current state/text (may be currentEl's [data-cursor] ancestor -- see resolveState)
      let stuckEl: HTMLElement | null = null
      let stuckSetX: ((v: number) => void) | null = null
      let stuckSetY: ((v: number) => void) | null = null
      let lastX = 0
      let lastY = 0
      let scrollScheduled = false
      // R4-4c fix 2 ("with no trail"): true only while the current target
      // resolved via the brush-figure-full handoff (resolveState's
      // `viaBrushFull`) -- the "open" label cursor shown once a project
      // image is fully painted must draw no trail, but every other
      // `data-cursor="text"` target keeps its trail unchanged.
      let suppressTrail = false

      const textObserver = new MutationObserver(() => {
        if (resolvedEl?.dataset.cursor === 'text') {
          const text = resolvedEl.dataset.cursorText ?? null
          if (text) showLabel(text)
        }
      })

      // 49-round4-plan.md §E2 item 4 fix 4: `src/ink/brush.ts` -- not this
      // module -- owns the "is this figure fully painted yet" fact and
      // publishes it as `data-brush-full` on the `[data-brush]` figure
      // itself (loosely coupled: an attribute, not an import). `resolveState`
      // below reads it once per `enterTarget`, but a still pointer never
      // re-fires `pointerover`/`pointerout` on its own, so without this
      // observer the cursor would stay pinned at whatever it resolved to at
      // entry even after the figure finishes painting mid-hover. Mirrors
      // `textObserver` above: re-resolve and reapply on the one attribute
      // changing, never a rAF poll ("no rAF while idle").
      const brushFullObserver = new MutationObserver(() => {
        if (currentEl) enterTarget(currentEl)
      })

      function setDotState(next: CursorState) {
        canvas.dataset.cursorState = next
      }

      // R4-4c fix 2: mirrors `suppressTrail` onto the canvas as a plain
      // `data-*` flag (same testability pattern as `data-cursor-state`/
      // `data-brush-full`) so check:transitions can assert "no trail" is
      // actually active for the brush-full handoff without having to
      // sample rendered pixels against a geometry it can't see ahead of
      // time.
      function setNoTrail(v: boolean) {
        if (v) canvas.dataset.cursorNoTrail = ''
        else delete canvas.dataset.cursorNoTrail
      }

      // 51-round5-plan.md item 2 fix: `hideLabel` below is a 300ms
      // (`DURATION.state`) fade to opacity 0. Re-entering a card inside
      // that window (the everyday gesture) used to read `currentOpacity`
      // straight off the live, still-tweening value and early-return
      // whenever it happened to still be >0 with the same text queued --
      // which left the in-flight fade running uncancelled on to 0: a
      // correct `state=text, text="open"` over an invisible label.
      // Sampling that interpolated value at an arbitrary wall-clock delay
      // is itself a race (confirmed by direct reproduction: which
      // millisecond gaps read back visible vs invisible shifts between
      // runs -- not a fixed boundary), so `hidingLabel` below replaces the
      // opacity read as the guard: an explicit flag set the instant a hide
      // starts and cleared only once it actually completes, immune to
      // when-exactly-is-this-sampled jitter. Reproduction also ruled out
      // the plan note's two named "second path" candidates -- `goAway`/
      // `onDocMouseEnter` (document-level mouseleave/mouseenter never
      // fired; the pointer never left the document, only the card) and a
      // second `showLabel` call from `brushFullObserver` (brush.ts only
      // clears `data-brush-full` once `startFade` runs, `HOLD_MS`==1500ms
      // after the pointer leaves -- long after any of the re-entry gaps in
      // question, so the figure never stops resolving to "open" and the
      // observer never re-fires mid-window). The single early-return race
      // is the whole bug; this fix removes it structurally instead of
      // patching around a second cause that isn't there.
      let hidingLabel = false

      function showLabel(text: string) {
        const currentOpacity = Number(gsap.getProperty(label, 'opacity'))
        if (!hidingLabel && labelText.textContent === text && currentOpacity > 0) return
        hidingLabel = false
        if (currentOpacity > 0) {
          if (labelText.textContent === text) {
            // A hide (or an already-visible label) was interrupted before
            // finishing -- reverse back to fully shown from wherever the
            // tween currently is; no need to drop through opacity 0 first
            // since the text is already correct.
            gsap.to(label, { opacity: 1, scale: 1, duration: DURATION.state, ease: EASE.dry, overwrite: 'auto' })
            return
          }
          gsap.to(label, {
            opacity: 0,
            duration: 0.1,
            ease: EASE.dry,
            overwrite: 'auto',
            onComplete: () => {
              labelText.textContent = text
              gsap.set(label, { scale: 1 })
              gsap.to(label, { opacity: 1, duration: 0.15, ease: EASE.dry })
            },
          })
          return
        }
        labelText.textContent = text
        gsap.fromTo(
          label,
          { scale: 0.6, opacity: 0 },
          { scale: 1, opacity: 1, duration: DURATION.state, ease: EASE.dry, overwrite: 'auto' },
        )
      }

      function hideLabel() {
        hidingLabel = true
        gsap.to(label, {
          opacity: 0,
          scale: 0.6,
          duration: DURATION.state,
          ease: EASE.dry,
          overwrite: 'auto',
          onComplete: () => {
            hidingLabel = false
          },
        })
      }

      function applyState(next: CursorState, text: string | null) {
        state = next
        setDotState(next)
        if (next === 'text' && text) showLabel(text)
        else hideLabel()
      }

      // 49-round4-plan.md §E2 item 4 fix 4: returns the resolved state, the
      // element whose own dataset produced it -- `enterTarget` needs the
      // latter to read `data-cursor-text` and to arm/observe the right
      // node, since a fully-painted brush figure resolves to an *ancestor's*
      // state, not its own -- and (R4-4c fix 2) whether this resolution
      // *is* that brush-figure-full handoff, so `enterTarget` can suppress
      // the trail for exactly that state and nothing else (an ordinary
      // `data-cursor="text"` target, e.g. EmailCopy's "copy" label, keeps
      // its trail as before).
      function resolveState(el: HTMLElement | null): { state: CursorState; source: HTMLElement | null; viaBrushFull: boolean } {
        if (!el) return { state: 'default', source: null, viaBrushFull: false }
        if (el.dataset.cursor) return { state: el.dataset.cursor as CursorState, source: el, viaBrushFull: false }
        // BrushReveal figures (src/ink/brush.ts) carry `data-brush`, not
        // `data-cursor` — ProjectCard/Gallery never need to know about the
        // cursor at all, the same way they don't already know about it for
        // "text"/"open" (that comes from the wrapping TransitionLink).
        if (el.dataset.brush !== undefined) {
          // If enclosed in a [data-cursor] target (such as the card's own
          // TransitionLink, cursor="open"), resolve to that target immediately so
          // hovering over the card's painted or grayscale image goes straight to
          // the "open" cursor instead of a wider brush footprint.
          const ancestor = (el.parentElement?.closest('[data-cursor]') as HTMLElement | null) ?? null
          if (ancestor) {
            return { ...resolveState(ancestor), viaBrushFull: true }
          }
          return { state: 'brush', source: el, viaBrushFull: false }
        }
        return { state: 'default', source: el, viaBrushFull: false }
      }

      function armStick(el: HTMLElement) {
        stuckEl = el
        stuckSetX = gsap.quickTo(el, 'x', { duration: DURATION.stick, ease: EASE.follow })
        stuckSetY = gsap.quickTo(el, 'y', { duration: DURATION.stick, ease: EASE.follow })
      }

      function releaseStick(el: HTMLElement) {
        gsap.to(el, { x: 0, y: 0, duration: 0.25, ease: EASE.lift, overwrite: 'auto' })
        stuckEl = null
        stuckSetX = null
        stuckSetY = null
      }

      function updateStick(x: number, y: number) {
        if (!stuckEl) return
        const rect = stuckEl.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const clampOffset = (v: number) => Math.max(-STICK_MAX, Math.min(STICK_MAX, v))
        stuckSetX?.(clampOffset((x - cx) * 0.2))
        stuckSetY?.(clampOffset((y - cy) * 0.2))
      }

      function enterTarget(el: HTMLElement | null) {
        currentEl = el
        const resolved = resolveState(el)
        resolvedEl = resolved.source
        suppressTrail = resolved.viaBrushFull || resolved.state === 'text'
        setNoTrail(suppressTrail)
        applyState(resolved.state, resolved.source?.dataset.cursorText ?? null)
        if (resolved.source?.dataset.cursor === 'stick') armStick(resolved.source)
        if (resolved.source?.dataset.cursor === 'text') {
          textObserver.observe(resolved.source, { attributes: true, attributeFilter: ['data-cursor-text'] })
        }
        // fix 4: watch the brush figure itself (not resolved.source, which
        // may already be the fallthrough ancestor) for the one attribute
        // that can change the resolution while still hovering it.
        if (el?.dataset.brush !== undefined) {
          brushFullObserver.observe(el, { attributes: true, attributeFilter: ['data-brush-full'] })
        }
      }

      function leaveTarget() {
        textObserver.disconnect()
        brushFullObserver.disconnect()
        if (resolvedEl?.dataset.cursor === 'stick') releaseStick(resolvedEl)
        currentEl = null
        resolvedEl = null
        suppressTrail = false
        setNoTrail(false)
      }

      function onPointerOver(e: PointerEvent) {
        if (e.pointerType === 'touch' || locked) return
        const el = (e.target as Element | null)?.closest?.(CURSOR_TARGETS) as HTMLElement | null
        if (el === currentEl) return
        if (currentEl) leaveTarget()
        enterTarget(el)
      }

      function onPointerOut(e: PointerEvent) {
        if (e.pointerType === 'touch' || locked) return
        const left = (e.target as Element | null)?.closest?.(CURSOR_TARGETS) as HTMLElement | null
        if (!left || left !== currentEl) return
        const related = (e.relatedTarget as Element | null)?.closest?.(CURSOR_TARGETS)
        if (related === currentEl) return
        leaveTarget()
        applyState('default', null)
      }

      function snapLabel(x: number, y: number) {
        gsap.set(label, { x, y })
        setLabelX(x)
        setLabelY(y)
      }

      // 47 §R2: queues one pointer sample into the spine (drawn on the next
      // rAF tick, not synchronously here, so a burst of pointermove events
      // in one frame costs array pushes, not canvas work), updates the
      // speed EMA that drives the trail's target length, and marks the
      // trail 'active', resetting the spine exactly once per idle->active
      // transition so a fresh stroke starts from nothing instead of picking
      // up mid-length.
      function addStrokePoint(x: number, y: number, now: number) {
        // F1's old guard, kept: mid page-transition the tip is hidden under
        // the ink cover (resetCursor already cleared the canvas at lock
        // time), so nothing should schedule a frame for a transition nobody
        // can see.
        if (locked) return
        const wasIdle = mode === 'idle'
        if (wasIdle) resetTrail()
        mode = 'active'
        // Movement resumed mid-retraction: cancel it outright and continue
        // from whatever length is currently painted, or the trail would pop
        // (jump back up) instead of resuming smoothly.
        stopAt = null
        if (!wasIdle) {
          const dt = Math.max(1, now - lastMoveAt)
          const dist = Math.hypot(x - lastTipX, y - lastTipY)
          const speed = dist / dt
          const k = clamp(dt / SPEED_EMA_MS, 0, 1)
          emaSpeed = emaSpeed + (speed - emaSpeed) * k
        }
        lastMoveAt = now
        lastTipX = x
        lastTipY = y
        commitPoint(x, y, now)
        scheduleTrailTick()
      }

      function onPointerMove(e: PointerEvent) {
        if (e.pointerType === 'touch') {
          if (moved) clearTrail()
          moved = false
          return
        }
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : []
        const list = events.length ? events : [e]
        for (const ev of list) {
          const x = ev.clientX
          const y = ev.clientY
          const now = ev.timeStamp || performance.now()

          if (!moved) {
            moved = true
            document.documentElement.classList.add('has-custom-cursor')
            snapLabel(x, y)
            // Resolve whatever's actually under the pointer instead of
            // assuming 'default' — `pointerover` for this same position
            // may have already fired (or may not have, depending on the
            // browser's event order for the very first move), and either
            // way this is the source of truth.
            const el = document.elementFromPoint(x, y) as Element | null
            const target = (el?.closest?.(CURSOR_TARGETS) as HTMLElement | null) ?? null
            if (target !== currentEl) {
              if (currentEl) leaveTarget()
              enterTarget(target)
            }
          }

          addStrokePoint(x, y, now)
          lastX = x
          lastY = y
        }
        setLabelX(lastX)
        setLabelY(lastY)
        if (stuckEl) updateStick(lastX, lastY)
      }

      function onPointerDown(e: PointerEvent) {
        if (e.pointerType === 'touch' || locked) return
        pressDown = true
        gsap.to(label, { scale: '*=0.96', duration: 0.1, ease: EASE.dry, overwrite: 'auto' })
      }

      function onPointerUp(e: PointerEvent) {
        if (e.pointerType === 'touch' || locked) return
        pressDown = false
        gsap.to(label, {
          scale: state === 'text' ? 1 : 0.6,
          duration: DURATION.microOut,
          ease: EASE.dry,
          overwrite: 'auto',
        })
      }

      function goAway() {
        if (locked) return
        // The same guard `showLabel` reads (`hidingLabel`) has to know
        // about this fade too -- `onDocMouseEnter` re-applies the current
        // state on return, which for `state === 'text'` calls `showLabel`
        // again, and without this it would race exactly like `hideLabel`
        // used to (see the note above `hidingLabel`'s declaration).
        hidingLabel = true
        gsap.to(label, {
          opacity: 0,
          duration: DURATION.stateOut,
          ease: EASE.dry,
          overwrite: 'auto',
          onComplete: () => {
            hidingLabel = false
          },
        })
        clearTrail()
      }

      function onDocMouseLeave() {
        goAway()
      }
      function onWindowBlur() {
        goAway()
      }
      function onVisibilityChange() {
        if (document.hidden) goAway()
      }
      function onDocMouseEnter(e: MouseEvent) {
        if (locked || !moved) return
        snapLabel(e.clientX, e.clientY)
        // The pointer just teleported back into the document — anchor the
        // trail here instead of carrying over whatever it was before it
        // left, or the next move would read as one huge (fake) stroke
        // across the gap.
        resetTrail()
        lastX = e.clientX
        lastY = e.clientY
        lastTipX = e.clientX
        lastTipY = e.clientY
        applyState(state, resolvedEl?.dataset.cursorText ?? null)
      }

      function onScroll() {
        if (locked || !moved || scrollScheduled) return
        scrollScheduled = true
        requestAnimationFrame(() => {
          scrollScheduled = false
          const el = document.elementFromPoint(lastX, lastY) as Element | null
          const target = el?.closest?.(CURSOR_TARGETS) as HTMLElement | null
          if (target === currentEl) return
          if (currentEl) leaveTarget()
          enterTarget(target)
        })
      }

      function doLock() {
        locked = true
      }

      function doReset() {
        state = 'default'
        if (currentEl) leaveTarget()
        canvas.dataset.cursorState = 'default'
        hidingLabel = false
        gsap.set(label, { opacity: 0, scale: 0.6 })
        clearTrail()
        curDiameter = TIP_DIAMETER
        curAlpha = TIP_ALPHA
        labelText.textContent = ''
        if (stuckEl) {
          gsap.set(stuckEl, { x: 0, y: 0 })
          stuckEl = null
          stuckSetX = null
          stuckSetY = null
        }
      }

      function doUnlock() {
        locked = false
        const el = document.elementFromPoint(lastX, lastY) as Element | null
        const target = el?.closest?.(CURSOR_TARGETS) as HTMLElement | null
        enterTarget(target)
      }

      const mm = gsap.matchMedia()
      mm.add(
        { fine: '(hover: hover) and (pointer: fine)', reduce: '(prefers-reduced-motion: reduce)' },
        (context) => {
          const { fine, reduce } = context.conditions as { fine: boolean; reduce: boolean }
          if (!fine || reduce) {
            document.documentElement.classList.remove('has-custom-cursor')
            gsap.set(label, { opacity: 0 })
            return
          }

          sizeCanvas()
          window.addEventListener('resize', onResize)
          document.addEventListener('pointerover', onPointerOver)
          document.addEventListener('pointerout', onPointerOut)
          document.addEventListener('pointermove', onPointerMove)
          document.addEventListener('pointerdown', onPointerDown)
          document.addEventListener('pointerup', onPointerUp)
          document.addEventListener('mouseleave', onDocMouseLeave)
          document.addEventListener('mouseenter', onDocMouseEnter)
          window.addEventListener('blur', onWindowBlur)
          document.addEventListener('visibilitychange', onVisibilityChange)
          window.addEventListener('scroll', onScroll, { passive: true })

          controls = { lock: doLock, unlock: doUnlock, reset: doReset }

          return () => {
            window.removeEventListener('resize', onResize)
            document.removeEventListener('pointerover', onPointerOver)
            document.removeEventListener('pointerout', onPointerOut)
            document.removeEventListener('pointermove', onPointerMove)
            document.removeEventListener('pointerdown', onPointerDown)
            document.removeEventListener('pointerup', onPointerUp)
            document.removeEventListener('mouseleave', onDocMouseLeave)
            document.removeEventListener('mouseenter', onDocMouseEnter)
            window.removeEventListener('blur', onWindowBlur)
            document.removeEventListener('visibilitychange', onVisibilityChange)
            window.removeEventListener('scroll', onScroll)
            textObserver.disconnect()
            brushFullObserver.disconnect()
            document.documentElement.classList.remove('has-custom-cursor')
            clearTrail()
            gsap.set(label, { opacity: 0, willChange: 'auto' })
            if (stuckEl) gsap.set(stuckEl, { x: 0, y: 0 })
            moved = false
            currentEl = null
            stuckEl = null
            controls = noopControls
          }
        },
      )

      return () => mm.kill()
    },
    { scope: canvasRef, dependencies: [] },
  )

  // 12-motion.md §Cursor "Route change": resets on every location.key
  // change independent of TransitionProvider, so it covers POP too.
  useEffect(() => {
    resetCursor()
  }, [location.key])

  return (
    <>
      {/* 46/47-round3-plan.md: one fixed, full-viewport canvas paints the
          brush tip and its trail as a single continuous stroke (src/ink/
          stroke.ts's `makeTip`), replacing the old CSS-blob dot plus pooled
          trail spans. No mix-blend-mode (46 owner decision 4): the stamp
          colour itself flips between ink and paper depending on
          `data-menu-open` on <html>. The old separate 64px "brush" `<span>`
          is gone too (47 §R2): the tip itself grows to that footprint at
          ~30% alpha over reveal media, one less DOM layer. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-cursor-dot
        data-cursor-state="boot"
        className="pointer-events-none fixed inset-0 z-cursor h-screen w-screen"
      />
      <span
        ref={labelRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-cursor flex h-10 scale-[0.6] items-center whitespace-nowrap rounded-full bg-ink px-4 font-display text-lg italic text-background opacity-0 will-change-transform"
      >
        <span ref={labelSpanRef} />
      </span>
    </>
  )
}
