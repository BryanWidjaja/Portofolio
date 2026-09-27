import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import { gsap } from '../motion/gsap'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  return typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  return false
}

const ReducedMotionContext = createContext(false)

/** True when the user prefers reduced motion. Server snapshot is always `false`. */
export function useReducedMotion() {
  return useContext(ReducedMotionContext)
}

/**
 * 13-build-plan.md §Architecture: the only place that toggles
 * `html.motion-ready` and reads the reduced-motion preference (the head
 * script in index.html sets the initial pre-hydration state; this takes
 * over for the session, including a live preference change).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const prevReduced = useRef(reduced)

  useEffect(() => {
    const root = document.documentElement
    const changed = prevReduced.current !== reduced
    prevReduced.current = reduced

    if (reduced) {
      root.classList.remove('motion-ready')
      // Flow 9 footer note: a mid-session flip to reduced motion snaps
      // whatever is in flight to its end state instead of freezing it
      // half-revealed.
      if (changed) gsap.globalTimeline.getChildren(true, true, false).forEach((tween) => tween.progress(1))
    } else {
      root.classList.add('motion-ready')
    }
  }, [reduced])

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return
    // Applied motion rules: dev-only `?slowmo` reviews every flow at 1/4 speed.
    const params = new URLSearchParams(window.location.search)
    if (params.has('slowmo')) gsap.globalTimeline.timeScale(0.25)
  }, [])

  return <ReducedMotionContext.Provider value={reduced}>{children}</ReducedMotionContext.Provider>
}
