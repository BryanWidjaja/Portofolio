import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Plus } from '@phosphor-icons/react'
import type { Img } from '../content/projects'
import { useReducedMotion } from '../app/MotionProvider'
import { useLenisControls } from '../app/LenisProvider'

type ProjectLightboxProps = {
  /** Flat, ordered list -- ProjectCollage.tsx builds this from its own
   * hero (image case only -- E2's video hero is never a lightbox target)
   * and tiles, in the same order those render in the grid. */
  photos: Img[]
  /** Index into `photos` currently shown. Owned by the parent so a
   * prev/next/thumbnail click can move it without this component knowing
   * how that state is stored. */
  index: number
  onIndexChange: (index: number) => void
  /** Called once the close animation (if any) has finished -- the parent
   * unmounts this component in response, it never unmounts itself. */
  onClose: () => void
}

// One symmetric duration/ease for both directions, matching MenuOverlay.tsx's
// own choice of a single `EASE.unroll` for its panel's open *and* close
// tween -- `--ease-unroll` ("menu, accordion", styles/theme.css) is this
// site's vocabulary for "a paper surface arriving/leaving the screen",
// which is exactly what this dialog is. Kept as a literal ms figure (not a
// motion/tokens.ts import) since this is a plain CSS transition, not a
// GSAP tween, and motion/tokens.ts is owned by a different agent this round.
const FADE_MS = 300

