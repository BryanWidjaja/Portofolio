/**
 * 42-ink-direction.md §Tokens Motion table, mirrored for GSAP (seconds) and
 * kept in sync by hand with the `--ease-*` custom properties in
 * styles/theme.css. V5 (41-ink-replace-map.md): a mechanical rename off
 * the old vocabulary, applied at every call site: the old hover/press
 * curve is now `dry`, the accordion panel's old curve and the curtain's
 * old cover curve both become `unroll`, the old title-reveal curve and
 * the old menu-button overshoot curve both become `bleed`, the old
 * cursor-settle curve becomes `lift`, and the curtain caps' old curve
 * becomes `disperse`. `travel` and `follow` keep their names. `scrub` (M8
 * parallax) is deleted with `createParallax` (E4): the hero's own mist/scroll
 * scrub is E2's job on a fresh `motion/heroMist.ts`, and no `[data-parallax]`
 * element exists in the DOM to animate in the meantime. The old spring
 * overshoot curve is gone entirely.
 */

export const EASE = {
  press: 'power3.out', // stroke start, :active, cursor down
  travel: 'power1.inOut', // brush-write, brush-line, icon nudge
  lift: 'sine.out', // stroke tail, nav fade
  dry: 'power2.out', // hovers: underline, wash fill, caption
  bleed: 'circ.out', // blot bleed, focus bloom, ink-in, cover spread
  disperse: 'sine.inOut', // exits, ink drying, cover recede
  unroll: 'power2.inOut', // menu, accordion
  mist: 'sine.inOut', // hero planes
  follow: 'power3.out', // cursor follow, stick
  fade: 'none', // every reduced-motion fade
} as const

