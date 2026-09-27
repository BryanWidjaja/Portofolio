import { Seo } from '../components/Seo'
import { Container } from '../components/Container'
import { BrushWords } from '../components/BrushWords'
import { BrushLine } from '../components/BrushLine'
import { Eyebrow } from '../components/Eyebrow'
import { PillButton } from '../components/PillButton'
import { Page } from '../motion/Page'
import { site } from '../content/site'

// V22 (41-ink-replace-map.md): "blank leaf" — one brush-line stroke, then
// the title, then the text/pill, so a page that otherwise has nothing on
// it still reads as one composed moment (bar §E). The title/text/pill
// beats reuse Page's own M2/M3 timing (title first, intro items +100ms
// after). The seal that used to stamp last here is gone (45 §Owner
// feedback item 4).
export function NotFound() {
  return (
    <>
      <Seo title={site.meta.notFound.title} description={site.meta.notFound.description} path="/404" noindex />
      <Page>
        <Container as="section" className="flex min-h-[85svh] flex-col justify-end pb-leaf">
          <BrushLine variant={0} className="mb-10 w-[60%] md:mb-16" />
          <Eyebrow data-intro="meta">{site.notFound.eyebrow}</Eyebrow>
          <BrushWords
            as="h1"
            text={site.notFound.heading}
            className="mt-3 text-display font-display font-bold text-balance md:w-10/12"
          />
          <p data-intro className="mt-6 text-lead text-balance md:w-1/2">
            {site.notFound.body}
          </p>
          <div className="mt-breath">
            <PillButton to="/" icon="arrow-right" data-intro="meta">
              {site.notFound.pill}
            </PillButton>
          </div>
        </Container>
      </Page>
    </>
  )
}
