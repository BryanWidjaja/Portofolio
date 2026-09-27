import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../app/MotionProvider'
import { mountBrush } from '../ink/brush'

type BrushRevealProps = {
  src: string
  alt: string
  width: number
  height: number
  eager?: boolean
  className?: string
}

// V11/M9 (41-ink-replace-map.md), 42-ink-direction.md §Brush reveal: a grey
// <img> (CSS grayscale + multiply, styles/base.css `.brush-grey`) sits under
// a canvas that paints the same image's colour back in wherever
// src/ink/brush.ts's accumulated mask has coverage. 46-polish-plan.md item
// 3b: the grey->colour blend is baked *inside* that canvas (brush.ts's
// renderComposite) rather than via a DOM `mix-blend-mode: color` on this
// element — one of the two blend layers 45 measured costing 633ms of
// compositor Commit per route change, the other being the hero's own
// multiply (S2's fix). The canvas below is a plain normal-blend,
// pointer-events:none layer. Reduced motion never mounts the canvas at all
// (44 §check:transitions B4) and instead relies on styles/base.css's
// `html:not(.brush-ready) ... :hover/:focus-within` fallback, which also
// covers no-JS/SSR since `.brush-ready` is only ever added once a figure's
// canvas engine actually starts (mountBrush).
export function BrushReveal({ src, alt, width, height, eager = false, className = '' }: BrushRevealProps) {
  const figureRef = useRef<HTMLSpanElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    // `.brush-ready` toggles with the *current* reducedMotion value on every
    // run, not just once on mount -- useSyncExternalStore's SSR snapshot can
    // render a single transient `false` pass during hydration before it
    // settles, and without this the class would stick from that pass alone.
    if (reducedMotion) {
      document.documentElement.classList.remove('brush-ready')
      return
    }
    document.documentElement.classList.add('brush-ready')
    const figure = figureRef.current
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!figure || !img || !canvas) return
    return mountBrush(figure, img, canvas)
  }, [reducedMotion])

  return (
    <span ref={figureRef} data-brush className={`brush-figure relative isolate block size-full ${className}`}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
        fetchPriority={eager ? 'low' : undefined}
        className="brush-grey absolute inset-0 size-full object-cover"
      />
      {reducedMotion ? null : (
        <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
      )}
    </span>
  )
}
