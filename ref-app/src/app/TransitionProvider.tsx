import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { LiveRegion } from '../components/LiveRegion'
import { lockCursor, unlockCursor, resetCursor } from '../components/Cursor'
import { coverInk, recedeInk, abortInk } from '../components/InkCover'
import { gsap, ScrollTrigger } from '../motion/gsap'
import { DURATION, EASE } from '../motion/tokens'
import { onPageEnter } from '../motion/pageEnter'
import { waitForPageReady } from '../motion/ready'
import { useLenisControls, getSavedScroll } from './LenisProvider'
import { useMenuControls } from './MenuProvider'
import { useReducedMotion } from './MotionProvider'

type TransitionPhase = 'idle' | 'covering' | 'swapping' | 'holding' | 'revealing'
/** `origin`: where the ink seeds from (45 §Storyboards "0 click → ink seeds
 * at the pointer"; keyboard activation uses the element's centre instead —
 * see TransitionLink). No destination label any more (MD3 dropped, 44
 * §Conflicts): the arriving page's own title brush-writes itself instead. */
type NavigateOpts = { origin?: { x: number; y: number } }

const TransitionContext = createContext<(to: string, opts?: NavigateOpts) => void>(() => {})
/** `<TransitionLink>`'s click handler and the same-page hash flows both call this. */
export function useTransitionNavigate() {
  return useContext(TransitionContext)
}

const PhaseContext = createContext<TransitionPhase>('idle')
export function useTransitionState() {
  return useContext(PhaseContext)
}

