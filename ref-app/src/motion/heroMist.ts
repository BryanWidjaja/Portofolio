import { gsap, ScrollTrigger } from './gsap'
import { EASE } from './tokens'

type HeroMistRefs = {
  root: HTMLElement
  image: HTMLElement
  mist: HTMLElement[]
}

/**
 * D6(a) (45-ink-approved.md), 41-ink-replace-map.md M8: the hero's only
 * per-viewport motion, replacing the old `[data-parallax]` scrub.
 * - Idle drift: each mist plane sways a couple of percent side to side,
 *   staggered by duration so the three never lock in step. 42 §Tokens sets
 *   43/51/59s specifically because they're near-coprime -- 50-ink-review.md
 *   finding 4 caught an earlier 16/20/24s drift that resynchronised every
 *   4 minutes (LCM 240s). Starts once `load` fires (42 §Storyboards "mist
 *   drift starts after load") and pauses off-screen (IntersectionObserver)
 *   or on a hidden tab.
 * - Scroll scrub: while the hero is between entering and leaving the top of
 *   the viewport, the image scales 1 -> 1.04 and the mist planes drift
 *   upward at 0/-3%/-6%, transforms only (bar §D bans everything else).
 * Reduced motion never calls this (components/Hero.tsx renders no mist and
 * a static image instead), so there's no reduced-motion branch here.
 *
 * 46-polish-plan.md item 3(d): both the idle drift and the scrub also pause
 * for the whole life of a page transition (any non-idle `data-transition`),
 * not just off-screen/hidden-tab. Diagnosis's `revealing` phase showed
 * 177-247ms of GPUTask -- landing on a fresh mount of this component (e.g.
 * arriving back at `/`) starts these GSAP tickers the instant `load` +
 * intersection are both already true, stacking real work under the recede
 * animation for an ambient effect nobody can register mid-transition
 * anyway. A MutationObserver on the one attribute TransitionProvider.tsx
 * sets keeps this self-contained -- no import of the transition state.
 */
export function mountHeroMist({ root, image, mist }: HeroMistRefs) {
  const MIST_PERIODS = [43, 51, 59] // 42 §Tokens: near-coprime so the planes never lock in step
  const drifts = mist.map((el, i) =>
    gsap.to(el, {
      xPercent: i % 2 === 0 ? 2 : -2,
      duration: MIST_PERIODS[i],
      ease: EASE.mist,
      repeat: -1,
      yoyo: true,
      paused: true,
    }),
  )

  let intersecting = false
  let loaded = document.readyState === 'complete'

  function transitionActive() {
    const t = document.documentElement.dataset.transition
    return t !== undefined && t !== 'idle'
  }

  function sync() {
    const shouldRun = loaded && intersecting && !document.hidden && !transitionActive()
    drifts.forEach((tween) => (shouldRun ? tween.play() : tween.pause()))
  }

  function onLoad() {
    loaded = true
    sync()
  }
  if (!loaded) window.addEventListener('load', onLoad, { once: true })

  const io = new IntersectionObserver(
    ([entry]) => {
      intersecting = entry.isIntersecting
      sync()
    },
    { threshold: 0 },
  )
  io.observe(root)

  document.addEventListener('visibilitychange', sync)

  const transitionObserver = new MutationObserver(sync)
  transitionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-transition'] })

  const scrub = ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => {
      if (transitionActive()) return
      gsap.set(image, { scale: 1 + self.progress * 0.04 })
      mist.forEach((el, i) => gsap.set(el, { yPercent: -self.progress * (i + 1) * 3 }))
    },
  })

  return () => {
    window.removeEventListener('load', onLoad)
    document.removeEventListener('visibilitychange', sync)
    io.disconnect()
    transitionObserver.disconnect()
    drifts.forEach((tween) => tween.kill())
    scrub.kill()
  }
}
