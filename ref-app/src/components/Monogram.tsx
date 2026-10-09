import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { TransitionLink } from './TransitionLink'
import { site } from '../content/site'

/**
 * 47-round3-plan.md §R5 item 2 / 45 §Round 3 R3d: the nav's old inline `BW`
 * link (Nav.tsx) is gone -- this is its replacement *and* R6's collapse
 * target. Two spans, `data-mono="B"`/`"W"`, Cormorant 700 roman (R4-6's
 * EB Garamond swap is reverted; still the hero name's own face,
 * `font-display font-bold`, no italic) sized to match the
 * old monogram's footprint (1.75rem / 2rem md, `leading-none`) so it lands
 * on the nav's existing baseline with no new layout math.
 *
 * States (set on the link root, plain DOM writes -- not React state, so
 * R6 can drive this from a GSAP scroll trigger outside the render cycle,
 * the same module-function convention RootLayout already uses for
 * Cursor/InkCover):
 * - `shown`: visible and focusable. Default on every route except `/`.
 * - `hero`: `visibility:hidden`, not focusable. On `/`, the hero name
 *   itself carries the B/W on screen, so this stays in `hero` for the
 *   whole route -- R5 leaves it there permanently; R6 wires the actual
 *   scroll-triggered switch (collapse into this, expand back out of it).
 *
 * `data-on-ink` (base.css `html[data-menu-open] [data-on-ink]`) moves here
 * unchanged from the old Nav monogram -- same fixed-header stacking
 * context (z-nav 50 > the menu panel's z-menu 40), same paper flip.
 */
export type MonogramState = 'shown' | 'hero'

let rootEl: HTMLAnchorElement | null = null
let bEl: HTMLSpanElement | null = null
let wEl: HTMLSpanElement | null = null



/**
 * R6 API: the current `B`/`W` span rects (viewport-relative, like
 * `getBoundingClientRect()`), for the ghost-letter flight to fly toward
 * (collapse) or read a live target from every tick (expand, since the
 * page keeps scrolling under Lenis). `null` before the component has
 * mounted -- Monogram renders in every route's chrome, so in practice
 * this is only ever null for a single frame.
 */
export function getMonogramLetters(): { b: DOMRect; w: DOMRect } | null {
  if (!bEl || !wEl) return null
  return { b: bEl.getBoundingClientRect(), w: wEl.getBoundingClientRect() }
}

/**
 * R6 API: switches between `shown` and `hero` (see the states note above).
 * A no-op before mount (there is nothing to switch yet); the next mount
 * re-applies whatever the caller last asked for via the route effect
 * below, so this never needs to be called before the component exists.
 */
export function setMonogramState(state: MonogramState) {
  if (!rootEl) return
  if (state === 'hero') {
    rootEl.style.visibility = 'hidden'
    rootEl.setAttribute('tabindex', '-1')
    rootEl.setAttribute('aria-hidden', 'true')
  } else {
    rootEl.style.visibility = ''
    rootEl.removeAttribute('tabindex')
    rootEl.removeAttribute('aria-hidden')
  }
}

export function Monogram() {
  const { pathname } = useLocation()
  const linkRef = useRef<HTMLAnchorElement>(null)

  // 51-round5-plan.md item 5 fix: `bEl`/`wEl` are assigned by the inline
  // callback refs below, which React re-runs (detach old, reattach new) on
  // *every* re-render -- inline arrow functions get a fresh identity each
  // time -- always in the commit phase, before any passive effect's
  // cleanup. A single `[pathname]`-deps effect that both restored `rootEl`
  // and nulled `bEl`/`wEl` on cleanup raced that: on a route change the
  // order was ref-reattach (bEl/wEl correctly set) -> this effect's own
  // cleanup from the *previous* render (bEl/wEl nulled again) -> this
  // effect's body (only rootEl restored) -- leaving bEl/wEl permanently
  // null for the rest of that route, so `getMonogramLetters()` returned
  // null and R6's collapse took its `!target` snap branch instead of
  // flying a ghost. Splitting the null-out into its own `[]`-deps effect
  // means it only runs on the component's real unmount, never on a
  // same-instance route change, so the ref callbacks' own assignments are
  // never clobbered.
  useEffect(() => {
    return () => {
      rootEl = null
      bEl = null
      wEl = null
    }
  }, [])

  useEffect(() => {
    rootEl = linkRef.current
    // `/` starts (and, until R6 wires the scroll trigger, permanently
    // stays) in `hero`; every other route is `shown` from the first
    // frame -- no flash of the monogram on the home route.
    setMonogramState(pathname === '/' ? 'hero' : 'shown')
  }, [pathname])

  // The monogram's on-screen box can also move on a plain viewport
  // resize (the md breakpoint's larger monogram size/position) without a
  // route change -- rebuild the crop then too. A resize listener, not a
  // scroll handler or rAF loop: it only fires on the (rare) resize event
  // itself.


  return (
    <TransitionLink
      ref={linkRef}
      to="/"
      aria-label={`${site.name}, home`}
      data-nav-item

      data-monogram
      data-on-ink
      className="pointer-events-auto -m-3 p-3 font-display text-[1.75rem] font-bold not-italic leading-none text-ink md:text-[2rem]"
    >
      <span
        ref={(el) => {
          bEl = el
        }}
        data-mono="B"
      >
        B
      </span>
      <span
        ref={(el) => {
          wEl = el
        }}
        data-mono="W"
      >
        W
      </span>
    </TransitionLink>
  )
}
