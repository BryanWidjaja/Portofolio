import { useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Container } from './Container'
import { Monogram } from './Monogram'
import { UnderlineLink } from './UnderlineLink'
import { CvButton } from './CvButton'
import { gsap, ScrollTrigger, useGSAP } from '../motion/gsap'
import { usePageEnter, type PageEnterMode } from '../motion/pageEnter'
import { useReducedMotion } from '../app/MotionProvider'
import { useMenuControls } from '../app/MenuProvider'
import { DURATION, EASE } from '../motion/tokens'
import { site } from '../content/site'

// 11-layout.md §Global (L3/L4, 14-approved): inline right-aligned links on
// md+, a round burger on <md. M5 (41-ink-replace-map.md): nav items fade
// into view (opacity only, no y/yPercent — bar §D) on the first pageEnter
// of the session only.
//
// 47-round3-plan.md §R5 item 6 (supersedes M6's plain opacity swap): on
// md+, scrolling past 50px collapses the inline links into the burger --
// each link travels toward the button's own centre (x/y measured once, at
// the scroll trigger's fire, not continuously) with opacity dropping only
// over the last ~40% of its own travel, nearest-to-button first. The
// burger inks in as the first (nearest) link arrives. Scrolling back is
// the reverse: the burger fades, then links fade in at the burger and
// travel back out. The CSS `md:hidden` on the button stays as the true
// no-JS fallback (inline styles from GSAP always win over it once this
// initialises).
//
// The button itself is a 44px round burger (three brushed lines, clearly
// separated) that morphs into an X on open -- rotate + translate only,
// each outer line pivoting about its own centre while the middle line
// dissolves out (opacity only). 49-round4-plan.md §E3 item 2: was two
// lines through round 3; the owner's round-4 fix adds the middle line
// back (see the morph effect below for the geometry note).
const BUTTON_HIDDEN_SCALE = 0.7

// Orchestrator review, round 2: rotate+translate as two separate GSAP
// properties (`rotation`, `y`) doesn't have a documented, engine-stable
// composition order for SVG elements once `transform-origin`/
// `transform-box` are in play -- the round-1 fix still landed as a "^"
// chevron, not an X, because whichever one of {rotate-then-translate,
// translate-then-rotate} the browser actually used, it wasn't the one the
// math assumed. Rather than guess again, this computes the exact affine
// matrix by hand and writes it straight to the SVG `transform` *attribute*
// (not the CSS property) every frame: that attribute's coordinate system
// is unambiguously the svg's own (0,0)-origin user space, by spec, so
// there's no transform-origin/transform-box/viewBox-scale interaction left
// to get wrong.
//
// `pivotMatrix(angleDeg, cx, cy, targetX, targetY)` returns the matrix
// that rotates a shape by `angleDeg` about its own point (cx, cy) and then
// carries that (now-rotated-in-place) point to (targetX, targetY) -- i.e.
// "spin this line in place, then slide its centre over to land exactly
// here". Standard rotate-about-a-point construction (R centred via
// T(P)·R·T(-P)) with the extra slide folded into the same matrix's own
// translation term, so it's one write, not two composed operations for
// the browser to order.
function pivotMatrix(angleDeg: number, cx: number, cy: number, targetX: number, targetY: number) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const a = cos
  const b = sin
  const c = -sin
  const d = cos
  const e = targetX - a * cx - c * cy
  const f = targetY - b * cx - d * cy
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

// Burger line geometry (viewBox units, matches the `d` attributes below,
// 49-round4-plan.md §E3 item 2's suggested centres): line1's own centre
// (12,6), line2's (12,18), 12 units apart, with a third static line at
// (12,12) between them. The outer two morph toward the icon's own centre
// (12,12) as `t` goes 0 (closed, own position, no rotation) -> 1 (open,
// crossed through the centre) via the same pivotMatrix/matrixForT below;
// the middle line never moves or rotates -- it just dissolves via
// opacity (1 - t), applied directly in the morph effect, not through a
// matrix (transform and opacity only, per the motion bar).
const LINE1 = { angle: -45, cx: 12, cy: 6 }
const LINE2 = { angle: 45, cx: 12, cy: 18 }
const ICON_CENTER = 12

