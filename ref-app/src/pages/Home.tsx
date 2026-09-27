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
import { site } from '../content/site'
import { projects } from '../content/projects'

const slotOrder: Array<'lead' | 'left' | 'right'> = ['lead', 'left', 'right']

/** Splits copy around its one accent word/phrase so only that span renders in `<Accent>`. */
function splitAccent(text: string, accent: string) {
  const index = text.indexOf(accent)
  if (index === -1) return { before: text, accent: '', after: '' }
  return { before: text.slice(0, index), accent, after: text.slice(index + accent.length) }
}

export function Home() {
  const aboutLead = splitAccent(site.home.aboutCta.lead, 'after launch')
  const hasInscription = Boolean(site.home.heroInscription)

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
            className="relative z-10 flex min-h-svh flex-col justify-end pb-10 md:grid md:grid-cols-12 md:grid-rows-[auto_1fr_auto] md:gap-x-6 md:pt-36 md:pb-16 xl:gap-x-8"
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
              <BrushWords
                as="h1"
                lines={[...site.home.heroName]}
                className="text-hero font-display font-bold"
              />
              {hasInscription ? (
                <div className="absolute top-0 right-[54%] hidden flex-col items-center gap-3 md:flex">
                  <p lang="zh-Hant" aria-hidden="true" className="text-body text-ink [writing-mode:vertical-rl]">
                    {site.home.heroInscription}
                  </p>
                </div>
              ) : null}
            </div>
          </Container>
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
          <p data-reveal="text" className="text-heading font-display font-medium text-balance md:col-span-8 md:col-start-5">
            {aboutLead.before}
            <Accent>{aboutLead.accent}</Accent>
            {aboutLead.after}
          </p>
          <div data-reveal="text" className="mt-breath md:col-span-3 md:col-start-5">
            <PillButton to="/about" icon="arrow-right">
              {site.home.aboutCta.pill}
            </PillButton>
          </div>
        </Container>
      </Page>
    </>
  )
}
