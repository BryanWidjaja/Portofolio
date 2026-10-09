import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr/ArrowUpRight'
import { BrushReveal } from './BrushReveal'
import { TransitionLink } from './TransitionLink'
import type { Project } from '../content/projects'

type ProjectCardProps = {
  project: Project
  slot: 'lead' | 'left' | 'right'
  eager?: boolean
}

// 11-layout.md §Index §Component props: staircase slots (L1). Lead spans
// the full 12 cols, left/right narrow at lg so the run reads as a staircase.
const slotClasses: Record<ProjectCardProps['slot'], string> = {
  lead: 'md:col-span-12',
  left: 'md:col-span-10 lg:col-span-8',
  right: 'md:col-start-3 md:col-span-10 lg:col-start-5 lg:col-span-8',
}

// M9/V26 (41-ink-replace-map.md): the old lime corner mark is gone. The
// media brushes to colour under the pointer/focus (components/BrushReveal.tsx,
// src/ink/brush.ts), the title gets a dry-brush underline (`.ink-underline`,
// styles/base.css, V18) and the arrow nudges +3 beside it.
export function ProjectCard({ project, slot, eager = false }: ProjectCardProps) {
  return (
    <li className={slotClasses[slot]}>
      <TransitionLink
        to={`/projects/${project.slug}`}
        cursor="open"
        className="group block focus-visible:outline-offset-8"
      >
        {/* Owner, 2026-09-28: each project sits on an old paper handscroll
            (styles/base.css `.scroll`) -- horizontal at every width, torn
            and aged, a few shades off the page's own paper. It unrolls once
            as it enters (motion/reveal.ts `scroll`). */}
        <figure
          data-reveal="scroll"
          className="scroll relative isolate"
          style={{ aspectRatio: `${project.cover.width * 0.84} / ${project.cover.height * 0.9}` }}
        >
          <div className="scroll-stage">
            <div className="scroll-body">
              <div className="scroll-sheet">
                <span aria-hidden="true" className="scroll-tear scroll-tear-top" />
                <span aria-hidden="true" className="scroll-tear scroll-tear-bottom" />
                <div className="scroll-art">
                  <BrushReveal
                    src={project.cover.src}
                    alt={project.cover.alt}
                    width={project.cover.width}
                    height={project.cover.height}
                    eager={eager}
                    sizes={slot === 'lead' ? '(min-width: 768px) calc(100vw - 8rem), calc(100vw - 3rem)' : '(min-width: 1024px) 67vw, calc(100vw - 3rem)'}
                  />
                  <span aria-hidden="true" className="scroll-grain" />
                </div>
              </div>
            </div>
            <span aria-hidden="true" className="scroll-roll scroll-roll-start" />
            <span aria-hidden="true" className="scroll-roll scroll-roll-end" />
          </div>
        </figure>
        <div data-reveal="label" className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 md:mt-5">
          <h3 className="flex items-center gap-2 text-title font-display font-medium">
            <span className="ink-underline inline-block">{project.title}</span>
            <ArrowUpRight
              weight="bold"
              aria-hidden="true"
              className="size-5 shrink-0 text-ink-muted transition-transform duration-[250ms] ease-dry group-hover:translate-x-[3px] group-focus-visible:translate-x-[3px] motion-reduce:transition-none"
            />
          </h3>
          <p className="label tabular-nums text-ink-muted">
            {project.category} · {project.year}
          </p>
        </div>
      </TransitionLink>
    </li>
  )
}
