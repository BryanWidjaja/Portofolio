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

// V11/M9 (41-ink-replace-map.md), 42-ink-direction.md §Brush reveal: the
// home page's project cards rest in grey and brush to colour under the
// pointer. The grey <img> (`.brush-grey`) is a pre-baked raster (R4-4,
// scripts/project-images.mjs, `greySrc` below), never a CSS filter/blend
// on the colour image (45's 633ms compositor-Commit measurement). The
// colour <img> (`.brush-colour`) sits on top of it; src/ink/brush.ts
// reveals it by animating its `clip-path` as an ink-splash blob
// (2026-09-28 performance rewrite -- the canvas compositing this component
// used to host is gone; see that module's header).
//
// Reduced motion never mounts the engine and never adds `html.brush-ready`,
// so styles/base.css's `html:not(.brush-ready)` rule -- an instant opacity
// swap of the colour layer on hover/focus -- covers reduced motion,
// no-JS and SSR alike.
function greySrc(src: string): string {
  return src.replace(/(\.\w+)$/, '-grey$1')
}

export function BrushReveal({ src, alt, width, height, eager = false, className = '' }: BrushRevealProps) {
  const figureRef = useRef<HTMLSpanElement>(null)
  const colourRef = useRef<HTMLImageElement>(null)
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
    const colour = colourRef.current
    if (!figure || !colour) return
    return mountBrush(figure, colour)
  }, [reducedMotion])

  return (
    <span ref={figureRef} data-brush className={`brush-figure relative isolate block size-full ${className}`}>
      <img
        src={greySrc(src)}
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
        fetchPriority={eager ? 'low' : undefined}
        className="brush-grey absolute inset-0 size-full object-cover"
      />
      <img
        ref={colourRef}
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding={eager ? 'sync' : 'async'}
        fetchPriority={eager ? 'low' : undefined}
        className="brush-colour pointer-events-none absolute inset-0 size-full object-cover"
      />
    </span>
  )
}
