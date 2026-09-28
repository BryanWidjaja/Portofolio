import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useLocation } from 'react-router-dom'
import { gsap, ScrollTrigger, sleepScrollTriggerRafLoop, wakeScrollTriggerRafLoop } from '../motion/gsap'
import { useReducedMotion } from './MotionProvider'

type ScrollToTarget = number | string
type ScrollToOptions = { immediate?: boolean; force?: boolean; duration?: number; easing?: (t: number) => number }
type LenisControls = { stop: () => void; start: () => void; scrollTo: (target: ScrollToTarget, opts?: ScrollToOptions) => void }

const noop: LenisControls = { stop: () => {}, start: () => {}, scrollTo: () => {} }
const LenisContext = createContext<LenisControls>(noop)

/** Hold-counted stop/start so the menu and a page transition can both hold scroll. */
export function useLenisControls() {
  return useContext(LenisContext)
}

const scrollByKey = new Map<string, number>()

/** MD4 back/forward restore (E5) reads the last known scroll for a route's history key. */
export function getSavedScroll(key: string) {
  return scrollByKey.get(key) ?? 0
}

// 13-build-plan.md §Architecture: the only `new Lenis`, created when not
// reduced, owning the GSAP ticker sync. T3 (14-approved): wheel-driven
// smoothing only — `syncTouch` stays off so touch scrolling is native.
//
// 49-round4-plan.md §E1 item 2 (on-demand ticker): `gsap.ticker.add(onTick)`
// used to run unconditionally for the life of the page. GSAP's own ticker
// already auto-sleeps once nothing is animating (gsap-core's
// `Timeline.updateRoot`, gated on `_ticker._listeners.length < 2`) — but a
// permanently-registered external listener is a second listener forever,
// so that gate never re-opens and the whole app's ticker (not just Lenis)
// is pinned awake: diagnosis measured ~375 rAF callbacks per 3s idle even
// scrolled down with 0 style recalcs. `wake()` now adds `onTick` only when
// there's something for Lenis to drive — its own wheel-smoothing lerp
// needs `raf()` ticks to advance (native/touch scroll doesn't: Lenis emits
// its `scroll` event straight from the native scroll listener, so
// `ScrollTrigger.update` below keeps firing even while the ticker sleeps).
// `onTick` removes itself only once Lenis reports settled (`isScrolling`
// false, `velocity` ~0) *and* nothing else on gsap.globalTimeline is
// active, which both stops driving `raf()` and puts the ticker itself to
// sleep. Lenis's own smoothing/feel (`lerp: 0.1`, `smoothWheel`,
// `syncTouch: false`) is untouched — this only changes *when the loop
// runs*.
//
// 49-round4-plan.md §E1b: `idle-hero` (page loaded, never scrolled) still
// measured ~33-45 rAF/s in the final second of a 3s idle window even after
// the above. Root cause: `wake()` was only ever called from the `wheel`
// listener below, so on a page that's never scrolled, `onTick` never runs
// even once — it never gets the chance to sleep anything. The ticker was
// awake purely because *some* boot-time tween (entrance/reveal animations
// elsewhere in the app) had called gsap's own internal `_wake()` when
// created, and nothing ever explicitly slept it again: gsap-core does have
// a built-in autosleep (`Timeline.updateRoot`, gsap-core.js), but it only
// checks every `autoSleep` (120) ticker frames, which — measured — is
// close to the whole length of this scenario's idle window, so the native
// GC hadn't caught up yet. Fix: call `wake()` once at mount too (not only
// on `wheel`), so `onTick` starts watching from t=0 regardless of
// scrolling. Its removal condition already required Lenis to be settled
// before checking `isActive()` — but previously removed itself the instant
// Lenis was settled *regardless* of other GSAP activity (Lenis is settled
// from the moment it's constructed, so on a never-scrolled page that could
// be frame 1), so if a boot tween was still running at that first check, it
// unregistered without ever getting a second look once that tween finished.
// Now it stays attached — riding piggyback on ticks that are *already*
// scheduled by that other activity, not causing any extra ones — until
// both conditions hold, then sleeps for real, same frame the last tween
// settles. The same wake/sleep pair now also gates ScrollTrigger's own
// separate internal rAF self-loop (`sleepScrollTriggerRafLoop`/
// `wakeScrollTriggerRafLoop`, motion/gsap.ts) — entirely independent of
// gsap.ticker, so it needed its own explicit stop/start here.
//
// `isRunning` below checks `._ts` (timeScale), not the public `isActive()`
// — found the hard way: Nav.tsx's scroll-collapse creates the button's
// reveal tween with `delay: DURATION.navCollapseTravel`, and a tween is
// only "active" per GSAP's own `isActive()` once its *own* clock reaches
// `_start` (i.e. once its delay has elapsed) — `isActive()` reads false
// for the whole delay window even though the tween is very much alive and
// due to render soon. Checking `isActive()` here put the ticker to sleep
// the instant collapse() created that tween (same tick, before its delay
// had a chance to run), freezing the button forever at its pre-collapse
// state — caught by check:transitions T3 (`testBack`)'s click on
// `[data-menu-button]` timing out. `_ts` is the exact signal gsap-core's
// own native autosleep (`Timeline.updateRoot`) checks for this same
// purpose (see motion/gsap.ts's comment) — nonzero for anything running or
// merely delayed, zero only once truly paused or complete, which still
// correctly treats Cursor.tsx's parked paused `quickTo()` stubs as idle.
function isRunning(t: gsap.core.Tween | gsap.core.Timeline) {
  return !!(t as unknown as { _ts: number })._ts
}

