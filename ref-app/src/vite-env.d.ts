/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** D3 variant mechanism, notes/plan/14-approved.md Â§Variant mechanism. */
  readonly VITE_ABOUT_VARIANT?: 'bio' | 'accordion'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /** Set once by main.tsx's boot callback; read by index.html's failsafe script. */
  __booted?: boolean
}
