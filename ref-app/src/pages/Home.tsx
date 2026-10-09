import { useCallback, useEffect, useRef, useState } from 'react'
import { Head } from 'vite-react-ssg'
import { Seo } from '../components/Seo'
import { Container } from '../components/Container'
import { BrushWords } from '../components/BrushWords'
import { Accent } from '../components/Accent'
import { Eyebrow } from '../components/Eyebrow'
import { ProjectCard } from '../components/ProjectCard'
import { PillButton } from '../components/PillButton'
import { Hero, HERO_DESKTOP_WIDTHS, heroSrcSet } from '../components/Hero'
import { Page } from '../motion/Page'
import { usePageEnter, type PageEnterMode } from '../motion/pageEnter'
import { playHeroSplash } from '../motion/heroSplash'
import { mountHeroCollapse } from '../motion/heroCollapse'
import { useReducedMotion } from '../app/MotionProvider'
import { site } from '../content/site'
import { projects } from '../content/projects'

const slotOrder: Array<'lead' | 'left' | 'right'> = ['lead', 'left', 'right']

/** Splits copy around its one accent word/phrase so only that span renders in `<Accent>`. */
function splitAccent(text: string, accent: string) {
  const index = text.indexOf(accent)
  if (index === -1) return { before: text, accent: '', after: '' }
  return { before: text.slice(0, index), accent, after: text.slice(index + accent.length) }
}

/** Splits one word into its first letter (the collapse ghost's own glyph)
 * and the remainder (the part that brushes out/re-writes). */
function splitLetter(word: string) {
  return { letter: word.slice(0, 1), rest: word.slice(1) }
}

