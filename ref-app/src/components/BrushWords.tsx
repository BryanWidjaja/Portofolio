import type { ElementType } from 'react'

type BrushWordsProps = {
  /** Split into per-word brush masks (M2: detail/About/404/heading h1s and
   * scroll-revealed headings). 47-round3-plan.md §R6a: the old `lines`
   * prop (M1, the Home hero's two overlapping lines) is gone along with
   * that hero's own per-word bleed — pages/Home.tsx writes its h1 by hand
   * now, since the collapse (§R6b) also needs a letter-level split this
   * component's word-level masking doesn't produce. */
  text: string
  as: ElementType
  className?: string
  /** Overrides the auto tabIndex below — Home's `#work`/`#contact` h2s are
   * hash-scroll focus targets even though they aren't the h1. */
  tabIndex?: number
  /** M4 hook: `data-reveal="heading"` on a scroll-revealed heading, read by
   * motion/reveal.ts's `createScrollReveals`. Passed straight through. */
  'data-reveal'?: string
}

/**
 * Replaces `SplitChars` (41-ink-replace-map.md M1/M2): renders text as
 * `aria-hidden` word spans, each carrying the `.bleed-word` CSS mask
 * (styles/base.css; G10, 46 item 10 -- was `.brush-word`'s left-to-right
 * sweep), with the plain string as the element's `aria-label`. Word-level,
 * not per-character — the centre-out bleed (motion/brushText.ts) grows each
 * word's own mask from its centre, it doesn't need a DOM node per letter.
 * No animation is set here (that's always a runtime GSAP tween,
 * motion/brushText.ts): the mask itself, gated by `html.motion-ready`,
 * is the only static hiding mechanism, so prerendered HTML never ships
 * hidden content without a JS guard.
 */
export function BrushWords({
  text,
  as: As,
  className = '',
  tabIndex: tabIndexProp,
  'data-reveal': dataReveal,
}: BrushWordsProps) {
  const label = text
  // Every h1 this renders is the page-transition's focus target (E5), so it
  // needs to be programmatically focusable without ever joining the Tab
  // order (base.css suppresses the ring for tabindex="-1" specifically,
  // since that value is never a keyboard stop).
  const tabIndex = tabIndexProp ?? (As === 'h1' ? -1 : undefined)

  return (
    <As aria-label={label} className={className} tabIndex={tabIndex} data-reveal={dataReveal}>
      {label.split(' ').map((word, wordIndex) => (
        <span key={wordIndex}>
          {wordIndex > 0 ? ' ' : null}
          <span data-word aria-hidden="true" className="bleed-word">
            {word}
          </span>
        </span>
      ))}
    </As>
  )
}