function expoOut(t: number) {
  return t === 1 ? 1 : 1 - 2 ** (-10 * t)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function parseTo(to: string) {
  const hashIndex = to.indexOf('#')
  const pathname = hashIndex === -1 ? to : to.slice(0, hashIndex) || '/'
  const hash = hashIndex === -1 ? '' : to.slice(hashIndex)
  return { pathname, hash }
}

/**
 * 12-motion.md §Page transitions + 44-ink-build-plan.md §Architecture. Owns
 * the whole idle → covering → swapping → holding → revealing state machine,
 * the ready/failsafe wait, focus and the live-region announce — unchanged
 * from before D7. Only the visual calls changed: `coverInk`/`recedeInk`/
 * `abortInk` (components/InkCover.tsx) replace the old GSAP curtain
 * timelines this provider used to own directly. MD4: back/forward never
 * gets a cover — a POP is either a plain instant-swap-and-restore, or (if
 * it interrupts a click-driven transition) an abort that fades the ink
 * away in 300ms before doing the same.
 *
 * `holding` (46-polish-plan.md item 3c) carries no CSS of its own —
 * styles/motion.css only hides `#main` for `swapping` — so moving into it
 * the instant the destination has mounted, scrolled and refreshed its
 * triggers (before the leftover `DURATION.hold` buffer below) un-hides the
 * page early and lets that buffer double as paint time under the still-
 * opaque ink, instead of the mount landing after the cover lifts
 * (diagnosis: 149-188ms of it did, every time).
 */
export function TransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const lenis = useLenisControls()
  const menu = useMenuControls()
  const reduced = useReducedMotion()

  const [phase, setPhase] = useState<TransitionPhase>('idle')
  const busyRef = useRef(false)
  const liveRegionRef = useRef<HTMLDivElement>(null)

  // Read through refs inside the async flow below instead of the hook
  // values directly, so a long-lived `runTransition` call always sees the
  // latest controls without needing to be re-created every render.
  const menuRef = useRef(menu)
  menuRef.current = menu
  const lenisRef = useRef(lenis)
  lenisRef.current = lenis
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  function setTransitionPhase(next: TransitionPhase) {
    setPhase(next)
    document.documentElement.dataset.transition = next
  }

  function announce(text: string) {
    const el = liveRegionRef.current
    if (!el) return
    el.textContent = ''
    requestAnimationFrame(() => {
      if (el) el.textContent = text
    })
  }

  function focusH1() {
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true })
  }

  function focusHashTarget(hash: string) {
    const section = document.querySelector(hash)
    const heading = section?.querySelector<HTMLElement>('h2') ?? (section as HTMLElement | null)
    heading?.focus({ preventScroll: true })
  }

  function smoothScrollTo(hash: string) {
    const target = hash || 0
    lenisRef.current.scrollTo(target, reducedRef.current ? { immediate: true } : { duration: 1.1, easing: expoOut })
  }

  function jumpScrollTo(hash: string) {
    lenisRef.current.scrollTo(hash || 0, { immediate: true, force: true })
  }

  async function runSamePage(hash: string) {
    if (menuRef.current.open) {
      menuRef.current.close()
      await delay(150)
    }
    smoothScrollTo(hash)
    if (hash) {
      await delay(reducedRef.current ? 0 : 1100)
      focusHashTarget(hash)
      announce(document.title)
    }
  }

  async function runTransition(to: string, opts?: NavigateOpts) {
    const { pathname, hash } = parseTo(to)
    busyRef.current = true
    lockCursor()
    resetCursor()
    lenisRef.current.stop()

    if (reducedRef.current) {
      // Flow 9: navigate, scroll to top, fade `main`, focus, announce — no cover, ever.
      navigate(to)
      window.scrollTo(0, 0)
      const main = document.getElementById('main')
      if (main) gsap.fromTo(main, { opacity: 0 }, { opacity: 1, duration: DURATION.fade, ease: EASE.fade })
      await waitForPageReady(pathname)
      ScrollTrigger.refresh()
      lenisRef.current.start()
      onPageEnter('push')
      focusH1()
      announce(document.title)
      unlockCursor()
      busyRef.current = false
      return
    }

    setTransitionPhase('covering')
    const origin = opts?.origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    await coverInk(origin)

    setTransitionPhase('swapping')
    // The close animation is never seen — the ink already covers it.
    if (menuRef.current.open) menuRef.current.forceClose()
    const swapStart = performance.now()
    navigate(to)
    await waitForPageReady(pathname)
    jumpScrollTo(hash)
    ScrollTrigger.refresh()
    setTransitionPhase('holding')
    const holdRemaining = DURATION.hold * 1000 - (performance.now() - swapStart)
    if (holdRemaining > 0) await delay(holdRemaining)

    setTransitionPhase('revealing')
    lenisRef.current.start()
    const pageEnterDelay = window.matchMedia('(min-width: 768px)').matches ? 350 : 200
    const pageEnterTimer = window.setTimeout(() => onPageEnter('push'), pageEnterDelay)
    await recedeInk()
    window.clearTimeout(pageEnterTimer)

    setTransitionPhase('idle')
    if (hash) focusHashTarget(hash)
    else focusH1()
    announce(document.title)
    unlockCursor()
    busyRef.current = false
  }

  function navigateWithTransition(to: string, opts?: NavigateOpts) {
    if (busyRef.current) return // already running: click ignored, no queue
    const { pathname, hash } = parseTo(to)
    if (pathname === location.pathname) {
      if (hash && hash !== location.hash) navigate(to)
      runSamePage(hash)
      return
    }
    runTransition(to, opts)
  }

  const navigateRef = useRef(navigateWithTransition)
  navigateRef.current = navigateWithTransition
  const contextValue = useMemo(() => (to: string, opts?: NavigateOpts) => navigateRef.current(to, opts), [])

  // MD4 back/forward. Only reacts to POP: PUSH/REPLACE are already driven
  // end-to-end by runTransition/runSamePage above, so re-handling them here
  // would double up the flow.
  const prevKeyRef = useRef(location.key)
  useEffect(() => {
    if (location.key === prevKeyRef.current) return
    prevKeyRef.current = location.key
    if (navigationType !== 'POP') return

    let cancelled = false

    async function handlePop() {
      const wasBusy = busyRef.current
      if (wasBusy) {
        setTransitionPhase('covering')
        await abortInk()
        if (cancelled) return
        busyRef.current = false
        if (menuRef.current.open) menuRef.current.forceClose()
        lenisRef.current.start()
        unlockCursor()
      }
      if (cancelled) return
      setTransitionPhase('idle')

      const hash = location.hash
      await waitForPageReady(location.pathname)
      if (cancelled) return
      const saved = hash || getSavedScroll(location.key)
      lenisRef.current.scrollTo(saved, { immediate: true, force: true })
      ScrollTrigger.refresh()
      onPageEnter('pop')
      resetCursor()

      const atTop = !hash && (typeof saved !== 'number' || saved < 4)
      if (atTop) focusH1()
      else if (hash) focusHashTarget(hash)
      announce(document.title)
    }

    handlePop()
    return () => {
      cancelled = true
    }
  }, [location.key, location.hash, location.pathname, navigationType])

  return (
    <TransitionContext.Provider value={contextValue}>
      <PhaseContext.Provider value={phase}>
        <LiveRegion ref={liveRegionRef} />
        {children}
      </PhaseContext.Provider>
    </TransitionContext.Provider>
  )
}
