import { forwardRef } from 'react'

/**
 * 13-build-plan.md §Architecture: TransitionProvider's announcer. Text is
 * written imperatively (clear, then set on the next frame) rather than via
 * React state, so repeating the same title still re-triggers the announcement
 * instead of bailing out on an unchanged string.
 */
export const LiveRegion = forwardRef<HTMLDivElement>(function LiveRegion(_props, ref) {
  return <div ref={ref} role="status" aria-live="polite" className="sr-only" data-route-announcer />
})
