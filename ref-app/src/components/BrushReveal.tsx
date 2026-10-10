import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../app/MotionProvider'
import { mountBrush } from '../ink/brush'
import { ProjectImage, projectSrcSet } from './ProjectImage'
import { observeNearViewportImages } from '../motion/nearViewportImages'

type BrushRevealProps = {
  src: string
  alt: string
  width: number
  height: number
  eager?: boolean
  className?: string
  sizes?: string
  deferUntilNear?: boolean
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

export function BrushReveal({ src, alt, width, height, eager = false, className = '', sizes = '100vw', deferUntilNear = false }: BrushRevealProps) {
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

  useEffect(() => {
    const figure = figureRef.current
    if (!deferUntilNear || !figure) return
    return observeNearViewportImages(figure, '160px 0px')
  }, [deferUntilNear])

  const fallbackMarkup = deferUntilNear
      ? `<picture><source type="image/avif" srcset="${projectSrcSet({ src, alt, width, height }, 'avif')}" sizes="${sizes}"><img src="${src}" srcset="${projectSrcSet({ src, alt, width, height }, 'webp')}" sizes="${sizes}" alt="${alt.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}" width="${width}" height="${height}" class="brush-noscript absolute inset-0 size-full object-contain" loading="lazy" decoding="async"></picture>`
    : ''

  return (
    <span ref={figureRef} data-brush className={`brush-figure relative isolate block size-full ${className}`}>
      <ProjectImage
        img={{ src: greySrc(src), alt: '', width, height }}
        alt=""
        sizes={sizes}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={deferUntilNear ? 'low' : eager ? 'high' : undefined}
        deferUntilNear={deferUntilNear}
        className="brush-grey absolute inset-0 size-full object-contain"
      />
      <ProjectImage
        ref={colourRef}
        img={{ src, alt, width, height }}
        sizes={sizes}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={deferUntilNear ? 'low' : eager ? 'high' : undefined}
        deferUntilNear={deferUntilNear}
        className="brush-colour pointer-events-none absolute inset-0 size-full object-contain"
      />
      {deferUntilNear ? <noscript dangerouslySetInnerHTML={{ __html: fallbackMarkup }} /> : null}
    </span>
  )
}
