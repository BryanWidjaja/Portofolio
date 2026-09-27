import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useLocation } from 'react-router-dom'
import { gsap, ScrollTrigger } from '../motion/gsap'
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
export function LenisProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  const lenisRef = useRef<Lenis | null>(null)
  const holdCount = useRef(0)
  const location = useLocation()

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

    const onTick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(onTick)
    gsap.ticker.lagSmoothing(0)
    lenis.on('scroll', ScrollTrigger.update)

    return () => {
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
