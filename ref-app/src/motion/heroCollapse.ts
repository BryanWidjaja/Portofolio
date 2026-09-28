/**
 * src/motion/heroCollapse.ts
 *
 * 47-round3-plan.md §R6b: the home h1 ("Bryan Widjaja") collapses into the
 * fixed `Monogram` (components/Monogram.tsx, R5) once its top reaches
 * ~18% of the viewport, and expands back out on the way up. Framework-
 * free module, plain DOM writes driven off one `ScrollTrigger` — the same
 * "own module-level engine, React just wires refs to it" split as
 * app/inkCover.ts / motion/heroMist.ts.
 *
 * Mechanism: a fixed "ghost" `B`/`W` pair, rendered at the *real* h1
 * letters' own computed font (hero size) and only ever scaled <= 1 (bar
 * §Shared rules "crisp means device pixels … rendered at its largest size
 * and only ever scaled ≤ 1"), flies between the h1 letters' rects and
 * Monogram's rects. Collapse's target (Monogram) is stable once read;
 * expand's target (the h1 letters) keeps moving under Lenis, so expand
 * re-reads it every tick and lerps toward it instead of tweening to a
 * fixed end value.
 *
 * 49-round4-plan.md §E4a item 1: the h1 is two stacked lines again ("Bryan"
 * / "Widjaja", styles/base.css `[data-collapse-word] { display: block }`),
 * so `B` and `W` start their flight from two different line boxes. That
 * needs no special-casing here -- `startB`/`startW` (collapse) and
 * `naturalB`/`naturalW` (expand's `tick`) are each `letters.*
 * .getBoundingClientRect()`, read independently per letter, every time.
 * Whatever line a letter is actually rendered on *is* its start rect; nothing
 * in this file ever assumed the two shared one line or one row of the same
 * `y`.
 */
import { gsap, ScrollTrigger } from './gsap'
import { EASE, DURATION } from './tokens'
import { getMonogramLetters, setMonogramState } from '../components/Monogram'

export type HeroCollapseOptions = {
  h1: HTMLElement
  letters: { b: HTMLElement; w: HTMLElement }
  /** The "ryan"/"idjaja" remainder spans that brush out/re-write. */
  rest: { ryan: HTMLElement; idjaja: HTMLElement }
  reduced: boolean
}

// Kept in sync by hand with motion/tokens.ts's DURATION.heroCollapse*/
// heroExpandRewriteLeadMs (same pattern as app/inkCover.ts's MS constants).
const FLIGHT_MS = DURATION.heroCollapseFlightMs
const ERASE_MS = DURATION.heroCollapseEraseMs
const REWRITE_LEAD_MS = DURATION.heroExpandRewriteLeadMs

// Above the fixed nav (--z-index-nav: 50, styles/theme.css) so the ghost
// flies over it, below the ink curtain (90).
const GHOST_Z = 55

type Ghost = { el: HTMLElement }

function readFont(el: HTMLElement) {
  const cs = getComputedStyle(el)
  return {
    fontFamily: cs.fontFamily,
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    fontSize: cs.fontSize,
    letterSpacing: cs.letterSpacing,
    color: cs.color,
    // Owner, 2026-09-28: "when BW goes back to Bryan Widjaja, there's a
    // snapping effect ... the ending B and W goes into a y coord that's
    // higher than what it's supposed to be." Measured: at the landing frame
    // the ghost's transform is exactly matrix(1,0,0,1,..) and its top/left
    // match the real letter's to the pixel -- but its *box* is 152px tall
    // against the letter's 194px.
    //
    // `letters.b` is an inline span, so its border box is the font's own
    // content area (ascent+descent at 160px = 194px). The ghost is
    // `position: fixed`, which blockifies it, so its box collapses to
    // `line-height` (152px) instead. Half-leading is then (152-194)/2 =
    // -21px, i.e. the ghost's glyph sits ~21px above where the same glyph
    // sits inside the inline letter -- so swapping ghost for letter jumps.
    // Giving the ghost a line-height equal to the letter's own content
    // height makes half-leading exactly 0, so box top == content-area top
    // on both sides and the two glyphs coincide. Scale then maps that box
    // onto the monogram's (same typeface, so the same metric ratio).
    lineHeight: `${el.getBoundingClientRect().height}px`,
  }
}

function makeGhost(letter: string, font: ReturnType<typeof readFont>, rect: DOMRect, initialScale: number): Ghost {
  const el = document.createElement('span')
  el.textContent = letter
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('data-hero-ghost', '')
  const style = el.style
  style.position = 'fixed'
  style.left = `${rect.left}px`
  style.top = `${rect.top}px`
  style.margin = '0'
  style.padding = '0'
  style.pointerEvents = 'none'
  style.zIndex = String(GHOST_Z)
  style.transformOrigin = '0 0'
  style.fontFamily = font.fontFamily
  style.fontWeight = font.fontWeight
  style.fontStyle = font.fontStyle
  style.fontSize = font.fontSize
  style.lineHeight = font.lineHeight
  style.letterSpacing = font.letterSpacing
  style.color = font.color
  style.transform = `scale(${initialScale})`
  document.body.appendChild(el)
  return { el }
}