export const DURATION = {
  // press/lift/dry/bleed/disperse/unroll/stamp/mist/follow/fade values below
  // are the 42-ink-direction.md §Tokens Motion table, seconds. `micro`,
  // `hover(Out)`, `sweep(Out)`, `card(Out)` (old vocabulary) and `heroChar*`/
  // `pencil*`/`reveal(Media)`/`detailCover`/`rule` (superseded by the named
  // constants below) are deleted per V5's "Deleted" list — nothing here
  // still reads them (`hover`/`sweep`/`card` hover states are plain
  // Tailwind `duration-[Nms]` arbitrary values instead, since Tailwind
  // can't consume a JS constant at build time).
  press: 0.12,
  microOut: 0.16, // Cursor only
  state: 0.3, // Cursor only
  stateOut: 0.2, // Cursor only

  // Ink cover (M13, D7, E5): cover .6 (bleed spread) / hold >=.1 / recede .7
  // (disperse, "ink sinking into paper") — the actual WebGL/CSS-fallback
  // tween lives in app/inkCover.ts (framework-free, own copies of these two
  // durations in ms), kept in sync with these by hand.
  cover: 0.6,
  recede: 0.7,
  hold: 0.1,

  // Menu (M7, E5, 立轴 unroll): panel .9 open / .65 close, .15 delay before
  // the panel starts rolling up so the link exit reads first; links/email
  // row fade in .4 (open, staggered 60/single) and out .2 (close, staggered
  // 30 from the end — matches the accordion/nav "disperse" exit pattern).
  //
  // 45 §Owner feedback item 7 (2026-09-23): "off-theme and slow" — trimmed
  // ~35-40% off every menu duration (open/close ratio and the
  // press/travel/lift character both kept), same treatment as item 3's
  // brush-write trims (motion/tokens.ts's own DURATION.heroWrite etc.).
  // menuRodDraw is new: the bottom rod's own left-to-right brush draw
  // (components/MenuOverlay.tsx), timed to land as the panel arrives.
  menuOpen: 0.55, // was 0.9
  menuClose: 0.4, // was 0.65
  menuCloseDelay: 0.08, // was 0.15
  menuLinkIn: 0.3, // was 0.4
  menuLinkDelay: 0.18, // was 0.35
  menuLinkStagger: 0.045, // was 0.06
  menuRowIn: 0.3, // was 0.4
  menuRowDelay: 0.3, // was 0.6
  menuLinkOut: 0.14, // was 0.2
  menuLinkOutStagger: 0.02, // was 0.03
  menuRodDraw: 0.3,

  // Brush-write (M1/M2/M4 heading, motion/brushText.ts): word-to-word
  // stagger .12 (42 §Tokens "Staggers: word .12"); the Home hero's default
  // per-word travel .8; every other page's h1 (and a scroll-revealed
  // heading) writes in .6 total regardless of word count, so the "one hero
  // moment per viewport" beat stays on the hero alone (bar §B).
  //
  // 45 §Owner feedback item 3 (2026-09-23): brush-write and reveal durations
  // read as slightly too slow — trimmed ~15-25% off the travel phase while
  // keeping every press/travel/lift ratio intact (F1 report has the full
  // before->after table). wordStagger was untouched in that pass (it's the
  // stagger, not the phase duration the owner flagged) but item 10 below
  // does trim it, on top of this one.
  // 46-polish-plan.md item 10 (2026-09-24): the slide-from-left brush-write
  // reveal is replaced by a centre-out bleed (motion/brushText.ts, S4) and
  // trimmed further on top of the 2026-09-23 pass below — heroWrite .65->.42,
  // titleWrite .5->.32, wordStagger .12->.07, heroOverlap .45->.30.
  wordStagger: 0.07, // was 0.12
  heroWrite: 0.42, // was 0.8, then 0.65
  titleWrite: 0.32, // was 0.6, then 0.5
  // M1: line 2 ("Widjaja") starts before line 1's stroke lifts, so the two
  // overlap ("the brush breaks, the meaning carries on") — storyboard T0+550.
  // Kept proportional to heroWrite's trim (was .55, ~69% of .8).
  heroOverlap: 0.3, // was 0.55, then 0.45

  // M3/M4 ink-in (opacity only) + blot bleed (mask growth), motion/bleed.ts.
  // §Tokens "bleed" row: blot bleed 1.2 / ink-in .6 (M3 text+meta) — M4's
  // own label/text batch fade is a separate, quicker .5 (42 §Storyboards
  // "#work enters: eyebrow opacity .5"). Trimmed per item 3, see wordStagger's
  // comment above.
  inkIn: 0.5, // was 0.6
  blotBleed: 0.9, // was 1.2
  batchFade: 0.4, // was 0.5
  // M3/M4: item-to-item stagger, 80ms ("intro and batch .08").
  introStagger: 0.08,
  // M3 hand-off from the title/name write (motion/Page.tsx): the Home hero
  // waits for the name (and, later, the inscription) to be well underway —
  // storyboard T0+1250; every other page's intro follows its M2 title by
  // +100, per the same storyboard's About/404 rows.
  heroIntroDelay: 1.25,
  introDelay: 0.1,

  // V19 brush-line draw (motion/BrushLine.tsx): "line .9", trimmed per
  // item 3 (see wordStagger's comment above).
  brushLine: 0.7, // was 0.9

  // M5: nav items start T0+300ms, each 60ms apart, lift duration .3 (42
  // §Tokens "lift: stroke tail, nav fade").
  navIntroDelay: 0.3,
  navIntro: 0.3,
  navStagger: 0.06,

  // M6 (Nav scroll collapse, md+): links disperse out .25 each 60ms from
  // the end; button inks in .3 after a .15 delay; reverse: button fades
  // .25, links lift back in .3 after .1, each 80 apart. No back.out/elastic.
  navLinkOut: 0.25,
  navButtonIn: 0.3,
  navButtonInDelay: 0.15,
  navButtonOut: 0.25,
  navLinkBack: 0.3,
  navLinkBackDelay: 0.1,
  navSwapStagger: 0.08,

  // Accordion (M16): panel unrolls .45 (42 §Storyboards "panel unrolls
  // .45"), Plus/Minus crossfade .2; V28's row wash bleeds in .3 (dry).
  accordionUnroll: 0.45,
  accordionIcon: 0.2,
  accordionWash: 0.3,

  // Every reduced-motion fade (flow 9).
  fade: 0.15,

  // Cursor follow (E5). 45 §Owner feedback items 1+6 (2026-09-23): the old
  // 350/550/400ms follow read as heavy and laggy. The brush tip now leads
  // the raw pointer (a velocity-extrapolated target, components/Cursor.tsx)
  // instead of just chasing it faster, but it still needs a short quickTo
  // window to read as a stroke and not a hard-snapped dot — 120ms is that
  // floor. Label and stick follow tightened by the same ratio.
  followDot: 0.12, // was 0.35
  followLabel: 0.28, // was 0.55
  stick: 0.22, // was 0.4

  // 47-round3-plan.md §R2 (item 4, "the tail retracts into the tip on
  // stop"): once the pointer's confirmed stopped, the trail's painted
  // length eases to 0 over this window — replaces the old two-step
  // hold-then-fade pair (46 item 7's trailHold/trailFade) with one
  // retraction, since the new trail is a deterministic tapered length
  // rather than aging stamps that needed a separate fade multiplier. D4's
  // actual 1.5s hold / 1.2s fade is untouched and still lives as
  // ink/brush.ts's own HOLD_MS/FADE_MS for *cards* — unrelated to this.
  trailRetract: 0.18,
  // 47 §R2 "keep today's scale mapping (pointer/stick/text) with a quick
  // ease": how long the cursor tip's diameter/alpha take to approach a new
  // state's target once it changes, so a hover-state swap reads as a quick
  // settle instead of an instant snap.
  tipState: 0.15,

  // Boot timing (ms, not seconds — used directly as setTimeout/race values).
  fontsCapMs: 800,
  failsafeMs: 1500,
  bootFailsafeMs: 3000,
} as const
