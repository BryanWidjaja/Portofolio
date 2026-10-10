import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../app/MotionProvider'
import { mountHeroMist } from '../motion/heroMist'

export const HERO_DESKTOP_WIDTHS = [1280, 1920, 2560, 3840] as const
export const HERO_MOBILE_WIDTHS = [720, 1080, 1296] as const

/** Builds an `imageSrcSet`/`srcSet` string shared by the `<picture>` here and
 * the matching `<link rel="preload">` pair in pages/Home.tsx, so the two
 * never drift apart. */
export function heroSrcSet(prefix: 'hero' | 'hero-m', widths: readonly number[], ext: 'avif' | 'webp') {
  return widths.map((w) => `/hero/${prefix}-${w}.${ext} ${w}w`).join(', ')
}

// 42 §Hero "Mobile 9:16": the art-directed crop takes over once the
// viewport is portrait-ish, matching scripts/hero.mjs's own crop rule.
const MOBILE_MEDIA = '(max-aspect-ratio: 3/4)'
const DESKTOP_MEDIA = '(min-aspect-ratio: 3/4)'

/**
 * V13/M8/V31 (41-ink-replace-map.md), 42-ink-direction.md §Hero: the
 * approved painting (45 §G2, scripts/hero.mjs) as the page's LCP. A
 * `<picture>` swaps in the 9:16 crop under `max-aspect-ratio: 3/4` instead
 * of squeezing the 16:9 master. No `fetchPriority` on the `<img>` itself --
 * pages/Home.tsx's own two `<link rel="preload" fetchpriority="high">`
 * tags (mutually exclusive on the same media queries) already put the
 * resolved resource in the preload cache before this element is even
 * parsed, and skipping it here avoids React 19's own automatic
 * image-preload hoist stacking a third, unbudgeted preload onto the two
 * explicit ones (44 §Exec tasks E2 risk note).
 *
 * 47-round3-plan.md §R6a supersedes 45 §Owner feedback item 10's own cover
 * mechanism (the CSS-only `.hero-brush-in` sliding panel): the paper cover
 * and its reveal now live in pages/Home.tsx (a canvas layered above
 * `Container`'s name, not just this component's own image), driven by
 * motion/heroSplash.ts (49 §E4b, R4-5 -- replacing that module's own
 * earlier one-stroke version). Item 10's LCP contract carries over
 * unchanged — see that module's own header comment.
 *
 * 46-polish-plan.md item 3(a)/owner decision 5: the paper grain used to
 * reach the image via `mix-blend-mode: multiply` against this wrapper's own
 * paper-tile background -- diagnosis measured that blend alone at ~180ms of
 * compositor Commit per route change (a blended element can't be composited
 * independently, so every frame anywhere in its stacking context re-commits
 * the whole blended area). scripts/hero.mjs now bakes the same grain tile
 * into the delivered pixels at generation time, so the `<img>` needs no
 * blend mode and this wrapper needs no background of its own -- `body`
 * already paints the identical tile underneath (styles/base.css), which the
 * fully opaque, full-bleed `<img>` covered either way.
 */
export function Hero() {
  const rootRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const mistRefs = useRef<HTMLDivElement[]>([])
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) return
    const root = rootRef.current
    const image = imageRef.current
    if (!root || !image) return
    return mountHeroMist({ root, image, mist: mistRefs.current })
  }, [reduced])

  return (
    <div ref={rootRef} className="absolute inset-0 -z-10 overflow-hidden">
      <picture>
        <source media={MOBILE_MEDIA} type="image/avif" srcSet={heroSrcSet('hero-m', HERO_MOBILE_WIDTHS, 'avif')} sizes="100vw" />
        <source media={MOBILE_MEDIA} type="image/webp" srcSet={heroSrcSet('hero-m', HERO_MOBILE_WIDTHS, 'webp')} sizes="100vw" />
        <source media={DESKTOP_MEDIA} type="image/avif" srcSet={heroSrcSet('hero', HERO_DESKTOP_WIDTHS, 'avif')} sizes="100vw" />
        <source media={DESKTOP_MEDIA} type="image/webp" srcSet={heroSrcSet('hero', HERO_DESKTOP_WIDTHS, 'webp')} sizes="100vw" />
        <img
          ref={imageRef}
          src="/hero/hero-1920.webp"
          alt=""
          width={3840}
          height={2160}
          decoding="async"
          // 51-round5-plan.md §E4, 45 §Round5 R5a: the monogram sits in
          // `hero` state directly over this painting on `/` (diagnosis
          // §Item 1) -- the tone registry's one hand-placed tag, since
          // this image has no `content/projects.ts` `tone` field to read.
          data-tone="dark"
          className="hero-painting size-full origin-center object-cover"
          style={{ objectPosition: '66% 0' }}
        />
      </picture>
      {/* 2026-09-23: the nav's own scan (top strip, per breakpoint) found
          columns where the painting's mass reaches the nav band well
          below its L>=85% *mean* -- e.g. a peak's edge under a nav link
          measured contrast as low as ~2.7 against the now-unblended 焦
          nav text (Nav.tsx's own 2026-09-23 correction), far under AA's
          4.5. A straight top-to-transparent gradient still left ~40-55%
          opacity right where nav text sits (it fades across the *whole*
          144px, not just below the text band), so this holds full
          strength through the nav's own height first and only fades out
          after it -- a "hold then dissolve" shape, not a straight ramp.
          Static (not reduced-motion-gated: it's not motion), and harmless
          on every other route, which is already plain paper under this. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-36"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(242,236,222,0.95) 0%, rgba(242,236,222,0.95) 60%, rgba(242,236,222,0) 100%)',
        }}
      />
      {/* G9 (46 item 9): the E6 desktop name scrim that used to sit here is
          gone. It existed only because the old top-left name zone (x 4-46%,
          y 18-62%) dipped to a per-glyph worst case of ~2.6-2.8:1 where
          "Widjaja" crossed a mid-tone rock passage. The name now sits in
          the bottom-left dissolve band instead (pages/Home.tsx's h1 moved
          to `md:row-start-3`) -- measured the same per-glyph way (diff a
          shot against one with the h1 hidden), the new zone's worst case is
          9.7-11.3:1 at 390/1280/1440/1920, identical with or without this
          scrim, confirming it no longer overlapped the name at all. */}
      {reduced
        ? null
        : ['mist-1', 'mist-2', 'mist-3'].map((name, i) => (
            <div
              key={name}
              ref={(el) => {
                if (el) mistRefs.current[i] = el
              }}
              aria-hidden="true"
              className="hero-mist pointer-events-none absolute inset-x-0 h-[45%] bg-cover"
              data-mist-src={`/ink/${name}.webp`}
              style={{ top: `${30 + i * 20}%` }}
            />
          ))}
    </div>
  )
}
