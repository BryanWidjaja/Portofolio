import { useEffect, useRef, useState } from 'react'
import { Head } from 'vite-react-ssg'
import { useReducedMotion } from '../app/MotionProvider'

type ProjectVideoProps = {
  /** e.g. "/projects/malware-detection" -- files are `${base}/loop.mp4` etc. */
  base: string
  alt: string
  className?: string
}

// 51-round5-plan.md §E2, 45-ink-approved.md R5b: the malware-detection
// project's trailer, muted-loop-first. A poster-only `<img>` is the LCP
// (preloaded below via vite-react-ssg's per-route <Head>, same mechanism
// Seo.tsx uses); the silent loop only starts once an IntersectionObserver
// confirms the mount is on screen, and only when the visitor hasn't asked
// for less motion or less data. The full cut (with its music-bed audio --
// measured 2 silence events in 116s, so no captions/transcript) loads only
// on an explicit "Watch the trailer" click.
//
// Presentation -- superseded twice since R5b:
// 55-projectpage-plan.md §E7 A dropped the padded paper mount: this
// component now renders one `size-full` tile that fills whatever cell
// its caller (ProjectCollage.tsx's `[data-collage-hero]`) gives it, no
// margin of its own.
// The orchestrator's item-3 follow-up then overrode §E7 A's
// `object-cover` for this component specifically: the trailer's own
// closing numbers (98.85% -> 87.02%) crop badly in a square-ish cell, so
// the video/poster use `object-contain` instead, and the tile's own
// background is the video's ground colour -- `#071218`, sampled directly
// from the master at t=13/57/111s (identical at all three) -- so the
// `object-contain` letterbox bars are seamless and the cell still reads
// as one filled rectangle rather than a video floating on paper. This is
// a one-off arbitrary value, not a new theme token: it belongs to this
// one asset, not the palette. The video itself is still never
// graded/filtered -- a luma-invert grade was tested and rejected by the
// owner (it falsifies the data's real colours). The ink hairline
// (`rgb(60 40 15 / 0.14)`, styles/base.css:222) that used to sit on the
// mount now belongs to the cell -- see ProjectCollage.tsx's `cell` class,
// so the tile still gets exactly one hairline, never two. `tone="dark"`
// on the tile is E4's tone-registry hook.
export function ProjectVideo({ base, alt, className = '' }: ProjectVideoProps) {
  const reducedMotion = useReducedMotion()
  const [saveData, setSaveData] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [showTrailer, setShowTrailer] = useState(false)
  const mountRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) setSaveData(true)
  }, [])

  const showPosterOnly = reducedMotion || saveData

  useEffect(() => {
    if (showPosterOnly || showTrailer) return
    const mount = mountRef.current
    if (!mount) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setPlaying(entry.isIntersecting)
      },
      { threshold: 0.35 },
    )
    observer.observe(mount)
    return () => observer.disconnect()
  }, [showPosterOnly, showTrailer])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) video.play().catch(() => {})
    else video.pause()
  }, [playing])

  const posterAvif = `${base}/poster.avif`
  const posterWebp = `${base}/poster.webp`

  return (
    // No paper mount (55 §E7 A): this tile fills the caller's cell
    // exactly. `#071218` is the video's own ground colour (see the
    // file-header comment) so `object-contain`'s letterbox bars vanish
    // into the tile instead of showing as a paper gap.
    <div
      ref={mountRef}
      data-tone="dark"
      className={`relative isolate overflow-hidden bg-[#071218] ${className}`.trim()}
    >
      <Head>
        {/* This project page's LCP: the poster, preloaded and never JS-gated. */}
        <link rel="preload" as="image" href={posterAvif} type="image/avif" fetchPriority="high" />
      </Head>

      {showTrailer ? (
        <video
          className="size-full object-contain"
          controls
          autoPlay
          playsInline
          poster={posterAvif}
          preload="none"
          aria-label={alt}
        >
          <source src={`${base}/trailer.mp4`} type="video/mp4" />
        </video>
      ) : showPosterOnly ? (
        <picture>
          <source srcSet={posterAvif} type="image/avif" />
          <img src={posterWebp} alt={alt} className="size-full object-contain" />
        </picture>
      ) : (
        <video
          ref={videoRef}
          className="size-full object-contain"
          muted
          playsInline
          loop
          preload="none"
          poster={posterAvif}
          aria-label={alt}
          data-loop-video
          // Reduced motion and Save-Data never render this branch at all
          // (showPosterOnly above), so no `autoplay` attribute -- and no
          // loop element -- ever ships to those visitors. See the check-
          // transitions assertion this implies, in check-transitions.mjs.
        >
          <source src={`${base}/loop.webm`} type="video/webm" />
          <source src={`${base}/loop.mp4`} type="video/mp4" />
        </video>
      )}

      {!showTrailer ? (
        <button
          type="button"
          className="absolute bottom-3 right-3 rounded-full bg-ink px-4 py-2 text-small text-background"
          onClick={() => setShowTrailer(true)}
        >
          Watch the trailer
        </button>
      ) : null}
    </div>
  )
}
