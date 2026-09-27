import { useRef } from 'react'
import { gsap, useGSAP, ScrollTrigger } from '../motion/gsap'
import { useReducedMotion } from '../app/MotionProvider'
import { DURATION, EASE } from '../motion/tokens'

const VARIANTS = ['/ink/line-1.svg', '/ink/line-2.svg', '/ink/line-3.svg']

type BrushLineProps = {
  /** Picks one of the 3 generated paths (scripts/ink-textures.mjs) — 42
   * §Components: "never 2 alike in a row". Callers in a list pass their
   * own index; it wraps, so any run of consecutive integers alternates. */
  variant?: number
  className?: string
}

/**
 * V19 (41-ink-replace-map.md): replaces `border-t border-line`/`[data-rule]`
 * everywhere (DividerRow, Footer, About's experience rows). Self-contained
 * like `BrushReveal` — it owns its own reveal instead of going through
 * `motion/reveal.ts`'s batch, since it shows up nested inside arbitrary
 * layouts, not just as a page's `[data-reveal]` item.
 *
 * Two masks intersect (42 §Components "CSS mask: line SVG ∩ brush-edge
 * strip"): the tapered-width line SVG defines the stroke's own silhouette
 * (hidden/pointed tips, never a blunt square end), and the brush-edge
 * strip's `--line-x` slides across
 * it the same way `.brush-word` writes a word, so the line looks drawn by
 * the same ink front instead of just fading or scaling in.
 */
export function BrushLine({ variant = 0, className = '' }: BrushLineProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduced = useReducedMotion()
  const index = ((variant % VARIANTS.length) + VARIANTS.length) % VARIANTS.length
  const src = VARIANTS[index]
  const maskImage = `url(${src}), url(/ink/brush-edge.webp)`

  useGSAP(
    () => {
      const el = ref.current
      // Reduced motion never sets `html.motion-ready` (app/MotionProvider.tsx),
      // so `.brush-line`'s own CSS default (styles/base.css) already keeps
      // this fully drawn and visible — nothing to wire up.
      if (!el || reduced) return
      const trigger = ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () =>
          gsap.to(el, {
            '--line-x': '0%',
            opacity: 1,
            duration: DURATION.brushLine,
            ease: EASE.travel,
            onStart: () => gsap.set(el, { willChange: 'mask-position' }),
            onComplete: () => gsap.set(el, { willChange: 'auto' }),
          }),
      })
      return () => trigger.kill()
    },
    { scope: ref, dependencies: [reduced] },
  )

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-rule
      className={`brush-line block h-[3px] w-full ${className}`.trim()}
      style={{
        maskImage,
        WebkitMaskImage: maskImage,
      }}
    />
  )
}
