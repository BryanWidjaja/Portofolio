import { useState } from 'react'

type ProjectVideoProps = {
  base: string
  alt: string
  className?: string
}

/** An archived trailer. Its video source is absent until an explicit click. */
export function ProjectVideo({ base, alt, className = '' }: ProjectVideoProps) {
  const [activated, setActivated] = useState(false)
  const posterAvif = `${base}/poster.avif`

  return (
    <div
      data-secondary-video
      data-tone="dark"
      className={`relative isolate overflow-hidden bg-[#071218] shadow-[0_0_0_1px_rgb(60_40_15/0.14)] ${className}`.trim()}
    >
      {activated ? (
        <video className="size-full object-contain" controls autoPlay playsInline poster={posterAvif} aria-label={alt}>
          <source src={`${base}/trailer.mp4`} type="video/mp4" />
        </video>
      ) : (
        <>
          <picture>
            <source srcSet={posterAvif} type="image/avif" />
            <img
              src={`${base}/poster.webp`}
              alt={alt}
              width="1280"
              height="720"
              loading="lazy"
              className="size-full object-contain"
            />
          </picture>
          <button
            type="button"
            className="absolute bottom-3 right-3 rounded-full bg-ink px-4 py-2 text-small text-background"
            onClick={() => setActivated(true)}
          >
            Watch the earlier trailer
          </button>
        </>
      )}
    </div>
  )
}