export function LenisProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  const lenisRef = useRef<Lenis | null>(null)
  const holdCount = useRef(0)
  const location = useLocation()
  const wakeRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (reduced) return

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      anchors: false,
      autoRaf: false,
    })
    lenisRef.current = lenis
    document.documentElement.setAttribute('data-lenis', '')

    // `gsap.ticker.add()` calls the ticker's own internal `_wake()` and is
    // safe to call while already added (it re-registers in place), so
    // `wake` needs no separate "am I already running" flag. Removing
    // `onTick` alone isn't enough to stop rAF promptly: gsap-core's own
    // autosleep only re-checks every `autoSleep` (120) ticks, so the
    // ticker can keep firing for up to ~2s after settling — measured, not
    // theoretical. `gsap.ticker.sleep()` here closes that gap, gated on
    // `isActive()` (not `getChildren().length`, which is always >=1 in
    // this app: Cursor.tsx's `quickTo()` calls park permanent, paused stub
    // tweens on the global timeline for reuse — `isActive()` correctly
    // reads those as inactive) so this never cuts off a tween still
    // genuinely running elsewhere (cursor, menu, hero collapse, …).
    const onTick = (time: number) => {
      lenis.raf(time * 1000)
      const settled = !lenis.isScrolling && Math.abs(lenis.velocity) < 0.01
      const gsapIdle = !gsap.globalTimeline.getChildren(true, true, false).some(isRunning)
      if (settled && gsapIdle) {
        gsap.ticker.remove(onTick)
        gsap.ticker.sleep()
        sleepScrollTriggerRafLoop()
      }
    }
    const wake = () => {
      wakeScrollTriggerRafLoop()
      gsap.ticker.add(onTick)
    }
    wakeRef.current = wake
    // Start watching from mount, not just on the first `wheel` — see the
    // comment above `onTick`. Idempotent with the `wheel` listener below.
    wake()

    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.lagSmoothing(0)

    // `smoothWheel: true` + `syncTouch: false` (locked) means wheel is the
    // only input that starts a Lenis-driven animation needing raf — native
    // scroll (touch, scrollbar, keys) updates via onNativeScroll directly,
    // no ticker required, so `ScrollTrigger.update` above still fires with
    // the ticker asleep. A GSAP tween starting needs no listener here
    // either — creating one already wakes gsap.ticker (gsap-core).
    window.addEventListener('wheel', wake, { passive: true })

    return () => {
      window.removeEventListener('wheel', wake)
      gsap.ticker.remove(onTick)
      lenis.destroy()
      lenisRef.current = null
      document.documentElement.removeAttribute('data-lenis')
    }
  }, [reduced])

  useEffect(() => {
    const key = location.key
    const lenis = lenisRef.current
    const onScroll = () => scrollByKey.set(key, lenis ? lenis.scroll : window.scrollY)
    if (lenis) {
      lenis.on('scroll', onScroll)
      return () => lenis.off('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key, reduced])

  const stop = useCallback(() => {
    holdCount.current += 1
    lenisRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    holdCount.current = Math.max(0, holdCount.current - 1)
    if (holdCount.current === 0) lenisRef.current?.start()
  }, [])

  // MD4/E5: TransitionProvider's swap-phase jump and hash scrolls both go
  // through here. Reduced motion never creates a Lenis instance, so this
  // falls back to a native, instant scroll — that's flow 9's "jump without
  // smoothing" for hash links and the back/forward restore alike.
  const scrollTo = useCallback((target: ScrollToTarget, opts?: ScrollToOptions) => {
    const lenis = lenisRef.current
    if (lenis) {
      // TransitionProvider's eased scrollTo (duration+easing, not
      // immediate) animates lenis the same way a wheel does and needs the
      // ticker awake to advance it — nothing else would wake it here.
      wakeRef.current()
      lenis.scrollTo(target, opts)
      return
    }
    if (typeof target === 'number') {
      window.scrollTo(0, target)
      return
    }
    document.querySelector(target)?.scrollIntoView({ block: 'start' })
  }, [])

  const controls = useMemo(() => ({ stop, start, scrollTo }), [stop, start, scrollTo])

  return <LenisContext.Provider value={controls}>{children}</LenisContext.Provider>
}
