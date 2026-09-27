import { useEffect, useRef } from 'react'
import { createInkCoverEngine, type InkCoverEngine } from '../app/inkCover'

const noopEngine: InkCoverEngine = {
  prewarm: () => {},
  cover: async () => {},
  recede: async () => {},
  abort: async () => {},
  release: () => {},
  dispose: () => {},
}
let controls: InkCoverEngine = noopEngine

/**
 * 45-ink-approved.md D7 + 44-ink-build-plan.md §Architecture: TransitionProvider
 * drives the ink cover through these module functions instead of owning
 * GSAP timelines/refs itself — the same lock/unlock/reset split
 * components/Cursor.tsx already uses for a singleton that never remounts.
 */
export function coverInk(origin: { x: number; y: number }) {
  return controls.cover(origin)
}
export function recedeInk() {
  return controls.recede()
}
export function abortInk() {
  return controls.abort()
}
export function releaseInk() {
  controls.release()
}

/**
 * A full-screen canvas mounted once by RootLayout (like Cursor), replacing
 * the earlier ink-curtain component this app used before D7. The WebGL/
 * CSS-fallback engine itself lives in app/inkCover.ts, framework-free like
 * src/ink/brush.ts — this component only owns the DOM node and the
 * prewarm-on-idle call. The root `[data-curtain]` element is unchanged
 * (44-ink-build-plan.md §Architecture: "the host keeps the [data-curtain]
 * root"), so nothing downstream that selects it needs to know the look
 * changed.
 */
export function InkCover() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = createInkCoverEngine(canvas)
    controls = engine
    engine.prewarm()
    return () => {
      controls = noopEngine
      engine.dispose()
    }
  }, [])

  return (
    <div aria-hidden="true" data-curtain className="invisible fixed inset-0 z-curtain pointer-events-none">
      {/* F1 (45 §Owner feedback item 2, "stale will-change left on idle
          ones"): this canvas's own element is never CSS-transformed --
          app/inkCover.ts only ever writes `canvas.style.opacity`/
          `.background` (the GL path draws *into* the canvas, which isn't a
          CSS property at all). `will-change-transform` on a full-viewport
          layer was promoting a compositing layer for a property that
          never moved; `opacity` is the one that actually animates. */}
      <canvas ref={canvasRef} className="absolute inset-0 block size-full will-change-[opacity]" />
    </div>
  )
}
