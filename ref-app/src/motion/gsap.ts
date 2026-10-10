import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

// 13-build-plan.md §Architecture: the only `registerPlugin` call in the app.
// Every component imports gsap/ScrollTrigger/useGSAP from this module,
// never straight from the packages, so registration always runs first.
//
// 49-round4-plan.md §E1b: ScrollTrigger.enable() (called synchronously by
// registerPlugin below, once) starts its own permanent internal rAF
// self-loop -- `_rafBugFix` in the unminified source, `function e(){ return
// _enabled && requestAnimationFrame(e) }` -- a Firefox repaint-consistency
// workaround, unconditional, with no feature/browser gate. It is entirely
// separate from gsap.ticker (sleep()/wake() on the ticker have zero effect
// on it) and it is gated only by a module-private `_enabled` flag with no
// per-frame public toggle. The only exported lever is the static
// ScrollTrigger.disable()/.enable() pair, and both are too destructive to
// call on every idle/wake cycle: `disable()` makes every ScrollTrigger
// instance's `init()` become a no-op the moment `_enabled` is 0 -- any
// ScrollTrigger.create() call made while "asleep" (e.g. a route remount)
// would silently stub out, breaking nav collapse / hero collapse /
// BrushLine. `enable()` re-runs its whole boot routine on top of that,
// including `gsap.matchMedia().add('(orientation: portrait)', ...)`, which
// has no dedupe (MatchMedia.add() unconditionally pushes a new Context and
// registers a new mediaQueryList "change" listener every call -- verified
// in gsap-core.js) -- calling it more than once leaks a listener per call.
// So instead of touching `_enabled`, we capture the *one* callback
// ScrollTrigger.enable() hands to requestAnimationFrame during this
// synchronous registerPlugin call (nothing else calls rAF in that window --
// verified empirically) and gate only that exact callback reference behind
// our own idle flag. Every other rAF consumer (Lenis, the GSAP ticker,
// React) goes through untouched, and ScrollTrigger's own `_enabled`/trigger
// state is never written to -- this only changes whether that one specific,
// already-inert filler loop keeps scheduling itself.
let scrollTriggerRafLoop: FrameRequestCallback | null = null
let scrollTriggerRafAsleep = false

export function sleepScrollTriggerRafLoop() {
  scrollTriggerRafAsleep = true
}
export function wakeScrollTriggerRafLoop() {
  if (!scrollTriggerRafAsleep) return
  scrollTriggerRafAsleep = false
  // Nothing else will re-schedule this callback once we've been swallowing
  // it, so kick it once directly (bypassing our own wrapper is unnecessary
  // -- it'll just see scrollTriggerRafAsleep is now false and pass through).
  if (scrollTriggerRafLoop) window.requestAnimationFrame(scrollTriggerRafLoop)
}

if (typeof window !== 'undefined') {
  const nativeRaf = window.requestAnimationFrame.bind(window)
  let capturing = true
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    if (capturing) scrollTriggerRafLoop = cb
    if (cb === scrollTriggerRafLoop && scrollTriggerRafAsleep) return 0
    return nativeRaf(cb)
  }) as typeof window.requestAnimationFrame

  gsap.registerPlugin(useGSAP, ScrollTrigger)
  capturing = false
  ;(window as unknown as { __stRafDebug?: unknown }).__stRafDebug = () => ({
    src: scrollTriggerRafLoop ? scrollTriggerRafLoop.toString().slice(0, 200) : null,
    asleep: scrollTriggerRafAsleep,
    triggers: ScrollTrigger.getAll().map((t) => ({
      landingParallax: Boolean(t.trigger?.closest('[data-parallax-plate]')),
      start: t.start,
      end: t.end,
      progress: t.progress,
      isActive: t.isActive,
      scroll: t.scroll ? t.scroll() : null,
    })),
    scrollY: window.scrollY,
    tickerFrame: gsap.ticker.frame,
    globalActive: gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.isActive()).length,
  })
} else {
  gsap.registerPlugin(useGSAP, ScrollTrigger)
}

export { gsap, ScrollTrigger, useGSAP }
