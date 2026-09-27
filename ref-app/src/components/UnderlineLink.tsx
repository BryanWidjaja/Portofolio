import type { ReactNode } from 'react'
import { TransitionLink } from './TransitionLink'

type UnderlineLinkProps = {
  to: string
  children: ReactNode
  current?: boolean
  className?: string
}

// M11/V18 (41-ink-replace-map.md): the `.ink-underline` dry-brush utility
// (styles/base.css) — a straight bar masked by the brush-edge strip, wiped
// in from the left on hover/focus-visible, .25s dry-in/.18s dry-out.
// `current` (aria-current="page") keeps it fully drawn without animating.
export function UnderlineLink({ to, children, current = false, className = '' }: UnderlineLinkProps) {
  return (
    <TransitionLink
      to={to}
      aria-current={current ? 'page' : undefined}
      data-current={current || undefined}
      className={`ink-underline inline-block ${className}`.trim()}
    >
      {children}
    </TransitionLink>
  )
}
