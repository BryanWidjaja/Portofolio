import type { PointerEvent, ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, DownloadSimple, type Icon } from '@phosphor-icons/react'
import { TransitionLink } from './TransitionLink'

type IconName = 'arrow-right' | 'arrow-up-right' | 'download'

const icons: Record<IconName, Icon> = {
  'arrow-right': ArrowRight,
  'arrow-up-right': ArrowUpRight,
  download: DownloadSimple,
}

type PillButtonProps = {
  children: ReactNode
  to?: string
  href?: string
  onClick?: () => void
  icon?: IconName
  external?: boolean
  className?: string
  /** Renders a native disabled <button> regardless of `to`/`href`, for a
   * destination that doesn't exist yet (e.g. the resume placeholder) —
   * honest and non-breaking instead of linking into a 404 (E6 hardening). */
  disabled?: boolean
  title?: string
  /** M3/M4 hooks (12-motion.md): passed straight through to the root element. */
  'data-intro'?: string
  'data-reveal'?: string
}

/** M10 (41-ink-replace-map.md): scales `.ink-wash`'s transform-origin to
 * wherever the pointer entered, so the fill grows from that point instead
 * of always the left edge. Keyboard focus never fires this — `.ink-wash`'s
 * own CSS default (50%/50%, styles/base.css) covers it. */
function setWashOrigin(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100
  const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100
  e.currentTarget.style.setProperty('--wash-x', `${x}%`)
  e.currentTarget.style.setProperty('--wash-y', `${y}%`)
}

// Shared states (11-layout.md §Global, 42-ink-direction.md §Components): an
// outline pill that fills with a dark ink wash from the pointer's entry point on
// hover/focus-visible (M10), label/icon flipping to paper over it; press
// scale; no wash on coarse pointers (they only get the active feedback).
// `disabled:` styles cover the resume-placeholder case above. Dimming goes
// through color (not opacity): the M4 scroll-reveal (motion/reveal.ts)
// writes an inline `opacity: 1` on every `[data-reveal]` target once it
// plays, which would silently cancel `disabled:opacity-40` on this same
// element (R1 finding 2).
// `group-hover:`/`group-focus-visible:` only ever match *descendants* of a
// `.group` element (Tailwind compiles them to a `:where(.group):hover *`
// selector) -- they can never match the `.group` element itself, so the
// colour flip below has to be a plain `hover:`/`focus-visible:` on this
// same root instead.
const base =
  'group relative isolate inline-flex h-11 items-center gap-2 overflow-hidden rounded-full border border-ink px-6 ' +
  'text-body text-ink transition-[transform,color] duration-[120ms] ease-dry active:scale-[0.97] ' +
  'pointer-fine:hover:text-background focus-visible:text-background ' +
  'disabled:border-ink-muted disabled:text-ink-muted disabled:pointer-events-none disabled:active:scale-100'

function PillContent({ children, icon, disabled }: { children: ReactNode; icon?: IconName; disabled?: boolean }) {
  const IconComponent = icon ? icons[icon] : null

  return (
    <>
      {disabled ? null : <span aria-hidden="true" className="ink-wash" />}
      <span className="relative">{children}</span>
      {IconComponent ? (
        <IconComponent
          aria-hidden="true"
          weight="bold"
          className="relative size-4 shrink-0 transition-transform duration-[180ms] ease-dry pointer-fine:group-hover:translate-x-1 pointer-fine:group-hover:duration-[250ms] group-focus-visible:translate-x-1 group-focus-visible:duration-[250ms] motion-reduce:translate-x-0!"
        />
      ) : null}
    </>
  )
}

export function PillButton({
  children,
  to,
  href,
  onClick,
  icon,
  external,
  disabled = false,
  className = '',
  title,
  ...rest
}: PillButtonProps) {
  const classes = `${base} ${className}`.trim()

  if (disabled) {
    return (
      <button type="button" disabled aria-disabled="true" title={title} className={classes} {...rest}>
        <PillContent icon={icon} disabled>
          {children}
        </PillContent>
      </button>
    )
  }

  if (to) {
    return (
      <TransitionLink to={to} className={classes} onPointerEnter={setWashOrigin} {...rest}>
        <PillContent icon={icon}>{children}</PillContent>
      </TransitionLink>
    )
  }

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        onPointerEnter={setWashOrigin}
        {...rest}
      >
        <PillContent icon={icon}>{children}</PillContent>
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} className={classes} onPointerEnter={setWashOrigin} {...rest}>
      <PillContent icon={icon}>{children}</PillContent>
    </button>
  )
}
