import { useEffect } from 'react'

/**
 * 13-build-plan.md §Architecture: "Entrances subscribe through
 * motion/pageEnter.ts (emitPageEnter / usePageEnter)." E4 fires `"first"`
 * once, on the first Page mount of the session (see motion/Page.tsx). E5's
 * TransitionProvider will later call `onPageEnter("push" | "pop")` at the
 * right point in the curtain flow — nothing here changes for that.
 */
export type PageEnterMode = 'first' | 'push' | 'pop'

type Listener = (mode: PageEnterMode) => void

const listeners = new Set<Listener>()

/** Broadcasts a page-enter event to every currently-mounted subscriber. */
export function onPageEnter(mode: PageEnterMode) {
  listeners.forEach((fn) => fn(mode))
}

/** Subscribes for the lifetime of the calling component. */
export function usePageEnter(fn: Listener) {
  useEffect(() => {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [fn])
}
