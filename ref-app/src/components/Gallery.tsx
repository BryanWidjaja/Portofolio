import { BrushReveal } from './BrushReveal'
import type { Img } from '../content/projects'

type GalleryProps = {
  items: Img[]
}

// 11-layout.md §Project detail: a landscape image (4:3, 7 cols) paired with
// a portrait one (3:4, 5 cols), in content order; <md the portrait sits
// `w-4/5 ml-auto`. M9/M15 (41-ink-replace-map.md): the media brushes to
// colour on hover/focus (components/BrushReveal.tsx), and the caption is
// always visible, only changing colour (重->焦, .2s dry) -- no y motion,
// and never hover-only information (bar §D).
export function Gallery({ items }: GalleryProps) {
  return (
    <div className="flex flex-col gap-10 md:grid md:grid-cols-12 md:items-end md:gap-x-6 xl:gap-x-8">
      {items.map((item, index) => {
        const isLandscape = index === 0

        return (
          <figure
            key={item.src}
            className={isLandscape ? 'group md:col-span-7' : 'group ml-auto w-4/5 md:col-span-5 md:ml-0 md:w-auto'}
          >
            <div className={`isolate overflow-hidden rounded-none ${isLandscape ? 'aspect-[4/3]' : 'aspect-[3/4]'}`}>
              <BrushReveal src={item.src} alt={item.alt} width={item.width} height={item.height} />
            </div>
            {item.caption ? (
              <figcaption className="mt-3 text-body text-ink-subtle transition-colors duration-[200ms] ease-dry group-hover:text-ink group-focus-within:text-ink motion-reduce:transition-none">
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        )
      })}
    </div>
  )
}
