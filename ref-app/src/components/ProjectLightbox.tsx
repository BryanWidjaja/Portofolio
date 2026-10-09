import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr/ArrowRight'
import { Plus } from '@phosphor-icons/react/dist/ssr/Plus'
import type { Img } from '../content/projects'
import { useReducedMotion } from '../app/MotionProvider'
import { useLenisControls } from '../app/LenisProvider'
import { ProjectImage } from './ProjectImage'

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
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([])
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

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    const scrollY = window.scrollY
    const previousScrollData = document.body.getAttribute('data-lightbox-scroll-y')
    const previousBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }
    const changed: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = []
    let branch: HTMLElement = root
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue
        changed.push({ element: sibling, inert: sibling.inert, ariaHidden: sibling.getAttribute('aria-hidden') })
        sibling.inert = true
        sibling.setAttribute('aria-hidden', 'true')
      }
      branch = branch.parentElement
      if (branch === document.body) break
    }

    document.documentElement.setAttribute('data-lightbox-open', '')
    document.body.dataset.lightboxScrollY = String(scrollY)
    Object.assign(document.body.style, {
      position: 'fixed',
      top: `${-scrollY}px`,
      left: '0',
      right: '0',
      width: '100%',
      overflow: 'hidden',
    })

    return () => {
      for (const { element, inert, ariaHidden } of changed) {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      }
      document.documentElement.removeAttribute('data-lightbox-open')
      Object.assign(document.body.style, previousBodyStyle)
      if (previousScrollData === null) delete document.body.dataset.lightboxScrollY
      else document.body.setAttribute('data-lightbox-scroll-y', previousScrollData)
      window.scrollTo(0, scrollY)
      returnFocusRef.current?.focus()
    }
  }, [])

  // Mount: capture the element to return focus to on close (the trigger
  // button already called .focus() on itself synchronously before setting
  // the open index, so this is reliable across browsers), then move focus
  // into the dialog. Reduced motion skips straight to the end state and
  // never calls requestAnimationFrame.
  useEffect(() => {
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

  useEffect(() => {
    thumbnailRefs.current[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [index])

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
  const thumbSrc = (src: string) => src.replace(/-\d+\.(?:avif|webp)$/, '-320.webp')

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
      <div onClick={(e) => e.stopPropagation()} className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-2 md:px-6 md:py-3">
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

        <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 md:gap-4 md:px-6">
          {total > 1 ? (
            <button
              type="button"
              onClick={showPrev}
              aria-label="Previous photo"
              data-cursor="stick"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-ink text-ink"
            >
              <ArrowRight aria-hidden="true" weight="bold" className="size-5 rotate-180" />
            </button>
          ) : null}

          <figure className="isolate flex size-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-none">
            <ProjectImage
              img={current}
              sizes="(max-width: 600px) calc(100vw - 7rem), calc(100vw - 12rem)"
              loading="eager"
              className="max-h-full max-w-full object-contain shadow-[0_0_0_1px_rgb(60_40_15/0.14)]"
            />
          </figure>

          {total > 1 ? (
            <button
              type="button"
              onClick={showNext}
              aria-label="Next photo"
              data-cursor="stick"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-ink text-ink"
            >
              <ArrowRight aria-hidden="true" weight="bold" className="size-5" />
            </button>
          ) : null}
        </div>

        {total > 1 ? (
          <div
            data-lightbox-thumbnails
            data-lenis-prevent
            aria-label="Photo thumbnails"
            tabIndex={0}
            className="flex shrink-0 justify-start gap-2 overflow-x-auto px-4 py-2 md:gap-3 md:px-6 md:py-3"
          >
            {photos.map((photo, i) => (
              <button
                key={photo.src}
                ref={(element) => {
                  thumbnailRefs.current[i] = element
                }}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`Photo ${i + 1} of ${total}`}
                aria-current={i === index ? 'true' : undefined}
                data-cursor="stick"
                className={`size-14 shrink-0 overflow-hidden rounded-none border md:size-16 ${
                  i === index ? 'border-ink' : 'border-transparent opacity-50'
                }`}
              >
                <ProjectImage
                  img={{ ...photo, src: thumbSrc(photo.src), width: Math.min(photo.width, 320), height: Math.round((photo.height / photo.width) * Math.min(photo.width, 320)) }}
                  sizes="64px"
                  alt=""
                  className="size-full object-contain"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
