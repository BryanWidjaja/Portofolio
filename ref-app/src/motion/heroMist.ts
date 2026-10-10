import { gsap, ScrollTrigger } from './gsap'

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
 *
 * 49-round4-plan.md §E1 (headline perf fix): the idle drift used to be 3
 * infinite GSAP yoyo tweens on `xPercent` -- a main-thread `gsap.set` on
 * every plane, every frame, forever, for a +-2% sway. Diagnosis measured
 * ~32-38 style recalcs/s from exactly this. The drift is now a compositor-
 * driven CSS animation (`.hero-mist` / `hero-mist-drift-pos|neg` in
 * styles/base.css) on the independent `translate` property, which composes
 * with -- never fights -- the scrub's own `transform` (`gsap.set(el,
 * {yPercent})` below): CSS Transforms Level 2 applies `translate` before
 * `transform`, so both are visibly live at once. This module still owns
 * every pause gate (`load`, IntersectionObserver, hidden tab, page
 * transition) exactly as before; only the mechanism `sync()` toggles
 * changed, from `tween.play()/.pause()` to `animation-play-state` +
 * scoped `will-change`.
 */
export function mountHeroMist({ root, image, mist }: HeroMistRefs) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (reducedMotion.matches) return () => {}

  const MIST_PERIODS = [43, 51, 59] // 42 §Tokens: near-coprime so the planes never lock in step
  mist.forEach((el, i) => {
    // Alternate sway direction per plane (i%2===0 ? +2% : -2%), matching the
    // old tween's `xPercent` target. `animation-direction: alternate` plus
    // the `from 0 / to <target>` keyframe reproduces the old `yoyo: true`
    // leg-for-leg: one keyframe iteration === one old tween "leg" of
    // `duration` = MIST_PERIODS[i] seconds.
    el.style.animationName = i % 2 === 0 ? 'hero-mist-drift-pos' : 'hero-mist-drift-neg'
    el.style.animationDuration = `${MIST_PERIODS[i]}s`
  })

  let intersecting = false
  let loaded = document.readyState === 'complete'
  let cancelled = false
  let stableScheduled = false
  let idleHandle: number | undefined
  let idleFallback: number | undefined
  const pendingImages: HTMLImageElement[] = []

  function attachMistImages() {
    if (cancelled || reducedMotion.matches) return
    for (const el of mist) {
      const src = el.dataset.mistSrc
      if (!src || el.dataset.mistReady === 'true') continue
      const preload = new Image()
      preload.decoding = 'async'
      preload.fetchPriority = 'low'
      pendingImages.push(preload)
      preload.src = src
      preload.decode().then(() => {
        if (cancelled || reducedMotion.matches || !el.isConnected) return
        el.style.backgroundImage = `url("${src}")`
        el.dataset.mistReady = 'true'
      }).catch(() => {})
    }
  }

  function scheduleMistImages() {
    if (stableScheduled || cancelled || reducedMotion.matches) return
    stableScheduled = true
    let started = false
    const start = () => {
      if (started) return
      started = true
      if (idleFallback !== undefined) window.clearTimeout(idleFallback)
      idleFallback = undefined
      attachMistImages()
    }
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(start, { timeout: 1200 })
      idleFallback = window.setTimeout(start, 1200)
    } else {
      idleFallback = window.setTimeout(start, 500)
    }
  }

  function afterStableHeroPaint() {
    if (cancelled || reducedMotion.matches) return
    const decoded = image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      ? image.decode().catch(() => {})
      : Promise.resolve()
    void decoded.then(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })).then(scheduleMistImages)
  }

  image.addEventListener('load', afterStableHeroPaint, { once: true })
  image.addEventListener('error', afterStableHeroPaint, { once: true })
  if (image instanceof HTMLImageElement && image.complete) afterStableHeroPaint()

  function transitionActive() {
    const t = document.documentElement.dataset.transition
    return t !== undefined && t !== 'idle'
  }

  function sync() {
    const shouldRun = loaded && intersecting && !document.hidden && !transitionActive()
    mist.forEach((el) => (el.style.animationPlayState = shouldRun ? 'running' : 'paused'))
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

  const mistRanges = [
    { from: 6, to: -8 },
    { from: 10, to: -16 },
    { from: 16, to: -28 },
  ] as const
  function applyDepth(progress: number) {
    gsap.set(image, {
      scale: 1.08 + progress * 0.08,
      yPercent: -2 + progress * 8,
    })
    mist.forEach((el, i) => {
      const range = mistRanges[i] ?? mistRanges[0]
      gsap.set(el, { yPercent: range.from + (range.to - range.from) * progress })
    })
  }

  const scrub = ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    // 49-round4-plan.md §E1 item 3: will-change scoped to exactly the
    // scroll-scale window (this trigger's active range), not permanent --
    // permanent will-change wastes memory and this harness can't credit it
    // anyway (software rasterizer), but it's a no-regret real-browser fix.
    // Cleared on leave so the image re-rasterises crisp.
    onToggle: (self) => {
      const value = self.isActive ? 'transform' : 'auto'
      image.style.willChange = value
      mist.forEach((el) => { el.style.willChange = value })
    },
    onUpdate: (self) => {
      if (transitionActive()) return
      applyDepth(self.progress)
    },
  })
  applyDepth(scrub.progress)

  return () => {
    cancelled = true
    window.removeEventListener('load', onLoad)
    image.removeEventListener('load', afterStableHeroPaint)
    image.removeEventListener('error', afterStableHeroPaint)
    document.removeEventListener('visibilitychange', sync)
    io.disconnect()
    transitionObserver.disconnect()
    if (idleFallback !== undefined) window.clearTimeout(idleFallback)
    if (idleHandle !== undefined) {
      const idleWindow = window as Window & { cancelIdleCallback?: (handle: number) => void }
      idleWindow.cancelIdleCallback?.(idleHandle)
    }
    pendingImages.forEach((preload) => { preload.src = '' })
    mist.forEach((el) => {
      el.style.backgroundImage = ''
      el.style.willChange = ''
      delete el.dataset.mistReady
      gsap.set(el, { clearProps: 'transform' })
    })
    image.style.willChange = ''
    gsap.set(image, { clearProps: 'transform' })
    scrub.kill()
  }
}