export function Home() {
  const aboutLead = splitAccent(site.home.aboutCta.lead, '100 to 120 students')
  const hasInscription = Boolean(site.home.heroInscription)
  const reduced = useReducedMotion()

  // 47-round3-plan.md §R6: the h1's own [Bryan, Widjaja] split into a
  // collapse-ghost letter + a brush-out/re-write remainder each.
  const [firstWord, secondWord] = site.home.heroName
  const first = splitLetter(firstWord)
  const second = splitLetter(secondWord)
  const heroNameLabel = site.home.heroName.join(' ')

  const heroCanvasRef = useRef<HTMLCanvasElement>(null)
  const h1Ref = useRef<HTMLHeadingElement>(null)
  const firstLetterRef = useRef<HTMLSpanElement>(null)
  const secondLetterRef = useRef<HTMLSpanElement>(null)
  const firstRestRef = useRef<HTMLSpanElement>(null)
  const secondRestRef = useRef<HTMLSpanElement>(null)
  // React removes the cover canvas once the splash resolves (49 §E4b "the
  // canvas is removed from the DOM when done") -- SSR/first paint always
  // renders it (mirrors every other motion-ready-gated element: hidden by
  // CSS, not by being absent, until the reveal actually runs).
  const [splashDone, setSplashDone] = useState(false)

  // A. Raindrop splash intro (49-round4-plan.md §E4b, R4-5 in
  // 41-ink-replace-map.md), replacing round 3's one-stroke intro. "Plays on
  // first and push … a pop, or an entry already scrolled past the trigger,
  // shows instantly" -- Home subscribes to the same pageEnter broadcast
  // Page.tsx uses for every other page's title write, independently
  // (motion/pageEnter.ts's listener set supports any number of
  // subscribers).
  usePageEnter(
    useCallback(
      (mode: PageEnterMode) => {
        const canvas = heroCanvasRef.current
        if (!canvas) {
          setSplashDone(true)
          return
        }
        const alreadyScrolled = window.scrollY > 4
        const instant = reduced || mode === 'pop' || alreadyScrolled
        playHeroSplash({ canvas, nameEl: h1Ref.current, instant, reduced }).then(() => setSplashDone(true))
      },
      [reduced],
    ),
  )

  // B. Collapse <-> BW (§R6b): wires the h1's own letters/remainders to
  // Monogram once every ref is mounted. Independent of the splash above --
  // a fast scroll during the intro isn't a scoped case in the plan, and
  // gating it on `splashDone` would leave a stale collapse target if the
  // splash happens to still be running.
  useEffect(() => {
    const h1 = h1Ref.current
    const b = firstLetterRef.current
    const w = secondLetterRef.current
    const ryan = firstRestRef.current
    const idjaja = secondRestRef.current
    if (!h1 || !b || !w || !ryan || !idjaja) return
    return mountHeroCollapse({
      h1,
      letters: { b, w },
      rest: { ryan, idjaja },
      reduced,
    })
  }, [reduced])

  return (
    <>
      <Seo title={site.meta.home.title} description={site.meta.home.description} path="/" />

      {/* V31 (41-ink-replace-map.md), 44 §Exec tasks E2: two media-exclusive
          hero preloads (mobile 9:16 crop vs desktop 16:9), matching
          components/Hero.tsx's own `<picture>` media queries exactly so the
          browser never double-fetches. `/` only -- every other route gets
          just the font preload from index.html.

          The desktop preload mirrors the `<picture>`'s full `imageSrcSet`
          responsively. The mobile one deliberately doesn't: under Chromium's
          touch/mobile emulation (Playwright's `isMobile`+`hasTouch`, used by
          this app's own check-transitions.mjs B6/T10 mobile checks), a
          `imageSrcSet` preload's own width resolution can disagree with the
          `<picture>`'s -- verified by hand with request logging -- so the
          preloaded file goes unused *and* the picture fetches a second,
          different one. A single fixed href can't mismatch itself, so it
          preloads exactly the smallest mobile crop (matches what a
          360-430px-wide phone viewport actually uses; wider/higher-DPR
          phones just fetch their real size the normal way, without the
          preload's head start). */}
      <Head>
        <link
          rel="preload"
          as="image"
          type="image/avif"
          href="/hero/hero-m-720.avif"
          media="(max-aspect-ratio: 3/4)"
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="image"
          type="image/avif"
          href="/hero/hero-3840.avif"
          imageSrcSet={heroSrcSet('hero', HERO_DESKTOP_WIDTHS, 'avif')}
          imageSizes="100vw"
          media="(min-aspect-ratio: 3/4)"
          fetchPriority="high"
        />
      </Head>

      <Page variant="home">
        <section className="relative isolate overflow-hidden">
          <Hero />
          <Container
            className="relative z-10 flex min-h-svh flex-col justify-end pb-22 md:grid md:grid-cols-12 md:grid-rows-[auto_1fr_auto] md:gap-x-6 md:pt-36 md:pb-32 xl:gap-x-8"
          >
            {/* 45 §Owner feedback item 4: the seal that used to sit at the
                hero name's lower right (42 §Components Seal row) and at the
                inscription column's foot is gone — no code left here needs
                to track the h1's own shrink-to-fit box or clear a glyph's
                descender for it. `hasInscription` still gates the deferred
                CJK column (content/site.ts `heroInscription`, awaiting the
                owner's characters); it now renders on its own with nothing
                pinned to its foot. */}
            {/* G9 (46 item 9, 45 §Polish round decision 3): the description
                paragraph that used to fill row 3 is gone, and the name moves
                here from row 1 to take its place -- bottom-left, in the
                dissolve band where the painting sinks into paper (best
                contrast, 留白 above), matching the mobile crop's own name
                placement instead of the old top-left zone. */}
            <div className="relative md:col-span-12 md:row-start-3">
              {/* 47-round3-plan.md §R6a/§R6b: replaces `BrushWords` for this
                  one h1 only (every other page's h1 keeps it, unchanged).
                  Two reasons neither can be layered on top of the generic
                  component here: (1) the name's own reveal is the one-stroke
                  intro's job now, not a per-word mask -- "the home h1 has no
                  separate word bleed"; (2) the collapse needs a first-letter
                  span distinct from the rest of each word (`B`/`ryan`,
                  `W`/`idjaja`), a split `BrushWords`' word-level masking
                  doesn't produce. The visible spans carry `aria-hidden`; the
                  h1 itself carries the real `aria-label` and stays the
                  transition's focus target (`tabIndex=-1`), same contract as
                  `BrushWords` gives every other h1. */}
              <h1
                ref={h1Ref}
                aria-label={heroNameLabel}
                tabIndex={-1}
                className="text-hero font-display font-bold"
              >
                <span aria-hidden="true">
                  <span data-collapse-word>
                    <span ref={firstLetterRef} data-collapse-letter>
                      {first.letter}
                    </span>
                    <span ref={firstRestRef} data-collapse-rest>
                      {first.rest}
                    </span>
                  </span>{' '}
                  <span data-collapse-word>
                    <span ref={secondLetterRef} data-collapse-letter>
                      {second.letter}
                    </span>
                    <span ref={secondRestRef} data-collapse-rest>
                      {second.rest}
                    </span>
                  </span>
                </span>
              </h1>
              {hasInscription ? (
                <div className="absolute top-0 right-[54%] hidden flex-col items-center gap-3 md:flex">
                  <p lang="zh-Hant" aria-hidden="true" className="text-body text-ink [writing-mode:vertical-rl]">
                    {site.home.heroInscription}
                  </p>
                </div>
              ) : null}
            </div>
          </Container>
          {/* 49-round4-plan.md §E4b: the raindrop splash intro's paper cover
              -- last in the section, above `Container`'s `z-10` name (see
              styles/base.css `.hero-cover`), so the splashes reveal the
              painting and the two-line name in one gesture. `splashDone`
              unmounts it once the splash resolves ("the canvas is removed
              from the DOM when done"). Hidden entirely unless
              `html.motion-ready` (CSS, not this conditional) -- reduced
              motion and a broken JS load both leave the hero fully visible
              with nothing here to remove. */}
          {!splashDone ? (
            <div aria-hidden="true" className="hero-cover">
              <canvas ref={heroCanvasRef} />
            </div>
          ) : null}
        </section>

        <Container as="section" id="work" className="pt-leaf scroll-mt-20">
          <Eyebrow data-reveal="label">{site.home.workEyebrow}</Eyebrow>
          <BrushWords
            as="h2"
            text={site.home.workHeading}
            data-reveal="heading"
            tabIndex={-1}
            className="mt-3 text-heading font-display font-medium text-balance md:w-2/3"
          />
          <ol className="mt-breath flex flex-col gap-leaf md:grid md:grid-cols-12 md:gap-x-6 md:gap-y-leaf xl:gap-x-8">
            {projects.map((project, index) => (
              <ProjectCard key={project.slug} project={project} slot={slotOrder[index] ?? 'left'} eager={index === 0} />
            ))}
          </ol>
        </Container>

        <Container as="section" className="py-leaf md:grid md:grid-cols-12 md:gap-x-6 xl:gap-x-8">
          {/* `text`, not `heading`: this lead mixes an <Accent> phrase into
              running prose, so a brush-write pass (word masks only) would
              either skip the accent or invent a second technique for it.
              motion/bleed.ts's plain ink-in reads just as well here — the
              `text-heading` sizing is a type-scale choice, independent of
              which M4 motion kind the element opts into. */}
          <p data-reveal="text" className="text-heading font-display font-medium text-balance md:col-span-9 md:col-start-3">
            {aboutLead.before}
            <Accent>{aboutLead.accent}</Accent>
            {aboutLead.after}
          </p>
          <p data-reveal="text" className="mt-6 max-w-[62ch] text-lead text-ink-muted md:col-span-7 md:col-start-3">
            {site.home.aboutCta.detail}
          </p>
          <div data-reveal="text" className="mt-8 md:col-span-3 md:col-start-3">
            <PillButton to="/about" icon="arrow-right" variant="solid">
              {site.home.aboutCta.pill}
            </PillButton>
          </div>
        </Container>
      </Page>
    </>
  )
}
