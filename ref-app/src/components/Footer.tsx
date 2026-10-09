import { useRef } from 'react'
import { Container } from './Container'
import { Eyebrow } from './Eyebrow'
import { EmailCopy } from './EmailCopy'
import { ArrowLink } from './ArrowLink'
import { UnderlineLink } from './UnderlineLink'
import { BrushLine } from './BrushLine'
import { BrushWords } from './BrushWords'
import { useGSAP } from '../motion/gsap'
import { createScrollReveals } from '../motion/reveal'
import { useReducedMotion } from '../app/MotionProvider'
import { site } from '../content/site'
import { AmbientScene } from './AmbientScene'

// V21 (41-ink-replace-map.md): a brush-line top edge instead of `border-t`
// (13-build-plan §Conflicts still applies: M4 needs a component that can
// draw itself in, which a CSS border can't do on its own — BrushLine owns
// that now). The footer is persistent (rendered once by RootLayout, never
// remounted by navigation), so its reveal batch is created once on mount,
// independent of any page's pageEnter (flow 8). The seal that used to sit
// beside the copyright line is gone (45 §Owner feedback item 4) — the
// line closes the page on its own now.
//
// 50-ink-review.md finding 3: this used to be a flat `bg-background` with
// no grain (std-dev 0.000 vs ~0.6 elsewhere), the one large surface on
// every route guaranteed to fill a paused frame. `ink-paper` (styles/base.css)
// is the same opaque-surface pattern MenuOverlay already uses -- same tile,
// same 0,0 origin as `body`, so the grain doesn't seam at the footer's edge.
export function Footer() {
  const footerRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()

  useGSAP(() => createScrollReveals(footerRef.current!, reduced), { scope: footerRef, dependencies: [reduced] })

  return (
    <footer id="contact" data-footer ref={footerRef} className="relative isolate ink-paper">
      <AmbientScene preset="footer-waterline" />
      <BrushLine className="absolute inset-x-0 top-0" />
      <Container className="py-16 md:py-20">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-12 md:items-start md:gap-x-8">
          <div data-footer-contact className="col-span-2 md:col-span-8">
          <Eyebrow data-reveal="label">{site.footer.eyebrow}</Eyebrow>
          <BrushWords
            as="h2"
            text={site.footer.heading}
            data-reveal="heading"
            tabIndex={-1}
            className="mt-3 text-display text-balance lg:max-w-[75%]"
          />
          <div data-reveal="text" className="mt-10 flex flex-col gap-3 md:mt-16 xl:flex-row xl:items-baseline xl:gap-10">
            <EmailCopy email={site.email} size="lg" />
            <ArrowLink href={`mailto:${site.email}`} size="md">
              {site.footer.openMailLabel}
            </ArrowLink>
          </div>
          <p className="mt-4 text-body text-ink-muted">{site.footer.availability}</p>
          </div>

          <div data-footer-pages data-reveal="text" className="md:col-span-2 md:col-start-9">
            <p className="label text-ink-muted">{site.footer.pagesLabel}</p>
            <ul className="mt-3">
              {site.footer.pageLinks.map((link) => (
                <li key={link.href}>
                  <UnderlineLink to={link.href} className="inline-block py-2.5 text-body">
                    {link.label}
                  </UnderlineLink>
                </li>
              ))}
            </ul>
          </div>
          <div data-footer-social data-reveal="text" className="md:col-span-2">
            <p className="label text-ink-muted">{site.footer.socialLabel}</p>
            <ul className="mt-3">
              {site.socials.map((social) => (
                <li key={social.href}>
                  <ArrowLink href={social.href} external size="sm" className="inline-block py-2.5">
                    {social.label}
                  </ArrowLink>
                </li>
              ))}
            </ul>
          </div>
          {/* R3-1 (47 §R1 item 7): the colophon line is gone -- copyright
             keeps its own row-2 slot (explicit `md:row-start-2` now that
             there's no sibling to anchor the row) so removing it doesn't
             leave a dangling empty row or shift the footer's rhythm. */}
          <p className="col-span-2 text-small tabular-nums text-ink-subtle md:col-span-12 md:mt-6">
            {site.footer.copyright}
          </p>
        </div>
      </Container>
    </footer>
  )
}
