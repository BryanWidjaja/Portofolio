import { useEffect, useRef } from 'react'
import { Container } from './Container'
import { TransitionLink } from './TransitionLink'
import { EmailCopy } from './EmailCopy'
import { ArrowLink } from './ArrowLink'
import { useMenuControls } from '../app/MenuProvider'
import { gsap, useGSAP } from '../motion/gsap'
import { DURATION, EASE } from '../motion/tokens'
import { useReducedMotion } from '../app/MotionProvider'
import { site } from '../content/site'

const ROD_MASK = 'url(/ink/line-2.svg), url(/ink/brush-edge.webp)'

/**
 * 12-motion.md M7 + 42-ink-direction.md §Storyboards "Menu open/close
 * (立轴)": one panel reading as a hanging scroll, translateY -100%→0
 * inside an overflow-hidden root — no clip wipe, no per-column sweep
 * (13-build-plan.md §Conflicts: one overlay shape at every width). The
 * same MenuButton doubles as the <md hamburger and the md+
 * scroll-collapsed nav toggle (Nav.tsx M6), so it always opens this.
 *
 * G6 (46 item 6 / 45 §Polish round decision 2, 2026-09-24): the panel is
 * now 浓 (`.ink-paper-dark`, styles/base.css), not paper — the owner's
 * dark-menu pick. Sets `data-menu-open` on <html> so Cursor.tsx's stroke
 * canvas can flip its stamp colour to paper over it (S1's contract, no
 * blend-mode — 46 decision 4).
 *
 * 45 §Owner feedback item 7 (2026-09-23): the owner read the open/close as
 * "off-theme and slow, like a UI widget sliding" — the panel's own
 * translateY is still the 立轴 unroll (a scroll genuinely does translate
 * as it unrolls), but the durations were the plan's full-strength ones
 * and nothing about the motion read as *ink*, only as a rectangle in
 * transit. Two changes: every menu-open/close duration below is trimmed
 * ~35-40%, and the bottom rod is no longer just along for the ride — it
 * now draws itself left-to-right the same way BrushLine.tsx draws a
 * divider (the tapered line silhouette ∩ the brush-edge sweep, `--line-x`
 * 100%→0%), timed to finish just as the panel settles. The reveal is
 * still the translate (guaranteed full, gapless coverage — no risk of a
 * mask leaving gaps at the viewport's corners); the brush stroke is the
 * flourish that makes the arrival read as ink instead of a drawer.
 */
