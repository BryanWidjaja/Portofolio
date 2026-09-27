import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLenisControls } from './LenisProvider'

type MenuControls = {
  open: boolean
  toggle: () => void
  openMenu: () => void
  close: () => void
  /** Instant close, no animation (flow 4B: the curtain covers the menu first). */
  forceClose: () => void
  /** MenuOverlay reads this once, on the render that turns `open` false, to
   * tell a force-close apart from an animated one — both just flip the same
   * boolean, and only the overlay's own GSAP effect can tell them apart. */
  instantRef: { current: boolean }
}

const noopRef = { current: false }
const MenuContext = createContext<MenuControls>({
  open: false,
  toggle: () => {},
  openMenu: () => {},
  close: () => {},
  forceClose: () => {},
  instantRef: noopRef,
})

export function useMenuControls() {
  return useContext(MenuContext)
}

/**
 * 13-build-plan.md §Architecture: open/close/forceClose, `inert` on main
 * and footer, Lenis held while open (hold-counted, so a transition that
 * starts mid-menu-open can hold it too). Focus trap, Esc and the open/close
 * GSAP timelines live in MenuOverlay itself (12-motion.md M7) — this
 * provider only owns the state everything else needs to react to.
 *
 * Renders only the context, not <MenuOverlay/> itself: MenuOverlay's own
 * links are TransitionLinks, which need TransitionContext, and
 * TransitionProvider (which needs this provider's context, for
 * forceClose) has to sit inside MenuProvider rather than the other way
 * round. So RootLayout renders <MenuOverlay/> down inside
 * TransitionProvider's subtree instead, where both contexts are in scope.
 */
export function MenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const lenis = useLenisControls()
  const instantRef = useRef(false)

  useEffect(() => {
    const main = document.getElementById('main')
    const footer = document.querySelector('footer')
    if (open) {
      main?.setAttribute('inert', '')
      footer?.setAttribute('inert', '')
    } else {
      main?.removeAttribute('inert')
      footer?.removeAttribute('inert')
    }
  }, [open])

  const openMenu = useCallback(() => {
    if (open) return
    lenis.stop()
    instantRef.current = false
    setOpen(true)
  }, [open, lenis])

  const close = useCallback(() => {
    if (!open) return
    instantRef.current = false
    setOpen(false)
    lenis.start()
    // Flow 7 close: focus returns to MenuButton once the close animation
    // finishes (800ms — MenuOverlay's panel starts rolling up 150ms after
    // the links start fading out, then takes 650ms to roll fully closed).
    window.setTimeout(() => {
      document.querySelector<HTMLElement>('[data-menu-button]')?.focus()
    }, 800)
  }, [open, lenis])

  const forceClose = useCallback(() => {
    if (!open) return
    instantRef.current = true
    setOpen(false)
    lenis.start()
  }, [open, lenis])

  const toggle = useCallback(() => {
    if (open) close()
    else openMenu()
  }, [open, close, openMenu])

  return (
    <MenuContext.Provider value={{ open, toggle, openMenu, close, forceClose, instantRef }}>
      {children}
    </MenuContext.Provider>
  )
}
