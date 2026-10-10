import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../app/MotionProvider'
import { useGSAP } from '../motion/gsap'
import { mountAmbientParallax } from '../motion/ambientParallax'
import { deferredImagePlaceholder, observeNearViewportImages } from '../motion/nearViewportImages'

type ArtName = 'ridge' | 'bank-right' | 'waterline'
export type AmbientScenePreset = 'project-story' | 'about-grove' | 'footer-waterline'

const sceneArt: Record<AmbientScenePreset, ArtName[]> = {
  'project-story': ['ridge', 'bank-right'],
  'about-grove': ['bank-right'],
  'footer-waterline': ['waterline'],
}

const artSizes: Record<ArtName, { mobile: number; wide: number; height: number }> = {
  ridge: { mobile: 960, wide: 1920, height: 640 },
  'bank-right': { mobile: 720, wide: 1200, height: 400 },
  waterline: { mobile: 960, wide: 1920, height: 640 },
}

export function AmbientScene({ preset }: { preset: AmbientScenePreset }) {
  const root = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  useGSAP(() => {
    const element = root.current
    if (!element) return
    return mountAmbientParallax(element, reduced)
  }, { scope: root, dependencies: [reduced], revertOnUpdate: true })

  useEffect(() => {
    const element = root.current
    if (!element) return
    return observeNearViewportImages(element)
  }, [])

  return (
    <div ref={root} aria-hidden="true" data-ambient-scene={preset} className={`ambient-scene ambient-scene--${preset}`}>
      {sceneArt[preset].map((name, index) => {
        const size = artSizes[name]
        const base = `/ambient/v1/${name}`
        return (
          <picture key={name} data-deferred-image data-ambient-layer={index === 0 ? 'far' : 'near'} className={`ambient-scene__layer ambient-scene__layer--${name}`}>
            <source
              type="image/avif"
              data-srcset={`${base}-mobile.avif ${size.mobile}w, ${base}-wide.avif ${size.wide}w`}
              data-sizes="100vw"
            />
            <source
              type="image/webp"
              data-srcset={`${base}-mobile.webp ${size.mobile}w, ${base}-wide.webp ${size.wide}w`}
              data-sizes="100vw"
            />
            <img
              src={deferredImagePlaceholder()}
              data-src={`${base}-mobile.webp`}
              data-srcset={`${base}-mobile.webp ${size.mobile}w, ${base}-wide.webp ${size.wide}w`}
              data-sizes="100vw"
              width={size.mobile}
              height={size.height * (size.mobile / size.wide)}
              alt=""
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          </picture>
        )
      })}
    </div>
  )
}