export function MenuOverlay() {
  const { open, close, instantRef } = useMenuControls()
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const rodRef = useRef<HTMLSpanElement>(null)
  const wasOpenRef = useRef(false)

  // Unmount safety net only -- the real toggling happens inline below,
  // timed to the panel's own visibility rather than the `open` boolean.
  useEffect(() => {
    return () => {
      document.documentElement.removeAttribute('data-menu-open')
    }
  }, [])

  useGSAP(
    () => {
      const root = rootRef.current
      const panel = panelRef.current
      const rod = rodRef.current
      if (!root || !panel) return
      const links = gsap.utils.toArray<HTMLElement>('[data-menu-link]', root)
      const row = root.querySelector<HTMLElement>('[data-menu-row]')
      const wasOpen = wasOpenRef.current
      wasOpenRef.current = open

      if (reduced) {
        gsap.set(panel, { yPercent: 0 })
        gsap.set(links, { autoAlpha: 1 })
        if (row) gsap.set(row, { autoAlpha: 1 })
        if (rod) gsap.set(rod, { '--line-x': '0%', opacity: 1 })
        // G6/G-follow-up: `data-menu-open` gates Cursor.tsx's stamp colour
        // and `[data-on-ink]` (the monogram) -- set the instant the root
        // starts fading in, cleared only once it's finished fading out, so
        // it brackets the entire window the dark panel is actually visible
        // (root's own opacity, not `open`, is the thing they'd otherwise
        // render against).
        if (open) document.documentElement.setAttribute('data-menu-open', '')
        gsap.to(root, {
          autoAlpha: open ? 1 : 0,
          duration: DURATION.fade,
          ease: EASE.fade,
          overwrite: 'auto',
          onComplete: () => {
            if (!open) document.documentElement.removeAttribute('data-menu-open')
          },
        })
        if (open) links[0]?.focus()
        return
      }

      if (!open) {
        if (!wasOpen || instantRef.current) {
          // True idle (never opened) or a force-close: park instantly, no
          // tween -- "the close animation is never seen" (flow 4B). The
          // panel was never visible (idle) or a curtain already covers it
          // (force-close, flow 4B), so the flip can be instant too.
          instantRef.current = false
          gsap.set(panel, { yPercent: -100 })
          gsap.set(links, { autoAlpha: 0 })
          if (row) gsap.set(row, { autoAlpha: 0 })
          if (rod) gsap.set(rod, { '--line-x': '100%', opacity: 0 })
          gsap.set(root, { autoAlpha: 0 })
          document.documentElement.removeAttribute('data-menu-open')
          return
        }
        // Animated close: MenuButton, Esc, or a same-page nav (flow 7/5A').
        // The rod just fades with the row -- it leaves with the panel, no
        // reverse-draw (a fast exit doesn't need a second brush beat).
        gsap.to(links, {
          autoAlpha: 0,
          duration: DURATION.menuLinkOut,
          ease: EASE.disperse,
          stagger: { each: DURATION.menuLinkOutStagger, from: 'end' },
        })
        if (row) gsap.to(row, { autoAlpha: 0, duration: DURATION.menuLinkOut, ease: EASE.disperse })
        if (rod) gsap.to(rod, { opacity: 0, duration: DURATION.menuLinkOut, ease: EASE.disperse })
        // `data-menu-open` stays set for the whole close tween, not just
        // until `open` flips false: the panel's translateY covers the
        // fixed header (and everything else) right up to its very last
        // frame (same viewport-filling geometry as the open tween, just in
        // reverse), so clearing it any earlier would flip the monogram/
        // cursor back to ink while they're still sitting on a fully dark
        // panel.
        gsap.to(panel, {
          yPercent: -100,
          duration: DURATION.menuClose,
          delay: DURATION.menuCloseDelay,
          ease: EASE.unroll,
          onComplete: () => {
            gsap.set(root, { autoAlpha: 0 })
            document.documentElement.removeAttribute('data-menu-open')
          },
        })
        return
      }

      // Opening. The panel's translateY sweeps the viewport top-to-bottom,
      // so it covers the header within the first ~10% of `menuOpen`'s own
      // duration -- flipping immediately (rather than waiting for that
      // tween to finish) trails the real coverage by at most a few tens of
      // ms, not a visible window of ink-on-dark.
      document.documentElement.setAttribute('data-menu-open', '')
      gsap.set(root, { autoAlpha: 1 })
      gsap.set(panel, { yPercent: -100 })
      gsap.set(links, { autoAlpha: 0 })
      if (row) gsap.set(row, { autoAlpha: 0 })
      if (rod) gsap.set(rod, { '--line-x': '100%', opacity: 0 })

      gsap.to(panel, { yPercent: 0, duration: DURATION.menuOpen, ease: EASE.unroll })
      // The rod draws left-to-right (BrushLine.tsx's own technique) timed
      // to land right as the panel finishes arriving -- the brush, not
      // the rectangle, is what the eye reads as the motion settling.
      if (rod) {
        gsap.to(rod, {
          '--line-x': '0%',
          opacity: 1,
          duration: DURATION.menuRodDraw,
          delay: Math.max(DURATION.menuOpen - DURATION.menuRodDraw, 0),
          ease: EASE.travel,
        })
      }
      gsap.to(links, {
        autoAlpha: 1,
        duration: DURATION.menuLinkIn,
        delay: DURATION.menuLinkDelay,
        ease: EASE.lift,
        stagger: DURATION.menuLinkStagger,
      })
      if (row) {
        gsap.to(row, { autoAlpha: 1, duration: DURATION.menuRowIn, delay: DURATION.menuRowDelay, ease: EASE.lift })
      }

      const focusTimer = window.setTimeout(() => links[0]?.focus(), DURATION.menuLinkDelay * 1000)
      return () => window.clearTimeout(focusTimer)
    },
    { scope: rootRef, dependencies: [open, reduced] },
  )

  // Focus trap + Esc (13-build-plan §Architecture: "focus trap" is
  // MenuOverlay's own job). Browser `inert` on main/footer already removes
  // the rest of the document from the tab order while this is open.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')).filter(
        (el) => el.offsetParent !== null,
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  return (
    <div
      ref={rootRef}
      id="site-menu"
      data-menu-overlay
      aria-hidden={!open}
      inert={!open ? true : undefined}
      className="invisible fixed inset-0 z-menu overflow-hidden opacity-0"
    >
      <div
        ref={panelRef}
        className="ink-paper-dark absolute inset-0 flex flex-col shadow-[0_24px_48px_-24px_rgb(20_26_30/0.35)] will-change-transform"
      >
        <Container className="relative flex h-full flex-col justify-between py-24 md:py-32">
          {/* G6 (46 item 6 / decision 2): 浓 panel, so link text flips from
              焦 to paper (`text-background`, 11.34:1 — re-measured
              2026-09-28 against `49` §E3 item 3's darker `--color-ink-dark`,
              #2a3035, replacing the original #434b52 here) — the darkest
              tone in the ramp reads as near-invisible on 浓 (1.31:1). */}
          <nav aria-label="Menu">
            <ul className="flex flex-col">
              {site.menuLinks.map((link) => (
                <li key={link.href}>
                  <TransitionLink
                    to={link.href}
                    data-menu-link
                    className="ink-underline inline-block py-2 font-display text-display font-medium text-background md:py-3"
                  >
                    {link.label}
                  </TransitionLink>
                </li>
              ))}
            </ul>
          </nav>
          {/* G6: 清 (`text-line`, 8.15:1 on 浓 — re-measured 2026-09-28
              against the new #2a3035, up from 5.41:1 on the old #434b52) —
              EmailCopy/ArrowLink set no colour of their own on their root
              elements, so this is plain CSS inheritance, not a change to
              either component. */}
          <div
            data-menu-row
            className="flex flex-col gap-6 text-line md:flex-row md:items-baseline md:justify-between"
          >
            <EmailCopy email={site.email} size="lg" />
            <ul className="flex gap-6">
              {site.socials.map((social) => (
                <li key={social.href}>
                  <ArrowLink href={social.href} external size="sm">
                    {social.label}
                  </ArrowLink>
                </li>
              ))}
            </ul>
          </div>
        </Container>
        {/* 42 §Components "a 10px 焦 brush-line rod on its bottom edge",
            redone per 45 §Owner feedback item 7: the same dual mask
            BrushLine.tsx uses (tapered line silhouette ∩ brush-edge sweep)
            instead of the old single static mask, so the rod draws itself
            left-to-right via `--line-x` (set up above) instead of just
            riding along with the panel already fully inked in. `.brush-line`
            supplies mask-repeat/size/position/composite; only the two
            mask-image URLs and the colour are set here, same division as
            BrushLine.tsx itself. G6 (46 item 6): 焦 on 浓 is 1.31:1
            (invisible on the dark panel), so this is 清 instead — 8.15:1
            (re-measured 2026-09-28 for the new #2a3035, up from 5.41:1),
            matching the email/social row above. */}
        <span
          ref={rodRef}
          aria-hidden="true"
          data-menu-rod
          className="brush-line absolute inset-x-0 bottom-0 block h-2.5"
          style={{
            color: 'var(--color-line)',
            maskImage: ROD_MASK,
            WebkitMaskImage: ROD_MASK,
          }}
        />
      </div>
    </div>
  )
}
