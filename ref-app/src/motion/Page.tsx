import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useGSAP } from './gsap'
import { onPageEnter, usePageEnter, type PageEnterMode } from './pageEnter'
import { signalReady } from './ready'
import { playTitleWrite } from './brushText'
import { playIntro } from './bleed'
import { createScrollReveals } from './reveal'
import { DURATION } from './tokens'
import { useReducedMotion } from '../app/MotionProvider'

let firstLoadTriggered = false

type PageProps = {
  children: ReactNode
  /** 'home' plays the M1/M17 signature cascade; every other page plays M2. */
  variant?: 'home' | 'title'
}

/**
 * 13-build-plan.md §Architecture: "Page signals ready … Entrances subscribe
 * through motion/pageEnter.ts … In E4, Page emits `first`; E5 moves
 * emission into the provider (push, pop)." Every page wraps its JSX in
 * this so M1–M4/M8/M17 all run off the same pageEnter signal, scoped to
 * that page's own subtree (killed automatically on route change).
 */
export function Page({ children, variant = 'title' }: PageProps) {
  const scope = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<PageEnterMode | null>(null)
  const location = useLocation()

  usePageEnter(useCallback((m: PageEnterMode) => setMode(m), []))

  // 13-build-plan.md §Architecture: "Page signals ready from useLayoutEffect."
  // TransitionProvider (E5) awaits this via motion/ready.ts before it
  // scrolls and reveals. Keyed on pathname so a remount under the same
  // route (new project slug) signals again.
  useLayoutEffect(() => {
    signalReady(location.pathname)
  }, [location.pathname])

  // First load of the session: wait for fonts (capped) then fire pageEnter
  // ourselves. Later navigations are TransitionProvider's job (push/pop).
  //
  // This has to be a passive effect (useEffect), not a layout effect: when
  // `document.fonts.ready` is already resolved (fonts preloaded and
  // parsed before hydration, the common case), `Promise.race(...).then()`
  // settles on a microtask — which runs before React gets to *this*
  // component's own `usePageEnter` subscription above if that subscription
  // is a layout effect's sibling passive effect scheduled for later. Both
  // being useEffects, in the same declaration order, guarantees the
  // subscription commits first, so `onPageEnter('first')` never fires to
  // zero listeners.
  useEffect(() => {
    if (firstLoadTriggered) return
    firstLoadTriggered = true
    const fontsReady = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve()
    const capped = new Promise((resolve) => setTimeout(resolve, DURATION.fontsCapMs))
    Promise.race([fontsReady, capped]).then(() => onPageEnter('first'))
  }, [])

  useGSAP(
    () => {
      const el = scope.current
      if (!mode || !el) return

      if (variant === 'home') {
        // 47-round3-plan.md §R6a supersedes M1's own call here: "the home
        // h1 has no separate word bleed" any more — pages/Home.tsx's own
        // one-stroke intro (motion/heroStroke.ts) reveals the name and the
        // painting together, wired off the same pageEnter broadcast this
        // effect fires from, independently (motion/pageEnter.ts's listener
        // set takes any number of subscribers). `playHeroName` stays for
        // every other page's h1 in the `else` branch below.
      } else {
        playTitleWrite(el, reduced)
      }

      playIntro(el, { reduced, delay: variant === 'home' ? DURATION.heroIntroDelay : DURATION.introDelay })
      createScrollReveals(el, reduced)
    },
    { scope, dependencies: [mode, reduced, variant] },
  )

  return <div ref={scope}>{children}</div>
}
