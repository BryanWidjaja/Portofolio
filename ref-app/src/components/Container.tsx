import type { ElementType, ReactNode } from 'react'

type ContainerProps = {
  as?: ElementType
  id?: string
  className?: string
  children: ReactNode
}

/**
 * Centered editorial measure; shell gutters come from the shared layout token.
 */
export function Container({ as: As = 'div', id, className = '', children }: ContainerProps) {
  return (
    <As id={id} className={`mx-auto site-container ${className}`.trim()}>
      {children}
    </As>
  )
}
