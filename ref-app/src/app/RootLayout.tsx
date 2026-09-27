import { Outlet } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Cursor } from '../components/Cursor'
import { InkCover } from '../components/InkCover'
import { MenuOverlay } from '../components/MenuOverlay'
import { Footer } from '../components/Footer'
import { site } from '../content/site'
import { MotionProvider } from './MotionProvider'
import { LenisProvider } from './LenisProvider'
import { MenuProvider } from './MenuProvider'
import { TransitionProvider } from './TransitionProvider'

// Chrome shell shared by every route. Provider order (13-build-plan.md
// §Architecture): Motion, then Lenis (needs `reduced` from Motion), then
// Menu, then Transition (innermost, so it can call into both — forceClose
// on navigation, and the menu's own Lenis hold). <MenuOverlay/> is rendered
// down here rather than by MenuProvider itself, so its own TransitionLinks
// resolve the real TransitionContext instead of the outside-the-tree
// default. Cursor has no cross-component state to share (it's a singleton),
// so it stays a plain component here, with lock/unlock/reset as module
// functions TransitionProvider imports directly. InkCover is the same kind
// of singleton as Cursor (45 §Adjustments D7): it renders the
// `[data-curtain]` root once and exposes coverInk/recedeInk/abortInk as
// module functions instead of props, so it sits alongside Cursor here too.
export function RootLayout() {
  return (
    <MotionProvider>
      <LenisProvider>
        <MenuProvider>
          <TransitionProvider>
            <a
              href="#main"
              className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-skip-link focus-visible:rounded-full focus-visible:bg-background focus-visible:px-4 focus-visible:py-2 focus-visible:text-ink"
            >
              {site.skipLabel}
            </a>
            <InkCover />
            <Cursor />
            <Nav />
            <main id="main">
              <Outlet />
            </main>
            <Footer />
            <MenuOverlay />
          </TransitionProvider>
        </MenuProvider>
      </LenisProvider>
    </MotionProvider>
  )
}
