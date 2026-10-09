import type { ElementType, ReactNode } from 'react'

type ContainerProps = {
  as?: ElementType
  id?: string
  className?: string
  children: ReactNode
}

/**
 * `G` shorthand (11-layout.md): centered, capped at 1760px, with the
 * responsive gutters from 10-direction.md §Tokens final §Spacing.
 */
export function Container({ as: As = 'div', id, className = '', children }: ContainerProps) {
  return (
    <As id={id} className={`mx-auto w-full max-w-[110rem] px-8 sm:px-12 md:px-20 lg:px-24 xl:px-28 2xl:px-32 ${className}`.trim()}>
      {children}
    </As>
  )
}
