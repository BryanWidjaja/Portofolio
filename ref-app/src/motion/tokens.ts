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
  // 49-round4-plan.md §E1: the hero mist's idle drift moved from a GSAP
  // tween to a CSS animation (styles/base.css `.hero-mist`), so this token
  // is no longer imported by JS -- it documents the feel the CSS
  // `cubic-bezier(0.445, 0.05, 0.55, 0.95)` ("easeInOutSine") approximates
  // by hand, kept here rather than deleted so the two stay traceable to
  // one intent.
  mist: 'sine.inOut', // hero planes (mirrored in styles/base.css `.hero-mist`)
  follow: 'power3.out', // cursor follow, stick
  fade: 'none', // every reduced-motion fade

  // 47-round3-plan.md §R6b (BW collapse): "different eases on x and y … so
  // the path arcs" — x settles first, y keeps curving a beat longer, which
  // is what reads as an arc instead of a straight line between the two
  // rects. Retuned 49-round4-plan.md §F2 (owner: "slightly faster and less
  // bouncelike"): both were `.inOut` (slow start, fast middle, slow
  // finish) — that S-shape, combined with x and y hitting their own
  // fastest point at different moments, is what read as a bounce. Plain
  // `.out` curves move immediately and only ever decelerate into the
  // landing (a settle, never a swoop), and moving the pair up to
  // power3/power4 (from power2/power3) narrows the real gap between the
  // two curves — higher-power eases converge toward each other, so the arc
  // is gentler without flattening to a straight line. `back`/`elastic`
  // remain unused (banned, quality-bar §D).
  flyX: 'power3.out',
  flyY: 'power4.out',
  eraseOut: 'power2.in', // ryan/idjaja brush-out (collapse)
  eraseIn: 'power2.out', // ryan/idjaja re-write (expand)
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

  // Ink cover (M13, D7, E5, retimed 47 §R4): cover .45 (bleed spread) /
  // hold >=.1 / recede .65 (disperse, "ink sinking into paper") — the
  // actual WebGL/CSS-fallback tween lives in app/inkCover.ts (framework-
  // free, own copies of these two durations in ms as COVER_MS/RECEDE_MS),
  // kept in sync with these by hand.
  cover: 0.45,
  recede: 0.65,
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
  menuOpen: 0.42, // was 0.55 (owner: "slightly too slow", 2026-10-09)
  menuClose: 0.4, // was 0.65
  menuCloseDelay: 0.08, // was 0.15
  menuLinkIn: 0.25, // was 0.3
  menuLinkDelay: 0.14, // was 0.18
  menuLinkStagger: 0.04, // was 0.045
  menuRowIn: 0.25, // was 0.3
  menuRowDelay: 0.24, // was 0.3
  menuLinkOut: 0.14, // was 0.2
  menuLinkOutStagger: 0.02, // was 0.03
  menuRodDraw: 0.24,

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
  // 51-round5-plan.md item 6 (R5d, "both, halved"): blotBleed 0.9 -> 0.45,
  // batchFade 0.4 -> 0.2.
  blotBleed: 0.45, // was 0.9 (originally 1.2)
  batchFade: 0.2, // was 0.4 (originally 0.5)
  // M3/M4: item-to-item stagger. 51-round5-plan.md item 6 (R5d) halved it,
  // 0.08 -> 0.04.
  introStagger: 0.04, // was 0.08
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

  // 47-round3-plan.md §R5 item 6 (Nav scroll collapse, md+, supersedes the
  // plain opacity swap the M6 tokens below described): links travel toward
  // the burger's centre (x/y measured at trigger time, scale ~.6,
  // power2.in -- "absorbed"), opacity dropping only over the last ~40% of
  // each link's own travel; nearest-to-button first, .04 apart. The burger
  // inks in (scale .7->1 + autoAlpha) as the first (nearest) link arrives,
  // so its own delay is `navCollapseTravel`. Total <= .55s: .32 travel +
  // .2 ink-in, and the farthest link (2 stagger steps, +.08) still lands
  // at .4, inside the burger's own .32-.52 window.
  navCollapseTravel: 0.32,
  navCollapseStagger: 0.04,
  navButtonIn: 0.2,
  // Reverse: the burger fades first (unchanged .25), then links fade in
  // *at* the burger's position (opacity over the travel's first 40%) and
  // travel out to their own places, power3.out, nearest first, .04 apart.
  // A scroll reversal mid-flight reuses these same two calls per link
  // (Nav.tsx's `overwrite: 'auto'`) rather than a fixed sequence, so it
  // always continues from wherever the link currently is -- never a jump
  // back to a "start" position it may already be past.
  navExpandTravel: 0.35,
  navExpandStagger: 0.04,
  navButtonOut: 0.25,
  // The burger's own two-line <-> X morph (Nav.tsx svg paths, rotate +
  // translate only): "the same hand as the existing X" bowed-path shapes,
  // just re-oriented -- open drives them to the X's own untransformed
  // geometry, close drives them to a rotated + offset horizontal pair.
  burgerMorph: 0.3,

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

  // 49-round4-plan.md §E4b (R4-5, raindrop splash hero intro), ms --
  // motion/heroSplash.ts keeps its own copy of the total in sync by hand
  // (same pattern as app/inkCover.ts's COVER_MS/RECEDE_MS). Replaces 47
  // §R6a's one-stroke phase durations (heroStrokePressMs et al, deleted
  // with that module) -- this intro has no named phases, just
  // independently-timed drops within one total window. Trimmed 2300 -> 1900
  // by R4-5b (owner: "more and faster paint drops" — 11 drops now, each
  // growing quicker, so the total comes down toward ~2.0s per the plan
  // rather than leaving a bare tail once every drop has already resolved).
  // Trimmed again 2026-09-28 (owner: "the intro anim" should be faster),
  // 1900 -> 1400 -> 900, then walked back to 1150 when 900 overshot ("be in
  // between the prev vers and the curr vers, the 0.5s jump was too fast").
  heroSplashTotalMs: 1150,

  // 47-round3-plan.md §R6b (BW collapse) — motion/heroCollapse.ts's own
  // copies, same hand-sync pattern. Retuned 49-round4-plan.md §F2 (owner:
  // "slightly faster and less bouncelike"): flight 700 -> 550ms, and the
  // "ryan"/"idjaja" brush-out trimmed in proportion (300 -> 235, same
  // ~0.79x factor) so it doesn't look slow relative to the now-quicker
  // flight. heroExpandRewriteLeadMs is an absolute ms offset from the
  // landing moment (not a fraction of FLIGHT_MS), so it stays correct
  // unchanged — the re-write still starts 0.15s before the ghost lands and
  // finishes 0.15s after, regardless of how long the flight itself takes.
  heroCollapseFlightMs: 550,
  heroCollapseEraseMs: 235,
  heroExpandFlightMs: 700,
  heroExpandRewriteLeadMs: 180,
} as const
