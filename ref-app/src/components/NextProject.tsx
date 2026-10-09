import { Icon } from './Icon'
import { BrushLine } from './BrushLine'
import { TransitionLink } from './TransitionLink'
import type { Project } from '../content/projects'

type NextProjectProps = {
  project: Project
}

// 11-layout.md §Project detail + shared states, V19/V27 (41-ink-replace-map.md):
// large wrap-around link to the next project, brush-line top instead of a
// flat border. Hover/focus-visible moves the title and washes the outline
// circle in (as M10, centred — the row is much larger than the circle, so
// tracking the pointer's entry point onto it the way PillButton does would
// read as an arbitrary offset rather than "where you entered"); it stays
// an outline at rest on every pointer, so nothing reads as hover-only
// (§D) and touch doesn't lose the circle's meaning.
export function NextProject({ project }: NextProjectProps) {
  return (
    <TransitionLink
      to={`/projects/${project.slug}`}
      cursor="next"
      className="group relative grid grid-cols-[1fr_auto] items-end gap-6 py-24 md:py-32"
    >
      <BrushLine className="absolute inset-x-0 top-0" />
      <span>
        <span className="label text-ink-muted">Next project</span>
        <span className="mt-3 block text-heading font-display font-medium transition-transform duration-[300ms] ease-dry group-hover:translate-x-2 group-focus-visible:translate-x-2 md:text-display">
          {project.title}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="relative isolate grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-ink text-ink transition-[transform,color] duration-[180ms] ease-dry pointer-fine:group-hover:text-background pointer-fine:group-hover:duration-[250ms] group-focus-visible:text-background group-focus-visible:duration-[250ms] group-active:scale-95 md:size-20"
      >
        <span aria-hidden="true" className="ink-wash" />
        <Icon name="ArrowUpRight" weight="bold" className="relative size-5 md:size-6" />
      </span>
    </TransitionLink>
  )
}
