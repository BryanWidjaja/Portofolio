import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// Type-only import so TS loads vite-react-ssg's `declare module 'vite'`
// augmentation (adds `ssgOptions` to Vite's UserConfig) for this file's
// project (tsconfig.node.json), which otherwise never sees it.
import type {} from 'vite-react-ssg/node'
import { postbuild } from './scripts/postbuild.mjs'
import { site } from './src/content/site.ts'
import { projects } from './src/content/projects.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // vite-react-ssg's build() passes ssgOptions.mode as Vite's *and* Node's
  // default NODE_ENV (14-approved.md Â§Variant mechanism uses `--mode
  // about-accordion` for the D3 variant). Left alone, any mode other than
  // literally "production" makes Vite resolve React's development export
  // condition, shipping an unminified, warning-emitting bundle. Modes other
  // than "development" are still real production builds here, so pin
  // NODE_ENV explicitly instead of letting it default to the mode string.
  if (mode !== 'development') process.env.NODE_ENV = 'production'

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5174, strictPort: true },
    ssgOptions: {
      entry: 'src/main.tsx',
      // flat: "/about" -> dist/about.html. "nested" (about/index.html) looked
      // equivalent at first, but broke client hydration for every non-index
      // route (vite preview's directory-index resolution left the client
      // router matching "/" instead of the requested path) -- see
      // scripts/postbuild.mjs for the corresponding 404.html handling.
      dirStyle: 'flat',
      onFinished: async (dir) => {
        await postbuild(dir, { site, projects })
      },
    },
  }
})
