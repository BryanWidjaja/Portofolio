import type { RouteRecord } from 'vite-react-ssg'
import { RootLayout } from './app/RootLayout'
import { Home } from './pages/Home'
import { About } from './pages/About'
import { ProjectDetail } from './pages/ProjectDetail'
import { NotFound } from './pages/NotFound'
import { projects } from './content/projects'

// T2 (14-approved): eager routes, so every page ships in the initial bundle
// and transitions never wait on a chunk. `projects/:slug` is prerendered for
// every content/projects.ts slug via getStaticPaths; the literal "404" route
// gives postbuild.mjs a real prerendered page to copy to dist/404.html,
// while "*" is the client-side (unprerendered) catch-all.
export const routes: RouteRecord[] = [
  {
    path: '/',
    Component: RootLayout,
    children: [
      { index: true, Component: Home },
      { path: 'about', Component: About },
      {
        path: 'projects/:slug',
        Component: ProjectDetail,
        getStaticPaths: () => projects.map((project) => `projects/${project.slug}`),
      },
      { path: '404', Component: NotFound },
      { path: '*', Component: NotFound },
    ],
  },
]
