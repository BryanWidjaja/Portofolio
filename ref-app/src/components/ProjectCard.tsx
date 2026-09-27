import { ArrowUpRight } from '@phosphor-icons/react'
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

const mediaHeight: Record<ProjectCardProps['slot'], string> = {
  lead: 'md:h-[70vh]',
  left: 'md:h-[62vh]',
  right: 'md:h-[62vh]',
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
        <figure
          data-reveal="media"
          className={`blot-mask relative isolate aspect-[4/5] overflow-hidden rounded-none md:aspect-auto ${mediaHeight[slot]}`}
        >
          <BrushReveal
            src={project.cover.src}
            alt={project.cover.alt}
            width={project.cover.width}
            height={project.cover.height}
            eager={eager}
          />
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
