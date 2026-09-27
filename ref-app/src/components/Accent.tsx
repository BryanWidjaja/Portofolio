import type { ReactNode } from 'react'

type AccentProps = { children: ReactNode }

// 42-ink-direction.md §Tokens final: one italic accent per section, sized
// 1.125em relative to the surrounding text, Alegreya italic (V10). The old
// lime pencil underline (M17) is gone; the seal that briefly replaced it
// as the hero's closing beat is gone too (45 §Owner feedback item 4).
export function Accent({ children }: AccentProps) {
  return <span className="font-display text-[1.125em] italic">{children}</span>
}
