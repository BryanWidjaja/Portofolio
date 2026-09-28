import { Fragment } from 'react'
import { useParams } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { Container } from '../components/Container'
import { BrushWords } from '../components/BrushWords'
import { Eyebrow } from '../components/Eyebrow'
import { PillButton } from '../components/PillButton'
import { DividerRow } from '../components/DividerRow'
import { Gallery } from '../components/Gallery'
import { NextProject } from '../components/NextProject'
import { Page } from '../motion/Page'
import { site } from '../content/site'
import { projects } from '../content/projects'

// 11-layout.md §Project detail (D2, short case study): header, cover, three
// story rows, a gallery pair, then a next-project wrap that loops back to
// the first project after the last.
export function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>()
  const index = projects.findIndex((p) => p.slug === slug)
  const project = index === -1 ? undefined : projects[index]

  if (!project) {
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

  const next = projects[(index + 1) % projects.length]
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

        <Container className="mt-breath">
          <figure
            data-intro="cover"
            className="blot-mask isolate aspect-[4/5] overflow-hidden rounded-none md:aspect-[16/10]"
          >
            {/* Owner, 2026-09-28: a project's own page shows its images in
                plain colour -- the brush paint-out lives on the home page's
                cards only. As the page's likely LCP element, the cover loads
                eagerly at high priority. */}
            <img
              src={project.cover.src}
              alt={project.cover.alt}
              width={project.cover.width}
              height={project.cover.height}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="size-full object-cover"
            />
          </figure>
        </Container>

        <Container as="section" className="py-leaf">
          {project.sections.map((section, index) => (
            <DividerRow
              key={section.label}
              lineVariant={index}
              className="grid gap-4 py-breath md:grid-cols-12 md:gap-x-6 xl:gap-x-8"
            >
              <h2 data-reveal="text" className="text-title font-display font-medium md:col-span-4">
                {section.label}
              </h2>
              <p data-reveal="text" className="text-body max-w-[62ch] md:col-span-6 md:col-start-6 xl:col-span-5">
                {section.body}
              </p>
            </DividerRow>
          ))}
        </Container>

        <Container as="section">
          <Gallery items={project.gallery} />
        </Container>

        <Container as="section" className="mt-leaf">
          <NextProject project={next} />
        </Container>
      </Page>
    </>
  )
}
