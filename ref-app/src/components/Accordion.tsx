import { useState } from 'react'
import { Icon } from './Icon'
import { BrushLine } from './BrushLine'

export type AccordionItem = { id: string; title: string; body: string }

type AccordionProps = {
  items: AccordionItem[]
  defaultOpenId?: string
}

// M16/V28 (41-ink-replace-map.md), rendered only in the `accordion` About
// variant (D3). Rows are split by brush lines (42 §Components) instead of
// a flat border, and a pale wash bleeds in from the left on hover/focus
// (`.ink-wash` grows a disc from the pointer's entry point, which doesn't
// read as a "from the left" sweep, so this row keeps its own plain scaleX
// span instead -- already flat and unmasked exactly as R6a made `.ink-wash`
// itself, just a different growth shape for a different reason). The panel
// unrolls .45s
// (42 §Storyboards "panel unrolls .45", the same duration open or closed);
// `motion-reduce:transition-none` makes it instant, per the reduced-motion
// gate (bar §F) the unguarded transition used to miss. Plus/Minus crossfade
// .2s instead of a single icon rotating. Exactly one row is open at a time
// (opening a row closes the others first) - clicking the open row is a
// no-op rather than collapsing to none, since nothing in the plan
// describes an all-closed state. Closed panels stay in the prerendered DOM
// and go `inert` so their text leaves the tab order and AT tree without
// being removed from the markup.
export function Accordion({ items, defaultOpenId }: AccordionProps) {
  const [openId, setOpenId] = useState(defaultOpenId ?? items[0]?.id)

  return (
    <ul className="relative mt-10 md:mt-0 md:col-start-5 md:col-span-8">
      <BrushLine variant={items.length} className="absolute inset-x-0 bottom-0" />
      {items.map((item, index) => {
        const isOpen = item.id === openId
        const panelId = `what-i-do-panel-${item.id}`
        const triggerId = `what-i-do-trigger-${item.id}`

        return (
          <li key={item.id} className="relative">
            <BrushLine variant={index} className="absolute inset-x-0 top-0" />
            <h3>
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenId(item.id)}
                className="group relative isolate flex w-full items-center justify-between gap-6 py-6 text-left text-title font-display font-medium transition-transform duration-[300ms] ease-dry active:scale-[0.99] md:py-8"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 origin-left scale-x-0 bg-line transition-transform duration-[180ms] ease-dry pointer-fine:group-hover:scale-x-100 pointer-fine:group-hover:duration-[300ms] group-focus-visible:scale-x-100 group-focus-visible:duration-[300ms] motion-reduce:transition-none"
                />
                <span>{item.title}</span>
                <span
                  aria-hidden="true"
                  className={`relative grid size-11 shrink-0 place-items-center rounded-full border border-ink transition-[background-color,color] duration-[300ms] ease-dry group-active:scale-95 ${
                    isOpen ? 'bg-ink text-background' : ''
                  }`}
                >
                  <Icon
                    name="Plus"
                    weight="bold"
                    className={`col-start-1 row-start-1 size-5 transition-opacity duration-[200ms] ease-dry motion-reduce:transition-none ${isOpen ? 'opacity-0' : 'opacity-100'}`}
                  />
                  <Icon
                    name="Minus"
                    weight="bold"
                    className={`col-start-1 row-start-1 size-5 transition-opacity duration-[200ms] ease-dry motion-reduce:transition-none ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                  />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              inert={!isOpen}
              // F1 (45 §Owner feedback item 2, "animating anything that
              // triggers layout... per frame"): `grid-template-rows` is a
              // real reflow every tick — there's no compositor-only way to
              // animate an auto height at all. `contain:layout` doesn't
              // remove that cost, but it scopes the reflow to this panel
              // instead of letting it walk back up to ancestors that don't
              // actually depend on this row's size.
              className="grid [contain:layout] transition-[grid-template-rows] duration-[450ms] ease-unroll motion-reduce:transition-none"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="max-w-[52ch] pb-6 text-body text-ink-muted md:pb-8">{item.body}</p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
