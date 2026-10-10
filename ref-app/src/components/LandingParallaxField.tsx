import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../app/MotionProvider'
import { useGSAP } from '../motion/gsap'
import { mountLandingParallax } from '../motion/ambientParallax'
import { deferredImagePlaceholder, observeNearViewportImages } from '../motion/nearViewportImages'

type ArtName = 'ridge' | 'bank-right' | 'waterline'
type Depth = 'far' | 'mid' | 'near'

const artSizes: Record<ArtName, { mobile: number; wide: number; height: number }> = {
  ridge: { mobile: 960, wide: 1920, height: 640 },
  'bank-right': { mobile: 720, wide: 1200, height: 400 },
  waterline: { mobile: 960, wide: 1920, height: 640 },
}

const plates: Array<{ art: ArtName; depth: Depth; position: string }> = [
  { art: 'ridge', depth: 'far', position: 'opening' },
  { art: 'waterline', depth: 'mid', position: 'upper' },
  { art: 'bank-right', depth: 'near', position: 'middle' },
  { art: 'ridge', depth: 'far', position: 'lower' },
  { art: 'waterline', depth: 'mid', position: 'closing' },
]

/** One unbroken landscape behind the landing's Work-to-About journey. */
export function LandingParallaxField() {
  const root = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useGSAP(() => {
    if (!root.current) return
    return mountLandingParallax(root.current, reduced)
  }, { scope: root, dependencies: [reduced], revertOnUpdate: true })

  useEffect(() => {
    const element = root.current
    if (!element) return
    let stopImages: (() => void) | undefined
    const start = () => {
      if (stopImages) return
      stopImages = observeNearViewportImages(element)
    }
    if (window.scrollY > 0) start()
    else window.addEventListener('scroll', start, { once: true, passive: true })
    return () => {
      window.removeEventListener('scroll', start)
      stopImages?.()
    }
  }, [])

  return (
    <div ref={root} aria-hidden="true" data-landing-parallax className="landing-parallax">
      {plates.map(({ art, depth, position }) => {
        const size = artSizes[art]
        const base = `/ambient/v1/${art}`
        return (
          <div key={position} data-parallax-plate className={`landing-parallax__plate landing-parallax__plate--${position}`}>
            <picture data-deferred-image data-parallax-layer={depth} className={`landing-parallax__art landing-parallax__art--${art}`}>
              <source type="image/avif" data-srcset={`${base}-mobile.avif ${size.mobile}w, ${base}-wide.avif ${size.wide}w`} data-sizes="100vw" />
              <source type="image/webp" data-srcset={`${base}-mobile.webp ${size.mobile}w, ${base}-wide.webp ${size.wide}w`} data-sizes="100vw" />
              <img data-src={`${base}-mobile.webp`} src={deferredImagePlaceholder()} data-srcset={`${base}-mobile.webp ${size.mobile}w, ${base}-wide.webp ${size.wide}w`} data-sizes="100vw" width={size.mobile} height={size.height * (size.mobile / size.wide)} alt="" loading="lazy" decoding="async" fetchPriority="low" />
            </picture>
          </div>
        )
      })}
    </div>
  )
}
