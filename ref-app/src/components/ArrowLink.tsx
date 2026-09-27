import type { ReactNode } from 'react'
import { ArrowUpRight } from '@phosphor-icons/react'
import { TransitionLink } from './TransitionLink'
import { site } from '../content/site'

type ArrowLinkProps = {
  to?: string
  href?: string
  children: ReactNode
  /** True target="_blank" links only (social profiles) - not mailto. */
  external?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const sizeClasses: Record<'sm' | 'md', string> = {
  sm: 'label',
  md: 'text-body',
}

// M12/V18 (41-ink-replace-map.md): `.ink-underline` as UnderlineLink; the
// arrow travels x 0->3 (no rotate, replacing the old -45deg wind-up) on
// hover/focus-visible. Rests unrotated on coarse pointers (no hover event
// ever fires there).
export function ArrowLink({ to, href, children, external = false, size = 'md', className = '' }: ArrowLinkProps) {
  const classes = `group inline-flex items-center gap-1 ${sizeClasses[size]} ${className}`.trim()

  const content = (
    <>
      <span className="ink-underline inline-block">{children}</span>
      {/* M12: no rotate at all -- feedback is the x-nudge plus the
          underline above. */}
      <ArrowUpRight
        aria-hidden="true"
        weight="bold"
        className="size-[1em] shrink-0 transition-transform duration-[180ms] ease-dry group-hover:translate-x-1 group-hover:duration-[250ms] group-focus-visible:translate-x-1 group-focus-visible:duration-[250ms] motion-reduce:translate-x-0!"
      />
      {external ? <span className="sr-only"> {site.footer.newTabSuffix}</span> : null}
    </>
  )

  if (to) {
    return (
      <TransitionLink to={to} className={classes}>
        {content}
      </TransitionLink>
    )
  }

  return (
    <a
      href={href}
      className={classes}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {content}
    </a>
  )
}
