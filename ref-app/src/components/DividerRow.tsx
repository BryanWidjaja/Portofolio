import type { ElementType, ReactNode } from 'react'
import { BrushLine } from './BrushLine'

type DividerRowProps = {
  as?: ElementType
  className?: string
  children: ReactNode
  /** Picks one of BrushLine's 3 generated paths — callers rendering a list
   * pass their own index so "never 2 alike in a row" (42 §Components)
   * holds across the whole list, not just within one row. */
  lineVariant?: number
}

// V19 (41-ink-replace-map.md): the flat `border-t border-line` rule is now
// a generated brush line (components/BrushLine.tsx), used by the project
// detail story (11-layout.md §Project detail) and About's experience list
// (§About). The spec's hover background and label slide are dropped for
// both call sites (§About: "a hover state on something that isn't
// interactive misleads"), so this is deliberately just the line plus
// caller-supplied padding/grid.
export function DividerRow({ as: As = 'div', className = '', children, lineVariant = 0 }: DividerRowProps) {
  return (
    <As className={`relative ${className}`.trim()}>
      <BrushLine variant={lineVariant} className="absolute inset-x-0 top-0" />
      {children}
    </As>
  )
}
