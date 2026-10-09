import type { ComponentType, PointerEvent, ReactNode } from 'react'
import type { IconProps } from '@phosphor-icons/react'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight'
import { ArrowUpRight } from '@phosphor-icons/react/dist/ssr/ArrowUpRight'
import { DownloadSimple } from '@phosphor-icons/react/dist/ssr/DownloadSimple'
import { TransitionLink } from './TransitionLink'

type IconName = 'arrow-right' | 'arrow-up-right' | 'download'

const icons: Record<IconName, ComponentType<IconProps>> = {
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
  /** `outline` (default): ink outline that fills with a flat ink-disc wash
   * on hover (R6a, 58 §F1 -- the blot texture is gone; see `.ink-wash`).
   * `solid`: a flat grey fill at rest that deepens on hover, no wash
   * texture (owner, 2026-09-28: the home "About me" button). */
  variant?: 'outline' | 'solid'
  /** Passed to an `href` link, e.g. `download` for the CV file. */
  download?: boolean | string
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
const shared =
  'group relative isolate inline-flex h-11 items-center gap-2 overflow-hidden rounded-full border px-6 ' +
  'text-body active:scale-[0.97] ' +
  'disabled:border-ink-muted disabled:text-ink-muted disabled:pointer-events-none disabled:active:scale-100'

const variants = {
  outline:
    'border-ink text-ink transition-[transform,color] duration-[120ms] ease-dry ' +
    'pointer-fine:hover:text-background focus-visible:text-background',
  // Paper on --color-ink-subtle is 5.45:1, on --color-ink-muted 7.53:1 (AA).
  solid:
    'border-ink-subtle bg-ink-subtle text-background ' +
    'transition-[transform,background-color,border-color] duration-[200ms] ease-dry ' +
    'pointer-fine:hover:border-ink-muted pointer-fine:hover:bg-ink-muted focus-visible:border-ink-muted focus-visible:bg-ink-muted',
} as const

function PillContent({ children, icon, disabled, wash }: { children: ReactNode; icon?: IconName; disabled?: boolean; wash: boolean }) {
  const IconComponent = icon ? icons[icon] : null

  return (
    <>
      {disabled || !wash ? null : <span aria-hidden="true" className="ink-wash" />}
      <span className="relative whitespace-nowrap">{children}</span>
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
  variant = 'outline',
  download,
  ...rest
}: PillButtonProps) {
  const classes = `${shared} ${variants[variant]} ${className}`.trim()
  const wash = variant === 'outline'
  const onPointerEnter = wash ? setWashOrigin : undefined

  if (disabled) {
    return (
      <button type="button" disabled aria-disabled="true" title={title} className={classes} {...rest}>
        <PillContent icon={icon} disabled wash={wash}>
          {children}
        </PillContent>
      </button>
    )
  }

  if (to) {
    return (
      <TransitionLink to={to} className={classes} onPointerEnter={onPointerEnter} {...rest}>
        <PillContent icon={icon} wash={wash}>{children}</PillContent>
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
        download={download}
        onPointerEnter={onPointerEnter}
        {...rest}
      >
        <PillContent icon={icon} wash={wash}>{children}</PillContent>
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} className={classes} onPointerEnter={onPointerEnter} {...rest}>
      <PillContent icon={icon} wash={wash}>{children}</PillContent>
    </button>
  )
}
