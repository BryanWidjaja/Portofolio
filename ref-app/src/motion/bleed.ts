import { gsap } from './gsap'
import { DURATION, EASE } from './tokens'

/**
 * 42-ink-direction.md §Storyboards, 41-ink-replace-map.md M3/M4: everything
 * that isn't a brush-write. Plain text/meta/label items ink in — opacity
 * only, no `y` (bar §D: "no block sliding up 40px on scroll") — and
 * media/cover figures blot-bleed open via `.blot-mask`'s `--blot-size`
 * (styles/base.css), the same mask motion/brushText.ts's headings never
 * touch. `.blot-mask` masks the whole figure, canvas included, when it
 * wraps a BrushReveal figure — intended (44-ink-build-plan.md §Exec tasks
 * E3 risk note).
 *
 * Orchestrator fix (R3 review, 2026-09-25): `--blot-size: 300%` is "open"
 * but not *gone* — `blot.webp`'s own alpha is a soft centred blob, so even
 * at 300% zoom its feathered edge falls inside the figure's box near the
 * top/bottom, painting a faint paper-coloured vignette that a settled
 * figure carried forever (nothing ever cleared `mask-image`). Invisible on
 * the old soft placeholder art; obvious on R3's crisp colour-chart squares.
 * Fixed the way brushText.ts's `settleWords` fixed the identical bug on
 * `.bleed-word`: once a media/cover blot-bleed completes (or, under
 * reduced motion, immediately — the same figures never got an explicit
 * settle before), `mask-image: none` so a settled/static figure carries no
 * mask at all.
 */

type IntroKind = 'text' | 'meta' | 'media' | 'cover'

function settleBlotMask(els: HTMLElement | HTMLElement[]) {
  gsap.set(els, { willChange: 'auto', maskImage: 'none' })
}

/** M3: `[data-intro]` on pageEnter, scoped to one page's root. */
export function playIntro(root: HTMLElement, opts: { reduced: boolean; delay: number }) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-intro]'))
  if (!els.length) return

  if (opts.reduced) {
    gsap.set(els, { opacity: 1 })
    const media = els.filter((el) => el.dataset.intro === 'media' || el.dataset.intro === 'cover')
    if (media.length) settleBlotMask(media)
    return
  }

  els.forEach((el, index) => {
    const kind = (el.dataset.intro || 'text') as IntroKind
    const delay = opts.delay + index * DURATION.introStagger
    if (kind === 'media' || kind === 'cover') {
      // `.blot-mask` already starts at --blot-size:0% once motion-ready is
      // set (styles/base.css) — nothing to set here, just animate it open.
      // F1 (45 §Owner feedback item 2): `mask-size` is the one "large
      // mask-size/mask-position animation" this app has — growing the mask
      // resamples the raster at a new scale every tick, unlike the other
      // brush masks which only ever slide a fixed-size strip. `willChange`
      // scopes that repaint to the figure's own layer while it grows, then
      // clears — see brushText.ts's promoteMaskPosition for the sibling fix.
      gsap.to(el, {
        '--blot-size': '300%',
        duration: DURATION.blotBleed,
        ease: EASE.bleed,
        delay,
        onStart: () => gsap.set(el, { willChange: 'mask-size' }),
        onComplete: () => settleBlotMask(el),
      })
    } else {
      gsap.set(el, { opacity: 0 })
      gsap.to(el, { opacity: 1, duration: DURATION.inkIn, ease: EASE.bleed, delay })
    }
  })
}
