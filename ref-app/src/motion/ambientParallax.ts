import { gsap, ScrollTrigger } from './gsap'

const TRAVEL_PX = { far: 14, near: 30 } as const
const LANDING_TRAVEL = {
  desktop: { far: 120, mid: 220, near: 360 },
  mobile: { far: 68, mid: 124, near: 180 },
} as const
const LANDING_DRIFT = {
  desktop: { far: 16, mid: 28, near: 46 },
  mobile: { far: 10, mid: 18, near: 28 },
} as const

/** Moves only the scene's own bitmap layers while its section crosses the viewport. */
export function mountAmbientParallax(root: HTMLElement, reduced: boolean) {
  const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-ambient-layer]'))
  const prefersReducedMotion = reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion || layers.length === 0) return () => {}

  const trigger = ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => layers.forEach((layer) => (layer.style.willChange = self.isActive ? 'transform' : 'auto')),
    onUpdate: (self) => {
      layers.forEach((layer) => {
        const depth = layer.dataset.ambientLayer === 'near' ? 'near' : 'far'
        gsap.set(layer, { y: (self.progress * 2 - 1) * TRAVEL_PX[depth] })
      })
    },
  })

  return () => {
    layers.forEach((layer) => {
      layer.style.willChange = ''
      gsap.set(layer, { clearProps: 'transform' })
    })
    trigger.kill()
  }
}

/**
 * Gives each stationary landscape plate its own viewport-linked timeline.
 * Nearby planes cross more distance than distant planes, producing depth
 * without changing content position or hijacking native scrolling.
 */
export function mountLandingParallax(root: HTMLElement, reduced: boolean) {
  const layers = Array.from(root.querySelectorAll<HTMLElement>('[data-parallax-layer]'))
  const prefersReducedMotion = reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion || layers.length === 0) return () => {}

  const media = gsap.matchMedia()
  media.add({ compact: '(max-width: 767px)', wide: '(min-width: 768px)' }, ({ conditions }) => {
    const travelSet = conditions?.compact ? LANDING_TRAVEL.mobile : LANDING_TRAVEL.desktop
    const driftSet = conditions?.compact ? LANDING_DRIFT.mobile : LANDING_DRIFT.desktop
    const tweens: gsap.core.Tween[] = []
    layers.forEach((layer) => {
      const plate = layer.closest<HTMLElement>('[data-parallax-plate]') ?? layer
      const depth = layer.dataset.parallaxLayer as 'far' | 'mid' | 'near'
      if (conditions?.compact && depth === 'near') return
      const travel = travelSet[depth] ?? travelSet.far
      const drift = driftSet[depth] ?? driftSet.far
      const direction = depth === 'mid' ? -1 : 1

      tweens.push(gsap.fromTo(layer,
        { x: direction * drift / 2, y: travel / 2 },
        {
          x: direction * -drift / 2,
          y: -travel / 2,
          ease: 'none',
          scrollTrigger: {
            trigger: plate,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
            invalidateOnRefresh: true,
            onToggle: (self) => { layer.style.willChange = self.isActive ? 'transform' : 'auto' },
          },
        },
      ))
    })
    return () => {
      tweens.forEach((tween) => {
        tween.scrollTrigger?.kill()
        tween.kill()
      })
      layers.forEach((layer) => {
        layer.style.willChange = ''
        gsap.set(layer, { clearProps: 'transform' })
      })
    }
  }, root)

  return () => {
    media.revert()
    layers.forEach((layer) => { layer.style.willChange = '' })
  }
}
