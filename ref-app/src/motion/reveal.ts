import { gsap, ScrollTrigger } from './gsap'
import { DURATION, EASE } from './tokens'
import { writeHeadingWords } from './brushText'

/**
 * M4 (42-ink-direction.md §Storyboards, 41-ink-replace-map.md): batches
 * `[data-reveal=label|text|heading|media]`, each on `top 85%`, once.
 * `heading` brush-writes (motion/brushText.ts, shared with M2); label/text
 * ink in via opacity only — no `y` anywhere (bar §D); media blot-bleeds
 * open (motion/bleed.ts's mask, shared with M3). `[data-rule]` draws
 * itself (`components/BrushLine.tsx` owns its own reveal, self-contained
 * like `BrushReveal`) so it isn't handled here any more. Callers scope
 * this to their own subtree (a page's Page wrapper, or the persistent
 * Footer) so repeated navigations never double-batch the same elements.
 *
 * Orchestrator fix (R3 review, 2026-09-25): see motion/bleed.ts's identical
 * comment — a settled `media` figure never had its `.blot-mask` cleared, so
 * `blot.webp`'s own soft edge (still present at the "open" --blot-size)
 * left a faint paper-coloured vignette at rest, invisible on the old soft
 * placeholder art but visible on R3's crisp colour-chart squares.
 */
export function createScrollReveals(root: HTMLElement, reduced: boolean) {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
  if (!items.length) return () => {}

  if (reduced) {
    // `.blot-mask` and `.brush-word` default open on their own once
    // `motion-ready` is never set (styles/base.css); only the plain
    // opacity items and the heading's own wrapper (also `[data-reveal]`,
    // opacity-gated in styles/motion.css) need an explicit nudge. `media`
    // figures additionally need their mask cleared outright (not just
    // "open") — see this file's own top comment.
    gsap.set(items, { opacity: 1 })
    const media = items.filter((el) => el.dataset.reveal === 'media')
    if (media.length) gsap.set(media, { maskImage: 'none' })
    return () => {}
  }

  const opacityItems = items.filter((el) => el.dataset.reveal === 'label' || el.dataset.reveal === 'text')
  if (opacityItems.length) gsap.set(opacityItems, { opacity: 0 })

  const triggers = ScrollTrigger.batch(items, {
    start: 'top 85%',
    once: true,
    onEnter: (entries) => {
      entries.forEach((entry, i) => {
        const el = entry as HTMLElement
        const kind = el.dataset.reveal || 'text'
        const delay = i * DURATION.introStagger

        if (kind === 'heading') {
          writeHeadingWords(el, reduced)
        } else if (kind === 'scroll') {
          // A project card's mounted scroll (styles/base.css `.scroll`): it
          // starts rolled up under `motion-ready` and unrolls by pure CSS
          // transition once this attribute lands -- no per-frame JS.
          gsap.delayedCall(delay, () => el.setAttribute('data-unrolled', ''))
        } else if (kind === 'media') {
          // F1 (45 §Owner feedback item 2): see motion/bleed.ts's identical
          // branch for why `--blot-size` (mask-size) gets a transient
          // `willChange` and the other masks don't.
          gsap.to(el, {
            '--blot-size': '300%',
            duration: DURATION.blotBleed,
            ease: EASE.bleed,
            delay,
            onStart: () => gsap.set(el, { willChange: 'mask-size' }),
            onComplete: () => gsap.set(el, { willChange: 'auto', maskImage: 'none' }),
          })
        } else {
          gsap.to(el, { opacity: 1, duration: DURATION.batchFade, ease: EASE.bleed, delay })
        }
      })
    },
  })

  return () => triggers.forEach((st) => st.kill())
}
