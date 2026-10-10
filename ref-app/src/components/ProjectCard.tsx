import { Icon } from './Icon'
import { BrushReveal } from './BrushReveal'
import { TransitionLink } from './TransitionLink'
import type { HomeProject } from '../content/routeData'

type ProjectCardProps = {
  project: HomeProject
  slot: 'lead' | 'left' | 'right'
}

// 11-layout.md §Index §Component props: staircase slots (L1). Lead spans
// the full 12 cols, left/right narrow at lg so the run reads as a staircase.
const slotClasses: Record<ProjectCardProps['slot'], string> = {
  lead: 'md:col-start-2 md:col-span-10 lg:col-start-2 lg:col-span-10',
  left: 'md:col-span-9 lg:col-span-7',
  right: 'md:col-start-4 md:col-span-9 lg:col-start-6 lg:col-span-7',
}

// M9/V26 (41-ink-replace-map.md): the old lime corner mark is gone. The
// media brushes to colour under the pointer/focus (components/BrushReveal.tsx,
// src/ink/brush.ts), the title gets a dry-brush underline (`.ink-underline`,
// styles/base.css, V18) and the arrow nudges +3 beside it.
export function ProjectCard({ project, slot }: ProjectCardProps) {
  return (
    <li data-project-slot={slot} className={`relative isolate ${slotClasses[slot]}`}>
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
          style={{ aspectRatio: `${project.cover.width * 0.9} / ${project.cover.height * 0.85}` }}
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
                    sizes={slot === 'lead'
                      ? '(min-width: 1536px) calc((min(100vw, 110rem) - 16rem) * 0.75 - 1.65rem), (min-width: 1280px) calc((100vw - 14rem) * 0.75 - 1.65rem), (min-width: 1024px) calc((100vw - 12rem) * 0.75 - 1.575rem), (min-width: 960px) calc((100vw - 8rem) * 0.75 - 1.575rem), (min-width: 768px) calc((100vw - 9.375rem) * 0.9), (min-width: 640px) calc((100vw - 6rem - 18px) * 0.88), (min-width: 430px) calc((100vw - 4rem - 18px) * 0.88), (min-width: 360px) calc((100vw - 3rem - 18px) * 0.88), calc((100vw - 2.5rem - 18px) * 0.88)'
                      : '(min-width: 1024px) 67vw, calc(100vw - 3rem)'}
                    deferUntilNear
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
            <Icon
              name="ArrowUpRight"
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
