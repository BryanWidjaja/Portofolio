import { useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Container } from './Container'
import { TransitionLink } from './TransitionLink'
import { UnderlineLink } from './UnderlineLink'
import { gsap, ScrollTrigger, useGSAP } from '../motion/gsap'
import { usePageEnter, type PageEnterMode } from '../motion/pageEnter'
import { useReducedMotion } from '../app/MotionProvider'
import { useMenuControls } from '../app/MenuProvider'
import { DURATION, EASE } from '../motion/tokens'
import { site } from '../content/site'

// 11-layout.md §Global (L3/L4, 14-approved): inline right-aligned links on
// md+, a "Menu" text pill on <md. M5 (41-ink-replace-map.md): nav items
// fade into view (opacity only, no y/yPercent — bar §D) on the first
// pageEnter of the session only. M6: on md+, scrolling past 50px swaps the
// inline links for the compact menu button and back — links disperse out/
// lift back in, the button inks in/disperses out, no `back.out`/`y` motion
// anywhere; the CSS `md:hidden` on the button stays as the true no-JS
// fallback (inline styles from GSAP always win over it once this
// initialises).
export function Nav() {
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
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

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(min-width: 768px)', () => {
        const linkItems = navRef.current?.querySelectorAll<HTMLElement>('ul [data-nav-item]')
        const button = navRef.current?.querySelector<HTMLElement>('[data-menu-button]')
        if (!linkItems?.length || !button) return

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
          scale: 0.6,
        })

        const collapse = () => {
          // M6: links disperse out (opacity only, reverse order); the
          // button inks in after a short hand-off — no `y`/`back.out`.
          gsap.to(linkItems, {
            autoAlpha: 0,
            duration: reduced ? 0 : DURATION.navLinkOut,
            ease: EASE.disperse,
            stagger: reduced ? 0 : { each: DURATION.navSwapStagger, from: 'end' },
            overwrite: 'auto',
          })
          gsap.to(button, {
            autoAlpha: 1,
            scale: 1,
            duration: reduced ? 0 : DURATION.navButtonIn,
            delay: reduced ? 0 : DURATION.navButtonInDelay,
            ease: EASE.bleed,
            overwrite: 'auto',
          })
        }

        const expand = () => {
          gsap.to(button, {
            autoAlpha: 0,
            scale: 0.6,
            duration: reduced ? 0 : DURATION.navButtonOut,
            ease: EASE.disperse,
            overwrite: 'auto',
          })
          gsap.to(linkItems, {
            autoAlpha: 1,
            duration: reduced ? 0 : DURATION.navLinkBack,
            delay: reduced ? 0 : DURATION.navLinkBackDelay,
            ease: EASE.lift,
            stagger: reduced ? 0 : { each: DURATION.navSwapStagger, from: 'start' },
            overwrite: 'auto',
          })
        }

        const trigger = ScrollTrigger.create({ start: 50, onEnter: collapse, onLeaveBack: expand })

        return () => {
          trigger.kill()
          gsap.set(button, { clearProps: 'all' })
          gsap.set(linkItems, { clearProps: 'all' })
        }
      })
      return () => mm.kill()
    },
    { scope: navRef, dependencies: [reduced] },
  )

  return (
    <header ref={navRef} className="pointer-events-none fixed inset-x-0 top-0 z-nav">
      <Container as="nav" className="flex h-16 items-center justify-between md:h-20">
        {/* G-follow-up (coordinator review, 2026-09-24): the monogram sits
            in the fixed header, *above* the menu overlay (z-nav 50 > z-menu
            40) -- while G6's other elements (links, row, rod) already flip
            to paper for the dark panel, this was left on 焦, measuring
            2.20:1 against 浓 (near-invisible; AA needs 3:1 for this size).
            `data-on-ink` (moved here from the old, unused `<header>`
            placement -- 42's own vocabulary for "flips when sitting on
            dark ink") + the matching rule in base.css flips it to paper
            (7.53:1) whenever `data-menu-open` is set on <html>. */}
        <TransitionLink
          to="/"
          aria-label={`${site.name}, home`}
          data-nav-item
          data-on-ink
          className="pointer-events-auto -m-3 p-3 font-display text-[1.75rem] font-semibold italic leading-none text-ink md:text-[2rem]"
        >
          {site.monogram}
        </TransitionLink>

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
          </ul>

          {/* V17 (41-ink-replace-map.md), 42 §Components "menu pill with
              paper fill and 1px 重 border" — see the correction note
              above for why this no longer needs to fight an ancestor
              blend-mode to render that way. `isolate` stays as a defensive
              boundary for the pill's own contents.

              G5 (46 item 5 / 45 owner decision 2): inverted per the owner's
              polish-round pick — 浓 (`ink-muted`, `#434B52`) fill instead
              of the paper fill above, paper (`text-background`) label at
              7.53:1. 重 on 浓 is only 1.4:1 (invisible), so the border
              drops to 清 (`border-line`, `#C4CBD1`) at 5.41:1 against the
              new fill; the fill itself now carries the pill's edge against
              the page the way the old paper fill + 重 border used to. The
              drawn X below is `currentColor`, so it inherits the paper
              label colour automatically in the open state too.

              G8 (46 item 8): `text-nav` sizes the "Menu" label the same
              18px/20px-at-md step as the `<ul>` links above.

              45 §Owner feedback items 8+9: a fixed box (`w-21`, 84px, not
              content-width `px-5`) so the open/close swap never resizes
              the pill — "Menu" and the X glyph render inside the exact
              same rect at every width. Closed keeps the "Menu" label
              (unchanged copy); open swaps it for a drawn X instead of the
              old "Close" text, so `aria-label` carries the accessible name
              only in that state (closed still reads its own visible text
              via the ordinary accessible-name algorithm). */}
          <button
            type="button"
            data-nav-item
            data-menu-button
            data-cursor="stick"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? site.menuButton.closeLabel : undefined}
            onClick={toggle}
            className="label isolate inline-flex h-11 w-21 items-center justify-center rounded-full border border-line bg-ink-muted text-nav text-background md:hidden"
          >
            {open ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                {/* Two brushed strokes, not a geometric X: each is a
                    slightly bowed curve (not a straight diagonal) with
                    round caps, so ink pooling reads at the tips instead of
                    a mitred vector corner. */}
                <path d="M6.5 6.5 Q13 11 17.5 17.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
                <path d="M17.5 6.5 Q11 11 6.5 17.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
              </svg>
            ) : (
              site.menuButton.open
            )}
          </button>
        </div>
      </Container>
    </header>
  )
}