// 51-round5-plan.md §E6, 45-ink-approved.md R5k: the collage lightbox. Only
// the *behaviour* of KoBo-ID/KoBo's PhotoHeroMosaic reference is adopted
// (open-on-click, prev/next, a "Photo n of N" counter, a thumbnail strip,
// backdrop-click/Escape/close-button to dismiss) -- never its visual
// idiom. This dialog is paper (`bg-background`), square-cornered
// (`rounded-none` throughout, no exceptions), edged with the same ink
// hairline value ProjectVideo.tsx/`.scroll-sheet` already use
// (`rgb(60 40 15 / 0.14)`, styles/base.css:204), and never uses
// `backdrop-filter`, a dark scrim, rounded corners or a spring/back/elastic
// ease -- all banned by the quality bar and explicitly declined by the
// owner for this feature (R5k).
//
// No carousel library, no GSAP: plain React state plus one CSS
// `transition-opacity` for the dialog's own open/close, and an instant
// (untransitioned) `src` swap between photos -- the leanest thing that
// still reads as "arriving"/"leaving" rather than a hard cut, inside the
// round's ~1.48kB gzip headroom.
export function ProjectLightbox({ photos, index, onIndexChange, onClose }: ProjectLightboxProps) {
  const reduced = useReducedMotion()
  const lenis = useLenisControls()
  const [visible, setVisible] = useState(reduced)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const closeTimerRef = useRef<number | undefined>(undefined)

  const total = photos.length
  const current = photos[index]

  // Scroll lock: the same hold-counted Lenis stop/start MenuProvider.tsx
  // already uses for the menu (app/LenisProvider.tsx's `useLenisControls`),
  // not a new `overflow: hidden` mechanism. Paired 1:1 with this
  // component's own mount/unmount, so it composes correctly if a page
  // transition is holding scroll too.
  useEffect(() => {
    lenis.stop()
    return () => lenis.start()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mount: capture the element to return focus to on close (the trigger
  // button already called .focus() on itself synchronously before setting
  // the open index, so this is reliable across browsers), then move focus
  // into the dialog. Reduced motion skips straight to the end state and
  // never calls requestAnimationFrame.
  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    if (reduced) {
      setVisible(true)
      return
    }
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced])

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

  function requestClose() {
    if (reduced) {
      onClose()
      returnFocusRef.current?.focus()
      return
    }
    setVisible(false)
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      onClose()
      returnFocusRef.current?.focus()
    }, FADE_MS)
  }

  function showPrev() {
    onIndexChange((index - 1 + total) % total)
  }

  function showNext() {
    onIndexChange((index + 1) % total)
  }

  // Focus trap + Escape + arrow-key navigation -- same shape as
  // MenuOverlay.tsx's own Tab/Escape handler (13-build-plan.md
  // §Architecture: "focus trap is [the overlay's] own job"), extended with
  // the left/right navigation this dialog needs. Re-subscribed on every
  // index change only so the closures below always see the current index;
  // the listener itself is cheap to remove/add.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
        return
      }
      if (total > 1 && e.key === 'ArrowLeft') {
        e.preventDefault()
        showPrev()
        return
      }
      if (total > 1 && e.key === 'ArrowRight') {
        e.preventDefault()
        showNext()
        return
      }
      if (e.key !== 'Tab') return
      const root = rootRef.current
      if (!root) return
      const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])')).filter(
        (el) => el.offsetParent !== null,
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total])

  if (!current) return null

  // The lightbox stage reuses each `Img.src` untouched (already the
  // project's -1600.webp master, most likely already in the browser cache
  // from the collage grid itself) -- the thumbnail strip derives the
  // lighter -960 variant `scripts/project-images.mjs` already emits
  // alongside it, rather than asking for a new asset pass.
  const thumbSrc = (src: string) => src.replace('-1600.webp', '-960.webp')

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${total}: ${current.alt}`}
      data-lightbox
      onClick={requestClose}
      className={`fixed inset-0 z-lightbox flex flex-col bg-background transition-opacity duration-[300ms] ease-unroll motion-reduce:transition-none ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Stops the backdrop's own onClick (which closes the dialog) from
          firing for clicks anywhere inside the actual dialog content. */}
      <div onClick={(e) => e.stopPropagation()} className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 p-4 md:p-6">
          <p data-lightbox-counter className="label text-ink-muted tabular-nums">
            {`Photo ${index + 1} of ${total}`}
          </p>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            data-cursor="stick"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-ink text-ink"
          >
            <Plus aria-hidden="true" weight="bold" className="size-4 rotate-45" />
          </button>
        </div>

        <div className="relative flex flex-1 items-center justify-center px-4 md:px-16">
          {total > 1 ? (
            <button
              type="button"
              onClick={showPrev}
              aria-label="Previous photo"
              data-cursor="stick"
              className="absolute left-2 z-10 grid size-11 shrink-0 place-items-center rounded-full border border-ink text-ink md:left-6"
            >
              <ArrowRight aria-hidden="true" weight="bold" className="size-5 rotate-180" />
            </button>
          ) : null}

          <figure className="isolate max-h-[65svh] max-w-full overflow-hidden rounded-none shadow-[0_0_0_1px_rgb(60_40_15/0.14)] md:max-h-[70svh]">
            <img
              src={current.src}
              alt={current.alt}
              className="max-h-[65svh] max-w-full object-contain md:max-h-[70svh]"
            />
          </figure>

          {total > 1 ? (
            <button
              type="button"
              onClick={showNext}
              aria-label="Next photo"
              data-cursor="stick"
              className="absolute right-2 z-10 grid size-11 shrink-0 place-items-center rounded-full border border-ink text-ink md:right-6"
            >
              <ArrowRight aria-hidden="true" weight="bold" className="size-5" />
            </button>
          ) : null}
        </div>

        {total > 1 ? (
          <div className="flex justify-center gap-3 overflow-x-auto p-4 md:p-6">
            {photos.map((photo, i) => (
              <button
                key={photo.src}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`Photo ${i + 1} of ${total}`}
                aria-current={i === index ? 'true' : undefined}
                data-cursor="stick"
                className={`size-14 shrink-0 overflow-hidden rounded-none border md:size-16 ${
                  i === index ? 'border-ink' : 'border-transparent opacity-50'
                }`}
              >
                <img src={thumbSrc(photo.src)} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
