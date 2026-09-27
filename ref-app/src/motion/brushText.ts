import { gsap } from './gsap'
import { DURATION, EASE } from './tokens'

/**
 * 42-ink-direction.md §Tokens/§Storyboards, 41-ink-replace-map.md M1/M2/M4:
 * brush-write for `components/BrushWords.tsx`'s `[data-word]` spans.
 *
 * G10 (46 item 10, 45 §Polish round): was a left-to-right sweep -- each word
 * slid a brush-edge strip's `mask-position` across itself, which read as an
 * off-theme directional wipe. Replaced with a centre-out 晕染 bleed: every
 * word carries `.bleed-word` (styles/base.css), `/ink/blot.webp`'s centred
 * blob mask. Growing `--bleed-size` from 0% (the closed state
 * `html.motion-ready .bleed-word` sets) to 420% (`BLEED_SIZE_OPEN`, the
 * class's own default-open value) reveals the word outward from its own
 * centre instead of sliding a strip. `settleWords` then sets
 * `maskImage: 'none'` so the settled word carries no idle paint layer and is
 * never clipped by the blot's own soft corner vignette. No `y`/`yPercent`/
 * rotate anywhere (bar §D).
 */

const BLEED_SIZE_OPEN = '420%' // must match .bleed-word's default value, styles/base.css

function wordsIn(root: HTMLElement | null, selector: string) {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(selector)) : []
}

/**
 * M1: the Home hero's two-line name. Replays on every pageEnter mode
 * (first/push/pop) — 45-ink-approved.md §Storyboards "Back/forward:
 * entrances replay" — only motion/stamp.ts's seal beat is first-load-only.
 * "the brush breaks, the meaning carries on" (41 M1): line 2 starts at
 * T0+.55, before line 1's .8s stroke lifts, so the two overlap instead of
 * queuing. Returns the timeline so
 * the caller (motion/Page.tsx) can sequence the seal — and later, the
 * hero inscription (deferred to E2) — right after it without a rewrite:
 * anything added as a further sequential `tl.to(...)` call lands after
 * line 2 automatically, and a `"+="`-positioned seal shifts with it.
 */
export function playHeroName(root: HTMLElement, reduced: boolean): gsap.core.Timeline | null {
  const lines = wordsIn(root, 'h1 [data-brush-line]')
  if (!lines.length) return null
  const wordsByLine = lines.map((line) => wordsIn(line, '[data-word]'))
  const allWords = wordsByLine.flat()
  if (!allWords.length) return null

  if (reduced) {
    gsap.set(allWords, { '--bleed-size': BLEED_SIZE_OPEN })
    return null
  }

  const tl = gsap.timeline()
  wordsByLine.forEach((words, i) => {
    tl.to(
      words,
      {
        '--bleed-size': BLEED_SIZE_OPEN,
        duration: DURATION.heroWrite,
        ease: EASE.bleed,
        stagger: DURATION.wordStagger,
        onStart: () => promoteMaskSize(words),
        onComplete: () => settleWords(words),
      },
      i === 0 ? 0 : DURATION.heroOverlap,
    )
  })
  return tl
}

// F1 (45 §Owner feedback item 2, "missing will-change on genuinely
// animated layers"): `--bleed-size` drives `mask-size` (styles/base.css
// `.bleed-word`), a paint-triggering property GSAP writes every tick —
// promoting the word's own layer while it's actually growing keeps that
// repaint scoped to the word instead of its surroundings (same pattern as
// motion/bleed.ts's figure blot-bleed). Cleared the moment the bleed lands
// so no idle word carries a stale hint (same item's other half).
function promoteMaskSize(els: HTMLElement[]) {
  gsap.set(els, { willChange: 'mask-size' })
}

// G10 (46 item 10): also drops the mask entirely on complete -- settled
// text then carries no idle paint layer and is never clipped by
// `.bleed-word`'s own soft corner vignette (styles/base.css comment on
// `.bleed-word`). GSAP's CSSPlugin auto-prefixes `maskImage` for browsers
// that still need `-webkit-mask-image`.
function settleWords(els: HTMLElement[]) {
  gsap.set(els, { willChange: 'auto', maskImage: 'none' })
}

/** Shared by M2 (every non-home h1) and M4 (a `[data-reveal="heading"]`
 * element): one write pass, `DURATION.titleWrite` total regardless of word
 * count, so no page ever runs two hero-scale moments in the same viewport
 * (bar §B). */
function writeWords(words: HTMLElement[]) {
  if (!words.length) return
  const stagger = words.length > 1 ? Math.min(DURATION.wordStagger, DURATION.titleWrite / 2 / (words.length - 1)) : 0
  gsap.to(words, {
    '--bleed-size': BLEED_SIZE_OPEN,
    duration: DURATION.titleWrite,
    ease: EASE.bleed,
    stagger,
    onStart: () => promoteMaskSize(words),
    onComplete: () => settleWords(words),
  })
}

/** M2: About/ProjectDetail/NotFound's h1. */
export function playTitleWrite(root: HTMLElement, reduced: boolean) {
  const words = wordsIn(root, 'h1 [data-word]')
  if (!words.length) return
  if (reduced) {
    gsap.set(words, { '--bleed-size': BLEED_SIZE_OPEN })
    return
  }
  writeWords(words)
}

/** M4: a scroll-revealed heading's own words, fired by
 * `motion/reveal.ts`'s `createScrollReveals` once its batch enters. The
 * heading itself is one of the `[data-reveal]` elements CSS hides pre-JS
 * (styles/motion.css); this un-hides it (its words carry the real mask). */
export function writeHeadingWords(heading: HTMLElement, reduced: boolean) {
  const words = wordsIn(heading, '[data-word]')
  gsap.set(heading, { opacity: 1 })
  if (!words.length || reduced) {
    gsap.set(words, { '--bleed-size': BLEED_SIZE_OPEN })
    return
  }
  writeWords(words)
}
