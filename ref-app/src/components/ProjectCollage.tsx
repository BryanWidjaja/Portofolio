import { useState, type MouseEvent } from 'react'
import type { Img } from '../content/projects'
import { ProjectVideo } from './ProjectVideo'
import { ProjectLightbox } from './ProjectLightbox'

type ProjectCollageProps = {
  /** The hero tile. Either a cover image, or (malware-detection only) E2's <ProjectVideo>. */
  hero: { kind: 'image'; img: Img } | { kind: 'video'; base: string; alt: string }
  /**
   * The collage's remaining tiles (52 §Item 4's "2x2"). Any count works by
   * construction (see the layout note below) -- five real images per
   * project is the target, fewer only when 51 §E3's capture genuinely
   * could not be produced.
   */
  tiles: Img[]
}

// 58-round6-plan.md §F3, 45-ink-approved.md R6e/R6f (superseding
// 55-projectpage-plan.md §E7 A's `grid-cols-4`/`aspect-[12/5]` grid,
// whose outer ratio still had to be picked by eye and still cropped the
// malware video against its own aspect). Columns are now the owner's
// exact **5 : 1.5 : 1.5** (`grid-cols-[5fr_1.5fr_1.5fr]` at md+, hero
// `col-span-1 row-span-2`), and the grid carries **no aspect ratio of its
// own** -- 55's diagnosis (why side-cell media must not contribute
// intrinsic height) is applied all the way through this time: the hero
// cell alone gets an explicit `aspect-ratio` (inline `style`, since it's
// the one per-project number this file needs -- `width/height` off the
// hero `Img`, or the fixed `16/9` the malware trailer's assets actually
// are), and every side-tile's `<img>` is `absolute inset-0` so it adds
// zero intrinsic size to its track. With `md:grid-rows-2` (Tailwind's own
// `repeat(2, minmax(0, 1fr))`) and nothing else sizing the rows, the
// browser's grid-with-aspect-ratio
// sizing algorithm (well supported cross-browser; this is the same
// technique CSS-Tricks documents for "aspect-ratio-driven" grid tracks)
// derives both row heights from the hero alone, so **the hero is never
// cropped** and the two side rows split that height exactly in half. On
// phones the same inline aspect-ratio sizes the hero (no fixed
// `aspect-[4/3]` -- that's only the 2x2 tiles below it now), because
// there's no row-span to drive there; it's simply the full-width block's
// own height.
//
// Tile span is set explicitly per count so every count still tiles the
// 2x2 with no gaps -- unchanged from 55 §E7 A's reasoning, just now
// inside a 3-column grid instead of a 4-column one: with the hero
// occupying column 1 across both rows, the two remaining columns (2 and
// 3, the 1.5fr tracks) are exactly the "right-hand 2x2" the spec means,
// and plain CSS auto-placement fills them in reading order with no
// column index ever named:
//   4 tiles -> each stays 1x1, filling the 2x2 beside/below the hero.
//   3 tiles -> the first is `col-span-2` (fills row 1 of the 2x2 alone),
//              the other two default to 1x1 and share row 2.
//   2 tiles -> `md:col-span-2` each (one full-width row of the 2x2).
// `col-span-2` still reads correctly at both breakpoints with no `md:`
// prefix needed for the 3-tile case: "full width" in the phone
// `grid-cols-2` block, "both 1.5fr tracks" in the md+ grid.
//
// R6f, the album-stack overflow: with more than four tiles (i.e. more
// than five photos once the hero is one), only the first three tiles
// render normally and the fourth -- the last cell the 2x2 actually has
// room for -- becomes the overflow tile: it still shows its own real
// photo (still the lightbox trigger for that exact index), but under a
// light paper veil reading "+N", N being how many further tiles never
// get a cell at all (`tiles.length - 4`). `photos` below stays the
// *full* list regardless -- every tile the project has, in order -- so
// the lightbox's prev/next still reaches every photo; only the grid's
// own cell count is capped at four. Two paper leaves peek out from
// behind the tile via `box-shadow` (never a pseudo-element layered over
// the photo) in `--color-sheet` with the same hairline colour every tile
// hairline already uses -- painted on the *wrapping* cell, not the
// cropped button inside it, because an element's own `overflow-hidden`
// clips its own outer box-shadow too, leaves included.
//
// Every cell (`min-h-0 min-w-0 overflow-hidden`) sizes its media with
// `size-full` -- an image tile crops with `object-cover`; the video hero
// is the one exception (ProjectVideo.tsx, 55's item-3 follow-up:
// `object-contain` against its own sampled ground colour, since this
// trailer's own numbers crop badly square -- now moot in practice, since
// the hero cell's own aspect is fixed at that same video's `16/9`, but
// kept as ProjectVideo.tsx's own safety net). Every cell carries the
// same per-tile ink hairline `.scroll-sheet` already uses
// (`rgb(60 40 15 / 0.14)`, styles/base.css:222) -- one box-shadow per
// cell, not a border, so `overflow-hidden` on the same element still
// paints it (proven already by `.scroll-art`, base.css:217-223, which
// pairs the two the same way).
//
// E2's <ProjectVideo> hero (malware-detection only) is mounted with no
// wrapping paper margin -- it fills the `[data-collage-hero]` cell
// exactly like an image tile would. ProjectVideo.tsx owns its own crop
// mode/ground colour.
//
// 51-round5-plan.md §E6, 45-ink-approved.md R5k (owner, mid-round): every
// image tile -- the hero when it's a cover image, and every 2x2 tile --
// is also a lightbox trigger. E2's <ProjectVideo> hero is never wrapped:
// only images open the lightbox. `photos` is the flat, ordered list
// ProjectLightbox.tsx navigates (hero image first when there is one, then
// every tile, matching reading order, overflow or not), so an index into
// it always means the same photo, whether or not that tile ever got a
// cell in the grid.
//
// Focus-return on close is ProjectLightbox's own job (it captures
// `document.activeElement` on mount): each trigger below calls
// `e.currentTarget.focus()` itself before opening, which is what makes
// that capture reliable rather than a second ref bookkept here.
export function ProjectCollage({ hero, tiles }: ProjectCollageProps) {
  const photos = hero.kind === 'image' ? [hero.img, ...tiles] : tiles
  const heroOffset = hero.kind === 'image' ? 1 : 0
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  // R6f: only four side cells physically exist (the right-hand 2x2), so
  // any tile past the fourth never gets a cell at all -- it only ever
  // reaches the visitor through the lightbox's prev/next, off the full
  // `photos` list above. `overflowCount` is the one bit of arithmetic
  // this file needs (58 §F3's JS-budget carve-out, alongside the hero's
  // aspect-ratio value below): how many tiles that fourth cell's veil
  // must own up to.
  const visibleTiles = tiles.slice(0, 4)
  const overflowCount = tiles.length - 4

  // 55 §E7 A's per-count span logic, unchanged in shape -- still keyed
  // off the *real* tile count, not `visibleTiles.length`, since a 2- or
  // 3-tile project never reaches the four-tile cap this slices at.
  const tileSpan = (i: number) => (tiles.length === 2 ? 'md:col-span-2' : tiles.length === 3 && i === 0 ? 'col-span-2' : '')

  // Shared by every cell (hero + tiles): can shrink below its content's
  // intrinsic size, clips to its own box, and carries the one ink
  // hairline every tile gets (55 §E7 A). No `position` utility here --
  // callers add their own (`relative` for a plain grid-item cell, so its
  // absolutely positioned `<img>` has a same-size positioning parent;
  // `absolute inset-0` for the overflow tile's inner button, which needs
  // to fill its own *non-clipping* wrapper instead of being the grid item
  // itself) -- baking `relative` in here would collide with that `absolute`.
  const cell = 'min-h-0 min-w-0 overflow-hidden shadow-[0_0_0_1px_rgb(60_40_15/0.14)]'

  // R6e: the hero's own media dictates the hero cell's shape, at every
  // breakpoint -- `16/9` for the malware trailer's actual assets (see
  // ProjectVideo.tsx), otherwise the cover `Img`'s own `width`/`height`.
  // An inline style, not a Tailwind class, because it is per-project data
  // (the one other bit of logic 58 §F3 allows) -- a literal
  // `aspect-[${w}/${h}]` string can't be picked up by Tailwind's static
  // class scan, only a real style property resolves it at runtime.
  const heroAspect = hero.kind === 'video' ? '16 / 9' : `${hero.img.width} / ${hero.img.height}`

  return (
    <div
      data-collage
      className="grid grid-cols-2 gap-2 md:grid-cols-[5fr_1.5fr_1.5fr] md:grid-rows-2 lg:gap-3"
    >
      <div
        data-collage-hero
        className={`relative col-span-2 md:col-span-1 md:row-span-2 ${cell}`}
        style={{ aspectRatio: heroAspect }}
      >
        {hero.kind === 'video' ? (
          <ProjectVideo base={hero.base} alt={hero.alt} className="size-full" />
        ) : (
          <button
            type="button"
            data-collage-trigger
            data-cursor="text"
            data-cursor-text="view"
            aria-label={`Open photo 1 of ${photos.length}: ${hero.img.alt}`}
            onClick={(e) => {
              e.currentTarget.focus()
              setOpenIndex(0)
            }}
            className="block size-full appearance-none border-0 bg-transparent p-0 text-left"
          >
            <figure data-intro="cover" data-tone={hero.img.tone} className="blot-mask isolate size-full rounded-none">
              <img
                src={hero.img.src}
                alt={hero.img.alt}
                width={hero.img.width}
                height={hero.img.height}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="size-full object-cover"
              />
            </figure>
          </button>
        )}
      </div>

      {visibleTiles.map((tile, i) => {
        const photoIndex = heroOffset + i
        // R6f: the fourth cell (the only one an overflow can ever reach --
        // `visibleTiles` never holds more than four) carries the "+N" veil
        // and the two paper leaves instead of rendering plainly.
        const isOverflow = overflowCount > 0 && i === visibleTiles.length - 1

        const figure = (
          <figure data-collage-tile data-tone={tile.tone} className="isolate size-full rounded-none">
            <img
              src={tile.src}
              alt={tile.alt}
              width={tile.width}
              height={tile.height}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
            {isOverflow ? (
              // The veil sits *over* the photo (a real element, never a
              // pseudo-element -- that ban is only for the leaves below,
              // which must stay clear of the cropped photo entirely).
              <div
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: 'var(--color-sheet)', opacity: 0.82 }}
              >
                <span className="font-display text-title font-medium text-ink">{`+${overflowCount}`}</span>
              </div>
            ) : null}
          </figure>
        )

        const ariaLabel = isOverflow
          ? `Open photo ${photoIndex + 1} of ${photos.length}, ${overflowCount} more: ${tile.alt}`
          : `Open photo ${photoIndex + 1} of ${photos.length}: ${tile.alt}`

        const onOpen = (e: MouseEvent<HTMLButtonElement>) => {
          e.currentTarget.focus()
          setOpenIndex(photoIndex)
        }

        if (!isOverflow) {
          return (
            <button
              key={tile.src}
              type="button"
              data-collage-trigger
              data-cursor="text"
              data-cursor-text="view"
              aria-label={ariaLabel}
              onClick={onOpen}
              className={`relative block appearance-none border-0 bg-transparent p-0 text-left aspect-[4/3] md:aspect-auto ${cell} ${tileSpan(i)}`.trim()}
            >
              {figure}
            </button>
          )
        }

        // The leaves live on this outer, non-clipping wrapper -- the
        // *same* element that owns the grid placement (span/aspect) --
        // because the inner button's own `overflow-hidden` (needed to
        // crop the photo) would clip its own outer box-shadow too, and
        // the leaves are exactly that: box-shadow painted outside the
        // tile's own box.
        return (
          <div
            key={tile.src}
            className={`relative aspect-[4/3] md:aspect-auto ${tileSpan(i)}`.trim()}
            style={{
              boxShadow: [
                '5px 5px 0 0 var(--color-sheet)',
                '5px 5px 0 1px rgb(60 40 15 / 0.16)',
                '10px 10px 0 0 var(--color-sheet)',
                '10px 10px 0 1px rgb(60 40 15 / 0.16)',
              ].join(', '),
            }}
          >
            <button
              type="button"
              data-collage-trigger
              data-collage-overflow
              data-cursor="text"
              data-cursor-text="view"
              aria-label={ariaLabel}
              onClick={onOpen}
              className={`absolute inset-0 block appearance-none border-0 bg-transparent p-0 text-left ${cell}`}
            >
              {figure}
            </button>
          </div>
        )
      })}

      {openIndex !== null ? (
        <ProjectLightbox photos={photos} index={openIndex} onIndexChange={setOpenIndex} onClose={() => setOpenIndex(null)} />
      ) : null}
    </div>
  )
}
