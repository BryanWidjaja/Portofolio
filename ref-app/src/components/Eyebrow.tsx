import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

type EyebrowProps = {
  children: ReactNode
  as?: ElementType
  className?: string
} & Omit<ComponentPropsWithoutRef<'p'>, 'children' | 'className'>

// 42-ink-direction.md §Tokens final: Alegreya italic 400, sentence case.
// Never uppercase or letter-spaced (that combination is the `label`
// utility's job).
export function Eyebrow({ children, as: As = 'p', className = '', ...rest }: EyebrowProps) {
  return (
    <As className={`font-display text-eyebrow italic ${className}`.trim()} {...rest}>
      {children}
    </As>
  )
}
