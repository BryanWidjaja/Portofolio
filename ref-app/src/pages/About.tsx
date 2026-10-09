import { Seo } from '../components/Seo'
import { Container } from '../components/Container'
import { BrushWords } from '../components/BrushWords'
import { PillButton } from '../components/PillButton'
import { DividerRow } from '../components/DividerRow'
import { Accordion } from '../components/Accordion'
import { BrushReveal } from '../components/BrushReveal'
import { Page } from '../motion/Page'
import { AmbientScene } from '../components/AmbientScene'
import { site } from '../content/site'
import { aboutCommon, aboutVariant, awards, bio, education, experience, portrait, tools, whatIDo } from '../content/about'
import type { TimelineRow } from '../content/about'

// One titled list of role/org/period rows -- Experience, Education and
// Awards all share it, so the three sections can never drift apart.
function Timeline({ heading, rows }: { heading: string; rows: TimelineRow[] }) {
  return (
    <Container as="section" className="pt-leaf">
      <BrushWords as="h2" text={heading} data-reveal="heading" className="text-heading font-display font-medium" />
      <ul className="mt-breath">
        {rows.map((row, index) => (
          <DividerRow
            key={`${row.role}-${row.org}`}
            as="li"
            lineVariant={index}
            className="grid grid-cols-[1fr_auto] gap-x-4 py-6 md:grid-cols-12 md:py-8"
          >
            <p className="col-span-2 text-title font-display font-medium md:col-span-5">{row.role}</p>
            <p className="mt-1 text-body text-ink-muted md:col-span-4 md:mt-0">{row.org}</p>
            <p className="mt-1 text-right text-body tabular-nums md:col-span-3 md:col-start-10 md:mt-0">
              {row.period}
            </p>
          </DividerRow>
        ))}
      </ul>
    </Container>
  )
}

// 11-layout.md §About (D3: both variants build; the accordion delta adds a
// "What I do" section between Intro and Experience, M16). Everything else
// is identical between `bio` and `accordion`.
export function About() {
  return (
    <>
      <Seo title={site.meta.about.title} description={site.meta.about.description} path="/about" />

      <Page>
        <Container as="section" className="pt-36 md:pt-48">
          <BrushWords
            as="h1"
            text={aboutCommon.h1}
            className="text-display font-display font-bold"
          />
          <p data-intro="meta" className="label mt-6 text-ink-muted">
            {aboutCommon.location}
          </p>
        </Container>

        <Container className="relative isolate mt-breath grid gap-x-6 md:grid-cols-12 md:items-center xl:gap-x-8">
          <AmbientScene preset="about-grove" />
          <div className="ml-auto w-[82%] max-w-[26rem] overflow-hidden rounded-none md:col-span-4 md:ml-0 md:w-full md:max-w-none">
            <BrushReveal
              src={portrait.src}
              alt={portrait.alt}
              width={portrait.width}
              height={portrait.height}
              eager
              sizes="(min-width: 768px) 28vw, 82vw"
              className="aspect-[4/5] size-full"
            />
          </div>
          <div className="mt-10 md:col-span-7 md:col-start-6 md:mt-0">
            <p data-intro className="text-lead text-balance">
              {bio.lead}
            </p>
            {bio.paragraphs.map((paragraph, i) => (
              <p key={paragraph} className={`${i === 0 ? 'mt-6' : 'mt-4'} text-body max-w-[62ch]`}>
                {paragraph}
              </p>
            ))}
            <DividerRow className="mt-10 pt-6">
              <p className="label text-ink-muted">{site.footer.availability}</p>
            </DividerRow>
          </div>
        </Container>

        {aboutVariant === 'accordion' ? (
          <Container as="section" className="grid gap-x-6 pt-leaf md:grid-cols-12 xl:gap-x-8">
            <BrushWords
              as="h2"
              text="What I do"
              data-reveal="heading"
              className="text-heading font-display font-medium md:col-span-4"
            />
            <Accordion items={whatIDo} />
          </Container>
        ) : null}

        <Timeline heading={aboutCommon.experienceHeading} rows={experience} />
        <Timeline heading={aboutCommon.educationHeading} rows={education} />
        <Timeline heading={aboutCommon.awardsHeading} rows={awards} />

        <Container as="section" className="grid gap-x-6 pt-leaf md:grid-cols-12 xl:gap-x-8">
          <BrushWords
            as="h2"
            text={aboutCommon.toolsHeading}
            data-reveal="heading"
            className="text-heading font-display font-medium md:col-span-4"
          />
          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:col-span-8 md:col-start-5 md:mt-0 md:gap-y-10">
            {tools.map((group) => (
              <div key={group.group}>
                <p className="label text-ink-muted">{group.group}</p>
                <ul className="mt-3 space-y-1 text-body">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>

        <Container as="section" className="grid gap-x-6 py-leaf md:grid-cols-12 md:items-center xl:gap-x-8">
          <BrushWords
            as="p"
            text={aboutCommon.resume.prompt}
            data-reveal="heading"
            className="text-heading font-display font-medium text-balance md:col-span-8"
          />
          <PillButton
            href={site.resumeUrl}
            download={site.resumeFileName}
            disabled={!site.resumeAvailable}
            title={site.resumeAvailable ? undefined : aboutCommon.resume.unavailableTitle}
            icon="download"
            className="mt-10 md:col-span-3 md:col-start-10 md:mt-0 md:justify-self-end"
            data-reveal="text"
          >
            {aboutCommon.resume.pill}
          </PillButton>
        </Container>
      </Page>
    </>
  )
}
