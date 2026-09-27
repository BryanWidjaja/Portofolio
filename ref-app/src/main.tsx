import './styles/index.css'
import { ViteReactSSG } from 'vite-react-ssg'
import { routes } from './routes'

// T1 (14-approved): vite-react-ssg 0.9 + React Router 6.30. React Router v7
// future flags silence the deprecation warnings ahead of a later major bump.
export const createRoot = ViteReactSSG(
  {
    routes,
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  },
  () => {
    // 12-motion.md §Storyboards flow 1 (row H): scroll restoration becomes
    // manual (E5 owns MD4's back/forward restore) and `__booted` tells
    // index.html's failsafe script the bundle actually ran. Lenis/motion
    // init itself lives in MotionProvider/LenisProvider (RootLayout).
    if (typeof window !== 'undefined') {
      window.__booted = true
      history.scrollRestoration = 'manual'
    }
  },
)