function setRestClip(el: HTMLElement, hiddenFromRightPct: number) {
  el.style.clipPath = `inset(0 ${hiddenFromRightPct}% 0 0)`
}

export function mountHeroCollapse({ h1, letters, rest, reduced }: HeroCollapseOptions) {
  let collapsed = false
  let generation = 0
  let ghosts: Ghost[] = []
  let tickerFn: (() => void) | null = null

  function stopTicker() {
    if (tickerFn) {
      gsap.ticker.remove(tickerFn)
      tickerFn = null
    }
  }

  function clearGhosts() {
    ghosts.forEach((g) => g.el.remove())
    ghosts = []
  }

  function killTweensOf(...targets: HTMLElement[]) {
    gsap.killTweensOf(targets)
  }

  function applyCollapsedInstant() {
    collapsed = true
    stopTicker()
    clearGhosts()
    letters.b.style.visibility = 'hidden'
    letters.w.style.visibility = 'hidden'
    setRestClip(rest.ryan, 100)
    setRestClip(rest.idjaja, 100)
    setMonogramState('shown')
  }

  function applyExpandedInstant() {
    collapsed = false
    stopTicker()
    clearGhosts()
    letters.b.style.visibility = ''
    letters.w.style.visibility = ''
    setRestClip(rest.ryan, 0)
    setRestClip(rest.idjaja, 0)
    setMonogramState('hero')
  }

  function collapse() {
    if (collapsed) return
    collapsed = true
    const myGen = ++generation
    stopTicker()
    clearGhosts()
    killTweensOf(letters.b, letters.w, rest.ryan, rest.idjaja)

    const target = getMonogramLetters()
    if (reduced || !target) {
      applyCollapsedInstant()
      return
    }

    const startB = letters.b.getBoundingClientRect()
    const startW = letters.w.getBoundingClientRect()
    const ghostB = makeGhost('B', readFont(letters.b), startB, 1)
    const ghostW = makeGhost('W', readFont(letters.w), startW, 1)
    ghosts = [ghostB, ghostW]
    gsap.set([ghostB.el, ghostW.el], { willChange: 'transform' })

    letters.b.style.visibility = 'hidden'
    letters.w.style.visibility = 'hidden'

    const scaleB = Math.min(1, target.b.height / startB.height)
    const scaleW = Math.min(1, target.w.height / startW.height)

    function land() {
      if (myGen !== generation) return
      clearGhosts()
      setMonogramState('shown')
    }

    // Different eases on x vs y (EASE.flyX/flyY) so the two rects diverge
    // and reconverge instead of tracing a straight line — reads as a gentle
    // arc that settles into the landing, not a swoop (tokens.ts's own
    // comment on EASE.flyX/flyY has the R4-5b retune reasoning).
    gsap.to(ghostB.el, { x: target.b.left - startB.left, scale: scaleB, duration: FLIGHT_MS / 1000, ease: EASE.flyX })
    gsap.to(ghostB.el, { y: target.b.top - startB.top, duration: FLIGHT_MS / 1000, ease: EASE.flyY, onComplete: land })
    gsap.to(ghostW.el, { x: target.w.left - startW.left, scale: scaleW, duration: FLIGHT_MS / 1000, ease: EASE.flyX })
    gsap.to(ghostW.el, { y: target.w.top - startW.top, duration: FLIGHT_MS / 1000, ease: EASE.flyY })

    // "ryan"/"idjaja" brush out right-to-left, concurrent with the flight.
    gsap.set([rest.ryan, rest.idjaja], { willChange: 'clip-path' })
    gsap.fromTo(
      rest.ryan,
      { clipPath: 'inset(0 0% 0 0)' },
      {
        clipPath: 'inset(0 100% 0 0)',
        duration: ERASE_MS / 1000,
        ease: EASE.eraseOut,
        onComplete: () => {
          rest.ryan.style.willChange = 'auto'
        },
      },
    )
    gsap.fromTo(
      rest.idjaja,
      { clipPath: 'inset(0 0% 0 0)' },
      {
        clipPath: 'inset(0 100% 0 0)',
        duration: ERASE_MS / 1000,
        ease: EASE.eraseOut,
        delay: 0.03,
        onComplete: () => {
          rest.idjaja.style.willChange = 'auto'
        },
      },
    )
  }

  function expand() {
    if (!collapsed) return
    collapsed = false
    const myGen = ++generation
    stopTicker()
    clearGhosts()
    killTweensOf(letters.b, letters.w, rest.ryan, rest.idjaja)

    const startPos = getMonogramLetters()
    if (reduced || !startPos) {
      applyExpandedInstant()
      return
    }

    setMonogramState('hero')
    const target = startPos // narrowed non-null, safe to read inside `tick` below

    // The h1 letters stay `visibility:hidden` (their box, and therefore
    // getBoundingClientRect, is unaffected by that) until the ghost lands —
    // their live rect is this flight's *moving* target, re-read every tick.
    const naturalB = letters.b.getBoundingClientRect()
    const naturalW = letters.w.getBoundingClientRect()
    const startScaleB = Math.min(1, target.b.height / naturalB.height)
    const startScaleW = Math.min(1, target.w.height / naturalW.height)

    const ghostB = makeGhost('B', readFont(letters.b), target.b, startScaleB)
    const ghostW = makeGhost('W', readFont(letters.w), target.w, startScaleW)
    ghosts = [ghostB, ghostW]
    gsap.set([ghostB.el, ghostW.el], { willChange: 'transform' })

    const easeX = gsap.parseEase(EASE.flyX)
    const easeY = gsap.parseEase(EASE.flyY)
    const start = performance.now()

    function tick() {
      const t = Math.min(1, (performance.now() - start) / FLIGHT_MS)
      const ex = easeX(t)
      const ey = easeY(t)
      const liveB = letters.b.getBoundingClientRect()
      const liveW = letters.w.getBoundingClientRect()

      const bx = target.b.left + (liveB.left - target.b.left) * ex
      const by = target.b.top + (liveB.top - target.b.top) * ey
      const bScale = startScaleB + (1 - startScaleB) * ex
      gsap.set(ghostB.el, { x: bx - target.b.left, y: by - target.b.top, scale: bScale })

      const wx = target.w.left + (liveW.left - target.w.left) * ex
      const wy = target.w.top + (liveW.top - target.w.top) * ey
      const wScale = startScaleW + (1 - startScaleW) * ex
      gsap.set(ghostW.el, { x: wx - target.w.left, y: wy - target.w.top, scale: wScale })

      if (t >= 1) {
        stopTicker()
        if (myGen !== generation) return
        clearGhosts()
        letters.b.style.visibility = ''
        letters.w.style.visibility = ''
      }
    }
    tickerFn = tick
    gsap.ticker.add(tickerFn)

    // "ryan"/"idjaja" re-write left->right, starting ~0.15s before the
    // ghost lands.
    //
    // Owner, 2026-09-28: "hv the delay between the B and W snapping back and
    // ryan idjaja animating be 0.5s less." The gap this line controls is the
    // time from expand()'s trigger (B/W starting to fly back) to the rewrite
    // tween's own start: at FLIGHT_MS=550/REWRITE_LEAD_MS=150 that was 400ms,
    // and a 500ms cut floored it at 0 -- ryan/idjaja started together with
    // the flight, no lag at all. Owner again, same day: "ryan idjaja now
    // moves out too fast aswell ... be in between the prev vers and the curr
    // vers, the 0.5s jump was too fast." So the cut is halved to 200ms,
    // putting the gap at 200ms -- midway between the original 400 and the
    // 0 it was taken to. The rewrite still starts well before the ghost
    // lands (200ms in, against a 550ms flight), just not from the very
    // first frame. (collapse() has no equivalent gap: its own erase-out
    // already starts concurrently with the flight from the top of the
    // function.)
    const REWRITE_DELAY_CUT_MS = 200
    const rewriteDelay = Math.max(0, FLIGHT_MS - REWRITE_LEAD_MS - REWRITE_DELAY_CUT_MS) / 1000
    gsap.set([rest.ryan, rest.idjaja], { willChange: 'clip-path' })
    gsap.to(rest.ryan, {
      clipPath: 'inset(0 0% 0 0)',
      duration: (REWRITE_LEAD_MS * 2) / 1000,
      ease: EASE.eraseIn,
      delay: rewriteDelay,
      onComplete: () => {
        rest.ryan.style.willChange = 'auto'
      },
    })
    gsap.to(rest.idjaja, {
      clipPath: 'inset(0 0% 0 0)',
      duration: (REWRITE_LEAD_MS * 2) / 1000,
      ease: EASE.eraseIn,
      delay: rewriteDelay + 0.03,
      onComplete: () => {
        rest.idjaja.style.willChange = 'auto'
      },
    })
  }

  // Reload/pop already past the trigger: start collapsed with no flight.
  const triggerFraction = 0.18
  const alreadyPast = h1.getBoundingClientRect().top <= window.innerHeight * triggerFraction
  if (alreadyPast) applyCollapsedInstant()

  const trigger = ScrollTrigger.create({
    trigger: h1,
    start: `top ${triggerFraction * 100}%`,
    onEnter: collapse,
    onLeaveBack: expand,
  })

  return () => {
    stopTicker()
    clearGhosts()
    trigger.kill()
  }
}