function matrixForT(t: number, line: { angle: number; cx: number; cy: number }) {
  const targetX = lerp(line.cx, ICON_CENTER, t)
  const targetY = lerp(line.cy, ICON_CENTER, t)
  return pivotMatrix(line.angle * t, line.cx, line.cy, targetX, targetY)
}

export function Nav() {
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const line1Ref = useRef<SVGPathElement>(null)
  const line2Ref = useRef<SVGPathElement>(null)
  const lineMidRef = useRef<SVGPathElement>(null)
  // Persists across `open` toggles (unlike a value recreated inside the
  // effect below) so a reversal mid-morph retargets from wherever the
  // morph currently is, not from a reset 0.
  const morphRef = useRef({ t: 0 })
  const reduced = useReducedMotion()
  const [firstEnter, setFirstEnter] = useState(false)
  const { open, toggle } = useMenuControls()

  usePageEnter(
    useCallback((mode: PageEnterMode) => {
      if (mode === 'first') setFirstEnter(true)
    }, []),
  )

  useGSAP(
    () => {
      if (!firstEnter) return
      const items = gsap.utils.toArray<HTMLElement>('[data-nav-item]', navRef.current)
      if (!items.length) return
      if (reduced) {
        gsap.set(items, { opacity: 1 })
        return
      }
      gsap.set(items, { opacity: 0 })
      gsap.to(items, {
        opacity: 1,
        duration: DURATION.navIntro,
        ease: EASE.lift,
        delay: DURATION.navIntroDelay,
        stagger: DURATION.navStagger,
      })
    },
    { scope: navRef, dependencies: [firstEnter, reduced] },
  )

  // The burger <-> X morph, driven by a single `t` (0 closed -> 1 open)
  // tweened on a plain proxy object and applied every tick as an explicit
  // SVG `transform` attribute (see `pivotMatrix`/`matrixForT` above for
  // why: two rounds of guessing GSAP's rotate+translate composition order
  // both produced the wrong shape, so this owns the whole matrix instead
  // of asking the browser to compose two properties).
  useGSAP(
    () => {
      const line1 = line1Ref.current
      const line2 = line2Ref.current
      const lineMid = lineMidRef.current
      if (!line1 || !line2 || !lineMid) return
      const proxy = morphRef.current
      const apply = () => {
        line1.setAttribute('transform', matrixForT(proxy.t, LINE1))
        line2.setAttribute('transform', matrixForT(proxy.t, LINE2))
        // Middle line: opacity only, no matrix -- it never moves or
        // rotates, it just dissolves out as the outer two cross into the X.
        lineMid.style.opacity = String(1 - proxy.t)
      }
      const target = open ? 1 : 0
      if (reduced) {
        proxy.t = target
        apply()
        return
      }
      const duration = DURATION.burgerMorph
      const ease = open ? EASE.bleed : EASE.disperse
      gsap.to(proxy, { t: target, duration, ease, overwrite: 'auto', onUpdate: apply })
    },
    { dependencies: [open, reduced] },
  )

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(min-width: 768px)', () => {
        const linkItems = navRef.current?.querySelectorAll<HTMLElement>('ul [data-nav-item]')
        const button = navRef.current?.querySelector<HTMLElement>('[data-menu-button]')
        if (!linkItems?.length || !button) return
        const links = Array.from(linkItems)

        // Taken out of flow (R1 finding 5): while `autoAlpha:0` this still sat
        // in the flex row next to `<ul>`, so the invisible button's own width
        // pushed the visible links left of the true right gutter. Absolute +
        // anchored to the `relative` wrapper's right edge means `<ul>` alone
        // determines the row's width, in both the expanded and collapsed
        // state. Centred with a fixed `top` offset (half the button's own
        // 44px height, h-11) rather than `yPercent`, so this static
        // positioning set can't trip the "no yPercent" grep gate (44 §Exec
        // tasks E4 accept) meant for M5/M6's actual entrance/exit motion.
        gsap.set(button, {
          display: 'inline-flex',
          position: 'absolute',
          top: 'calc(50% - 22px)',
          right: 0,
          autoAlpha: 0,
          scale: BUTTON_HIDDEN_SCALE,
        })

        // Nearest-to-button first: `links` is DOM order (Work, About,
        // Contact, ...), and the button sits at the row's right edge, so
        // the last link is spatially nearest. `order` below is 0 for that
        // last link, rising as we walk back toward the first.
        const orderOf = (i: number) => links.length - 1 - i

        const collapse = () => {
          if (reduced) {
            gsap.set(links, { autoAlpha: 0 })
            gsap.set(button, { autoAlpha: 1, scale: 1 })
            return
          }
          const buttonRect = button.getBoundingClientRect()
          const buttonCenter = { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.top + buttonRect.height / 2 }
          links.forEach((el, i) => {
            const rect = el.getBoundingClientRect()
            const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
            const dx = buttonCenter.x - from.x
            const dy = buttonCenter.y - from.y
            const delay = orderOf(i) * DURATION.navCollapseStagger
            // Travel: x/y + scale toward the button, as if absorbed.
            gsap.to(el, {
              x: dx,
              y: dy,
              scale: 0.6,
              duration: DURATION.navCollapseTravel,
              delay,
              ease: 'power2.in',
              overwrite: 'auto',
            })
            // Opacity only over the travel's last ~40%.
            gsap.to(el, {
              autoAlpha: 0,
              duration: DURATION.navCollapseTravel * 0.4,
              delay: delay + DURATION.navCollapseTravel * 0.6,
              ease: EASE.disperse,
              overwrite: 'auto',
            })
          })
          // Inks in as the first (nearest, delay 0) link arrives.
          gsap.to(button, {
            autoAlpha: 1,
            scale: 1,
            duration: DURATION.navButtonIn,
            delay: DURATION.navCollapseTravel,
            ease: EASE.bleed,
            overwrite: 'auto',
          })
        }

        const expand = () => {
          if (reduced) {
            gsap.set(button, { autoAlpha: 0, scale: BUTTON_HIDDEN_SCALE })
            gsap.set(links, { autoAlpha: 1, x: 0, y: 0, scale: 1 })
            return
          }
          // The burger fades first.
          gsap.to(button, {
            autoAlpha: 0,
            scale: BUTTON_HIDDEN_SCALE,
            duration: DURATION.navButtonOut,
            ease: EASE.disperse,
            overwrite: 'auto',
          })
          links.forEach((el, i) => {
            const delay = DURATION.navButtonOut + orderOf(i) * DURATION.navExpandStagger
            const fadeDuration = DURATION.navExpandTravel * 0.4
            // Fade in at the button (wherever the link currently sits --
            // if this is a mid-flight reversal that's partway through the
            // collapse, not necessarily the button's exact centre, and
            // `overwrite: 'auto'` lets both tweens below pick straight up
            // from those current values with no jump).
            gsap.to(el, {
              autoAlpha: 1,
              duration: fadeDuration,
              delay,
              ease: EASE.lift,
              overwrite: 'auto',
            })
            // Then travel out to its own place.
            gsap.to(el, {
              x: 0,
              y: 0,
              scale: 1,
              duration: DURATION.navExpandTravel,
              delay: delay + fadeDuration,
              ease: 'power3.out',
              overwrite: 'auto',
            })
          })
        }

        const trigger = ScrollTrigger.create({ start: 50, onEnter: collapse, onLeaveBack: expand })

        return () => {
          trigger.kill()
          gsap.set(button, { clearProps: 'all' })
          gsap.set(links, { clearProps: 'all' })
        }
      })
      return () => mm.kill()
    },
    { scope: navRef, dependencies: [reduced] },
  )

  return (
    <header ref={navRef} className="site-nav-header pointer-events-none fixed inset-x-0 top-0 z-nav">
      <Container as="nav" className="flex h-16 items-center justify-between md:h-20">
        {/* 47-round3-plan.md §R5 item 2 / 45 §Round3 R3d: the monogram no
            longer lives inline here -- it's `Monogram.tsx`, which also
            doubles as R6's collapse target for the home hero name. It
            still sits in this same fixed header, *above* the menu overlay
            (z-nav 50 > z-menu 40), and keeps its own `data-on-ink` flip. */}
        <Monogram />

        <div className="relative flex items-center pointer-events-auto">
          {/* 2026-09-23, two corrections in sequence:
              1. `mix-blend-difference` used to sit on the <header> itself,
                 sweeping the menu pill's fully-opaque fill into that blend
                 against whatever's behind the nav — turning the intended
                 paper pill/焦 label into a solid-ink pill with paper text.
                 `isolation:isolate` on the pill doesn't exempt it from an
                 *ancestor's* blend-mode (it only scopes the pill's own
                 descendants), so the fix moved the blend down onto just
                 the monogram and this `<ul>`.
              2. That broke *those* in turn: `mix-blend-mode` blends against
                 the backdrop already painted within the element's own
                 stacking context, and neither the monogram link nor this
                 `<ul>` paints anything behind itself locally — so
                 `text-background` (paper) rendered as paper on a
                 transparent/paper backdrop, i.e. invisible, not inverted.
              42 §Components "Sans 500 links in 焦" and §Tokens' nav-band
              gate (L >= 85%, the hero measures .959) both point the same
              way: the nav was never meant to invert here, that blend was a
              v1 leftover (decision A/K) the restyle supersedes. Plain 焦
              ink text, no blend-mode, for both the monogram and these
              links — the Cursor's own `mix-blend-difference` (its dot only,
              42 §Components line 91) is untouched. */}
          <ul className="hidden gap-8 text-nav text-ink md:flex">
            {site.nav.map((link) => (
              <li key={link.href} data-nav-item>
                <UnderlineLink to={link.href} current={link.href === pathname} className="label py-3">
                  {link.label}
                </UnderlineLink>
              </li>
            ))}
            {/* The CV download sits last in the row, so it's the first item
                the scroll collapse above sweeps into the burger (nearest
                first) -- and it lives in the menu panel too for that state. */}
            {site.resumeAvailable ? (
              <li data-nav-item className="flex items-center">
                <CvButton />
              </li>
            ) : null}
          </ul>

          {/* 47-round3-plan.md §R5 item 6 / 49-round4-plan.md §E3 item 2: a
              44px round burger (three brushed paper lines) replaces the old
              "Menu" text pill entirely -- icon-only at every width, so
              `aria-label` always carries the accessible name (there's no
              visible text to fall back to). G5 (46 item 5 / 45 owner
              decision 2)'s border/paper (`text-background`) icon colour are
              unchanged; the fill is item 3's darker `bg-ink-dark`
              (#2A3035, theme.css) replacing the old `bg-ink-muted` on this
              one surface. `isolate` stays as a defensive stacking boundary
              for the icon. Fixed 44x44 box (`h-11 w-11`, replacing the old
              text pill's `w-21`) so open/close never resizes it -- both
              states render inside the exact same circle. */}
          <button
            type="button"
            data-nav-item
            data-menu-button
            data-cursor="stick"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? site.menuButton.closeLabel : site.menuButton.openLabel}
            onClick={toggle}
            className="isolate inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-ink-dark text-background md:hidden"
          >
            {/* Three brushed strokes -- each a slightly bowed curve (not a
                straight line) with round caps, so ink pooling reads at the
                tips instead of a mitred vector corner. This closed/burger
                shape (no `transform` attribute at rest, `matrixForT(0, ...)`
                is the identity) reads unmistakably as 3 lines at 44px. The
                morph effect above writes each outer line's own explicit
                rotate+carry matrix straight onto its `transform` attribute
                every frame, so there's no transform-origin/transform-box/
                CSS-transform-list ordering left for the browser to interpret
                -- the SVG `transform` attribute's coordinate system is this
                svg's own unscaled (0,0)-origin user space, by spec. The
                middle line carries no `transform` at all, ever -- it only
                dissolves via `opacity` (set in the same effect), so it can
                never leave a ghost stroke once open. */}
            {/* `data-menu-burger-line` marks outer vs. middle explicitly
                (rather than leaning on DOM order/index) so check-
                transitions.mjs can select "the two lines that morph" and
                "the one that dissolves" unambiguously regardless of markup
                order -- the visual top-to-bottom order above is kept for
                the no-JS/SSR static rendering, not for test convenience. */}
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                ref={line1Ref}
                data-menu-burger-line="outer"
                d="M3 6 Q12 5.3 21 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
              <path
                ref={lineMidRef}
                data-menu-burger-line="mid"
                d="M3 12 Q12 11.3 21 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
              <path
                ref={line2Ref}
                data-menu-burger-line="outer"
                d="M3 18 Q12 18.7 21 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </Container>
    </header>
  )
}
