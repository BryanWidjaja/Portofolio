/**
 * 13-build-plan.md §Architecture: "Page signals ready from useLayoutEffect."
 * Mirrors pageEnter.ts's module-listener shape. TransitionProvider awaits
 * `waitForPageReady(pathname)` after `navigate()`, racing it against the
 * 1500ms failsafe (12-motion.md §Page transitions "Ready never signals").
 */
type Listener = (pathname: string) => void

const listeners = new Set<Listener>()

export function signalReady(pathname: string) {
  listeners.forEach((fn) => fn(pathname))
}

function onReady(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

const FONTS_CAP_MS = 800
const FAILSAFE_MS = 1500

/**
 * Resolves once `pathname`'s Page has signalled ready and fonts are ready
 * (capped), or after the failsafe — whichever comes first. Always
 * unsubscribes its listener, even when the failsafe wins, so a route that
 * never mounts (e.g. an aborted transition) can't leak a live listener.
 * Returns `true` when it resolved normally, `false` when the failsafe fired.
 */
export function waitForPageReady(pathname: string): Promise<boolean> {
  let offReady = () => {}
  const readyPromise = new Promise<void>((resolve) => {
    offReady = onReady((p) => {
      if (p === pathname) resolve()
    })
  })
  const fontsPromise = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve()
  const fontsCapped = Promise.race([fontsPromise, delay(FONTS_CAP_MS)])
  const ready = Promise.all([readyPromise, fontsCapped]).then(() => true as const)
  const failsafe = delay(FAILSAFE_MS).then(() => false as const)

  return Promise.race([ready, failsafe]).then((result) => {
    offReady()
    if (!result) document.documentElement.setAttribute('data-transition-failsafe', '')
    return result
  })
}
