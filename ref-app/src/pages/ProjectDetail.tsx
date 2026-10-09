import { Fragment } from 'react'
import { useLoaderData, useParams } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Container } from '../components/Container'
import { BrushWords } from '../components/BrushWords'
import { Eyebrow } from '../components/Eyebrow'
import { PillButton } from '../components/PillButton'
import { ProjectCollage } from '../components/ProjectCollage'
import { ProjectVideo } from '../components/ProjectVideo'
import { NextProject } from '../components/NextProject'
import { AmbientScene } from '../components/AmbientScene'
import { Page } from '../motion/Page'
import { site } from '../content/site'
import type { ProjectDetailData } from '../content/routeData'

// 11-layout.md §Project detail (D2, short case study): header, then the
// collage (55-projectpage-plan.md §E7 A, superseding 51 §E3/E6's two-grid
// layout -- one 4-col/2-row grid, replacing the old single cover + the
// two-square gallery that used to follow the story rows), the colophon
// (the three `project.sections` beats), then a next-project wrap that
// loops back to the first project after the last.
//
// R6b (45 §Round 6, 58 §F1 "colophon triptych"): the three beats used to
// be `DividerRow`-separated single-column rows (55 §E7 B's "one reading
// column" pass -- itself a fix for an even older label-left/paragraph-
// middle/dead-right-third layout). Now they sit side by side as numbered
// `01`-`03` leaves on one aged-paper sheet (`.colophon`, styles/base.css),
// hairline seams standing in for the old `DividerRow` brush lines --
// vertical between the `md:grid-cols-3` columns, horizontal once they
// stack on phones. The Cormorant display face is deliberately reserved for
// just these three labels (`56`'s diagnosis: separating them from the meta
// row's small sans is the whole point).
export function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { project, next } = (useLoaderData() ?? {}) as Partial<ProjectDetailData>

  if (!project || !next) {
    return (
      <>
        <Seo
          title={site.meta.notFound.title}
          description={site.meta.notFound.description}
          path={`/projects/${slug ?? ''}`}
          noindex
        />
        <Page>
          <Container as="section" className="flex min-h-[85svh] flex-col justify-end pb-leaf">
            <Eyebrow data-intro="meta">{site.notFound.eyebrow}</Eyebrow>
            <BrushWords
              as="h1"
              text={site.notFound.heading}
              className="mt-3 text-display font-display font-bold text-balance md:w-10/12"
            />
            <p data-intro className="mt-6 text-lead text-balance md:w-1/2">
              {site.notFound.body}
            </p>
            <PillButton to="/" icon="arrow-right" className="mt-breath" data-intro="meta">
              {site.notFound.pill}
            </PillButton>
          </Container>
        </Page>
      </>
    )
  }

  const repos = project.links.repos ?? []
  const hasLinks = Boolean(project.links.live || repos.length)

  return (
    <>
      <Seo title={`${project.title} · ${site.name}`} description={project.summary} path={`/projects/${project.slug}`} />

      <Page>
        <Container as="section" className="pt-36 md:pt-48">
          <BrushWords
            as="h1"
            text={project.title}
            className="text-display font-display font-bold text-balance"
          />
          <p data-intro className="mt-6 text-lead text-balance md:w-7/12">
            {project.summary}
          </p>

          <dl data-intro="meta" className="mt-breath grid grid-cols-2 gap-6 md:grid-cols-12">
            <div className="md:col-span-3">
              <dt className="label text-ink-muted">Role</dt>
              <dd className="mt-2 text-body">{project.role}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="label text-ink-muted">Year</dt>
              <dd className="mt-2 text-body tabular-nums">{project.year}</dd>
            </div>
            <div className="col-span-2 md:col-span-4">
              <dt className="label text-ink-muted">Stack</dt>
              <dd className="mt-2 text-body">
                {project.stack.map((item, i) => (
                  // whitespace-nowrap keeps multi-word tool names (e.g. "Chrome
                  // Extensions") from splitting across lines; the break
                  // opportunity stays at the comma+space between items (R1
                  // finding 3). The separator sits *outside* the nowrap span --
                  // inside it, its space was nowrap too, so a row could never
                  // break at all and overflowed the 390px viewport.
                  <Fragment key={item}>
                    <span className="whitespace-nowrap">
                      {item}
                      {i < project.stack.length - 1 ? ',' : ''}
                    </span>
                    {i < project.stack.length - 1 ? ' ' : ''}
                  </Fragment>
                ))}
              </dd>
            </div>
            {hasLinks ? (
              <div className="col-span-2 flex flex-wrap gap-3 md:col-span-3 md:col-start-10 md:justify-end">
                {project.links.live ? (
                  <PillButton href={project.links.live} icon="arrow-up-right" external>
                    Visit site
                  </PillButton>
                ) : null}
                {repos.map((repo) => (
                  <PillButton key={repo.href} href={repo.href} icon="arrow-up-right" external>
                    {repo.label}
                  </PillButton>
                ))}
              </div>
            ) : null}
          </dl>
        </Container>

        <Container className="mt-10 md:mt-12">
          {/* 51-round5-plan.md §E3, 45 R5c: the collage replaces the old
              single cover + the two gallery squares that used to sit after
              the description. The hero tile is the project's own cover
              image, plain colour (owner, 2026-09-28: the brush paint-out
              lives on the home page's cards only) -- on malware, the
              current conference deck's explicit detail hero.
              55 §E7 B: sits one step closer to the meta row above it
              (was `mt-breath`; no smaller spacing token exists, so a
              literal value, same fallback the story rows below take). */}
          <ProjectCollage
            hero={project.detailHero ?? project.cover}
            tiles={project.collage}
          />
        </Container>

        {/* 55 §E7 B: `pt-leaf` only (was `py-leaf`) -- the bottom half used
            to stack with NextProject's `mt-leaf` below into two gaps where
            the owner wants one. */}
        <Container as="section" data-project-story className="relative isolate pt-leaf">
          <AmbientScene preset="project-story" />
          {/* Direction 8A: Swiss Grid — Expressive Italic Title.
              1fr / 2fr columns; large italic Cormorant title on the left with a
              hairline divider; body prose fills the right. Rows are separated by
              horizontal hairlines (divide-y). */}
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {project.sections.map((section, i) => (
              <div
                key={`section-${section.label}`}
                data-project-story-row
                className="grid items-end gap-8 py-14 md:grid-cols-[1fr_2fr] md:gap-16 md:py-20"
              >
                {/* Left: tiny counter + large italic display title */}
                <div className="md:border-r md:border-ink/10 md:pb-2 md:pr-10">
                  <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ink/30">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2
                    data-reveal="text"
                    className="mt-1 font-display text-5xl font-medium italic leading-[1.0] tracking-tight text-ink md:text-6xl lg:text-7xl"
                  >
                    {section.label}
                  </h2>
                </div>

                {/* Right: body prose */}
                <p data-reveal="text" className="text-body leading-[1.9] text-ink/78 md:text-lg">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </Container>

        {project.earlierVideo ? (
          <Container as="section" className="mt-leaf">
            <div className="grid gap-6 md:grid-cols-12 md:items-start">
              <div className="md:col-span-4">
                <Eyebrow>Earlier experiment</Eyebrow>
                <h2 className="mt-3 text-title font-display font-medium">Watch the earlier results trailer</h2>
                <p className="mt-3 text-body text-ink-muted">
                  This archived trailer reports an earlier experiment. Its accuracy differs from the latest conference slides above.
                </p>
              </div>
              <div className="md:col-span-8">
                <ProjectVideo {...project.earlierVideo} className="aspect-video w-full" />
              </div>
            </div>
          </Container>
        ) : null}

        <Container as="section" className="mt-leaf">
          <NextProject project={next} />
        </Container>
      </Page>
    </>
  )
}
