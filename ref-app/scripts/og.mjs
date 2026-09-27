#!/usr/bin/env node
/**
 * scripts/og.mjs
 *
 * Renders public/og/default.png -- the 1200x630 card every route's
 * <Seo/> (src/components/Seo.tsx) points `og:image`/`twitter:image` at,
 * via `site.ogImage` (src/content/site.ts).
 *
 * 41-ink-replace-map.md V23, 45-ink-approved.md §Owner feedback item 4: the
 * old card (Geist + Source Serif 4, a lime rule, "+ seal on paper") is
 * replaced with a hero crop dissolving into paper, the name in the display
 * face and the plain `BW` monogram -- no seal, no cinnabar (cinnabar is the
 * focus ring's only job now). Fonts and the crop are base64-embedded so the
 * render never depends on a network fetch; the crop is made once with
 * sharp from the same 1920w master and object-position (66% 0) as the real
 * hero (components/Hero.tsx), so the card reads as the same painting.
 *
 * 46-polish-plan.md §Fonts / 45 §Polish round decision 1: re-pointed from
 * Alegreya/Alegreya Sans to Cormorant/Public Sans. Cormorant only ships an
 * italic at weight 400, so the monogram line (previously italic 600) is
 * set at the weight that actually exists instead of requesting one that
 * would just get matched back down to it.
 *
 * Usage: node scripts/og.mjs
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { chromium } from 'playwright'
import { site } from '../src/content/site.ts'

const MAX_BYTES = 300_000

const WIDTH = 1200
const HEIGHT = 630
const ART_HEIGHT = 390
const OUT_PATH = path.resolve('public/og/default.png')

async function fileDataUri(relPath, mime) {
  const buf = await readFile(path.resolve(relPath))
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** Same crop framing as the real hero's `<img>` (object-fit: cover,
 * object-position: 66% 0), taken from the 1920w master so the card shows
 * the same painting without shipping the full 3840 master into a
 * build-time PNG. */
async function heroCropDataUri() {
  const src = path.resolve('public/hero/hero-1920.webp')
  const buf = await sharp(src)
    .resize(WIDTH, ART_HEIGHT, { fit: 'cover', position: 'right top' })
    .png()
    .toBuffer()
  return `data:image/png;base64,${buf.toString('base64')}`
}

function renderHtml({ cormorantBold, cormorantItalic, publicSans, paper, heroCrop, monogram, name, tagline }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Cormorant';
    font-weight: 700;
    src: url('${cormorantBold}') format('woff2');
  }
  @font-face {
    font-family: 'Cormorant';
    font-style: italic;
    font-weight: 400;
    src: url('${cormorantItalic}') format('woff2');
  }
  @font-face {
    font-family: 'Public Sans';
    font-weight: 400;
    src: url('${publicSans}') format('woff2');
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: url('${paper}') 0 0/512px, #f2ecde;
    font-family: 'Public Sans', Arial, sans-serif;
  }
  .card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .art {
    position: relative;
    width: 100%;
    height: ${ART_HEIGHT}px;
    overflow: hidden;
    background: url('${paper}') 0 0/512px, #f2ecde;
  }
  .art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    mix-blend-mode: multiply;
    -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent 96%);
    mask-image: linear-gradient(to bottom, #000 55%, transparent 96%);
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 8px 64px 44px;
  }
  .mono {
    font-family: 'Cormorant', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-variant-caps: all-small-caps;
    font-size: 26px;
    color: #566068;
    margin-bottom: 10px;
  }
  .name {
    font-family: 'Cormorant', Georgia, serif;
    font-weight: 700;
    font-size: 84px;
    line-height: 0.98;
    letter-spacing: -0.01em;
    color: #141a1e;
  }
  .tagline {
    margin-top: 18px;
    max-width: 760px;
    font-size: 26px;
    line-height: 1.35;
    color: #434b52;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="art"><img src="${heroCrop}" alt="" /></div>
    <div class="text">
      <div class="mono">${monogram}</div>
      <div class="name">${name}</div>
      <div class="tagline">${tagline}</div>
    </div>
  </div>
</body>
</html>`
}

async function main() {
  const [cormorantBold, cormorantItalic, publicSans, paper, heroCrop] = await Promise.all([
    fileDataUri('public/fonts/cormorant-latin-700-normal.woff2', 'font/woff2'),
    fileDataUri('public/fonts/cormorant-latin-400-italic.woff2', 'font/woff2'),
    fileDataUri('public/fonts/public-sans-latin-400-normal.woff2', 'font/woff2'),
    fileDataUri('public/ink/paper.webp', 'image/webp'),
    heroCropDataUri(),
  ])

  const html = renderHtml({
    cormorantBold,
    cormorantItalic,
    publicSans,
    paper,
    heroCrop,
    monogram: site.monogram,
    name: site.home.heroName.join(' '),
    // G9 (46 item 9): home.heroDescription is gone from content/site.ts (the
    // hero no longer renders it) -- the meta description is the closest
    // remaining one-sentence summary, so the OG card reuses that instead.
    tagline: site.meta.home.description,
  })

  await mkdir(path.dirname(OUT_PATH), { recursive: true })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready
    })
    const raw = await page.screenshot()
    // Playwright's raw PNG (full 24-bit colour) lands well over the 300kB
    // budget (44 §Exec tasks E6 accept) on a card this size -- the card is
    // mostly flat paper and type, so an indexed palette loses nothing
    // visible while cutting the file to roughly a third.
    const optimised = await sharp(raw).png({ palette: true, effort: 10 }).toBuffer()
    await writeFile(OUT_PATH, optimised)
    const { size } = await stat(OUT_PATH)
    if (size > MAX_BYTES) {
      console.warn(`[og] warning: default.png is ${(size / 1000).toFixed(1)}kB, over the 300kB budget`)
    }
    console.log(`[og] saved ${path.relative(process.cwd(), OUT_PATH)} (${(size / 1000).toFixed(1)}kB)`)
  } finally {
    await browser.close()
  }
}

main()
