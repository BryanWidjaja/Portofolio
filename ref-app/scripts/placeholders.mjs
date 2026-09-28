#!/usr/bin/env node
/**
 * scripts/placeholders.mjs
 *
 * 41-ink-replace-map.md R3-9, 47-round3-plan.md §R3 (item 9): rasterises
 * project placeholder SVGs into colour raster stand-ins. Round 3 replaces
 * the old "app screenshot" mock (outlined panels + one accent hex swapped
 * per project) with a **colour-chart grid**: large saturated OKLCH squares
 * in thin paper gutters, grey until the brush reveal (src/ink/brush.ts)
 * paints over them. The SVG masters stay the source of truth (re-run this
 * any time the per-project chart config below changes) and are rewritten
 * in place first, same as before.
 *
 * Each project's chart is a full evenly-spaced hue wheel (so it always
 * reads as "a colour chart", not a random scatter) starting from a
 * per-project offset and rotated by a per-project angle, so the three
 * projects' charts are visibly distinct from one another while sharing the
 * same generator. Cinnabar (D1: focus ring only) is never a chart hue.
 *
 * The portrait placeholder is untouched (47 §R3: "the portrait can stay").
 *
 * R4-4 (41-ink-replace-map.md, 49-round4-plan.md §E2): also rasterises a
 * grey counterpart of each project asset -- `components/BrushReveal.tsx`'s
 * grey overlay `<img>` now uses this baked raster instead of a CSS
 * `filter: grayscale(1)` + `mix-blend-mode: multiply` on the colour image,
 * so the grey/muted look ships as real pixel data with no blend/filter
 * left on any image layer. Same source SVG, same density/quality settings,
 * just with sharp's own `.grayscale()` in the pipeline -- the paper-toned
 * gutters (already baked into the chart SVG as a solid PAPER fill) barely
 * shift under a luma-only grayscale, so the paper tone reads the same.
 *
 * Outputs (AVIF + WebP, two widths each, colour + grey):
 *   public/placeholders/<slug>/{cover,gallery-1,gallery-2}-{960,1600}.*
 *   public/placeholders/<slug>/{cover,gallery-1,gallery-2}-{960,1600}-grey.*
 *   public/placeholders/portrait-{640,1200}.*
 *
 * Usage: node scripts/placeholders.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve('public/placeholders')

const PROJECT_ASSETS = ['cover', 'gallery-1', 'gallery-2']
const PROJECT_WIDTHS = [960, 1600]
const PORTRAIT_WIDTHS = [640, 1200]

const PAPER = '#F2ECDE' // --color-background (theme.css), the site's own paper tone

// Per-project chart identity: a starting hue (the wheel is spread evenly
// from here) and a rotation angle, so the three projects' charts read as
// distinct instances of the same idea rather than one reused pattern
// (47 §R3: "The grid rotates per project so the three differ").
const CHART = {
  tidewater: { hueOffset: 205, rotateDeg: 0 }, // starts in the blue/teal band
  'kopi-ledger': { hueOffset: 35, rotateDeg: 5 }, // starts in the amber/terracotta band
  halftone: { hueOffset: 270, rotateDeg: -6 }, // starts in the violet band
}

// ---------------------------------------------------------------------
// OKLCH -> sRGB (Björn Ottosson's reference matrices) so every chart
// square is a real hex fill librsvg can rasterise, instead of relying on
// CSS oklch() colour-function support in the SVG renderer.
// ---------------------------------------------------------------------
function oklchToHex(L, C, hueDeg) {
  const h = (hueDeg * Math.PI) / 180
  const a = Math.cos(h) * C
  const b = Math.sin(h) * C
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const toSrgb = (c) => {
    const clamped = Math.min(1, Math.max(0, c))
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  }
  const to255 = (c) => Math.round(Math.min(1, Math.max(0, toSrgb(c))) * 255)
  return '#' + [rLin, gLin, bLin].map((c) => to255(c).toString(16).padStart(2, '0')).join('')
}

// Inverse (sRGB -> OKLCH), used once below to find cinnabar's own hue so
// the chart generator can steer every project's wheel away from it.
function hexToOklch(hex) {
  const int = parseInt(hex.replace('#', ''), 16)
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const r = lin(((int >> 16) & 255) / 255)
  const g = lin(((int >> 8) & 255) / 255)
  const b = lin((int & 255) / 255)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const C = Math.sqrt(a * a + bb * bb)
  let H = (Math.atan2(bb, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { L, C, H }
}

const CINNABAR_HUE = hexToOklch('#C0392B').H // D1: reserved for the focus ring only

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

// Two L/C pairs, both inside 47's mandated OKLCH L 0.55-0.75 / C 0.13-0.20
// window, alternated across the grid so the chart has some depth without
// ever going flat-monochrome or over-saturated.
const L_STEPS = [0.6, 0.68, 0.74]
const C_STEPS = [0.14, 0.17, 0.2]

/**
 * Builds one colour-chart SVG: a paper background, then a grid of large
 * saturated squares in thin paper gutters, rotated as a whole group. Hues
 * are spread evenly around the full wheel starting at `hueOffset`; any hue
 * landing within 18deg of cinnabar's own hue is nudged clear of it.
 */
function buildChartSvg(width, height, hueOffset, rotateDeg) {
  const targetCell = 190 // CSS px, tuned so cover/gallery-1/gallery-2 all land near-square cells
  const cols = Math.max(3, Math.round(width / targetCell))
  const rows = Math.max(3, Math.round(height / targetCell))
  const cellW = width / cols
  const cellH = height / rows
  const gutter = 8 // thin paper gutter between squares
  const total = cols * rows
  const hueStep = 360 / total

  const rects = []
  let i = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let hue = (hueOffset + i * hueStep) % 360
      if (hueDistance(hue, CINNABAR_HUE) < 18) hue = (hue + 30) % 360
      const variant = (row + col) % L_STEPS.length
      const fill = oklchToHex(L_STEPS[variant], C_STEPS[variant], hue)
      const x = col * cellW + gutter / 2
      const y = row * cellH + gutter / 2
      const w = cellW - gutter
      const h = cellH - gutter
      rects.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" />`)
      i += 1
    }
  }

  // Rotating the grid about its own centre otherwise leaves paper triangles
  // showing at the canvas corners; scale the group up by just enough to
  // still fully cover the canvas after rotation, so the paper only ever
  // shows through the thin inter-square gutters, never as accidental
  // clipping at the frame edge.
  const cx = width / 2
  const cy = height / 2
  const rad = (rotateDeg * Math.PI) / 180
  const cosA = Math.abs(Math.cos(rad))
  const sinA = Math.abs(Math.sin(rad))
  const scale = Math.max(1, cosA + (height / width) * sinA, (width / height) * sinA + cosA)
  const groupTransform = `translate(${cx} ${cy}) scale(${scale.toFixed(4)}) rotate(${rotateDeg}) translate(${-cx} ${-cy})`

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">`,
    `  <rect width="${width}" height="${height}" fill="${PAPER}" />`,
    `  <g transform="${groupTransform}">`,
    ...rects.map((r) => `    ${r}`),
    `  </g>`,
    `</svg>`,
    '',
  ].join('\n')
}

function parseViewBox(svgText, fallback) {
  const match = svgText.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : fallback
}

async function renderRaster(svgText, nativeW, targetWidth, outBase, { grey = false } = {}) {
  // Render at a density matched to the target width so up- and down-scaling
  // both stay crisp (sharp/librsvg rasterises before any later resize).
  const density = 72 * (targetWidth / nativeW)
  let pipeline = sharp(Buffer.from(svgText), { density })
  // R4-4: the baked-grey variant BrushReveal's overlay <img> uses instead
  // of a CSS filter/blend on the colour image (see file header).
  if (grey) pipeline = pipeline.grayscale()
  await Promise.all([
    pipeline.clone().webp({ quality: 82, effort: 6 }).toFile(`${outBase}.webp`),
    pipeline.clone().avif({ quality: 50, effort: 6 }).toFile(`${outBase}.avif`),
  ])
}

async function processProject(slug) {
  const cfg = CHART[slug]
  for (const name of PROJECT_ASSETS) {
    const svgPath = path.join(ROOT, slug, `${name}.svg`)
    const raw = await readFile(svgPath, 'utf8')
    const { width, height } = parseViewBox(raw, { width: 1600, height: 1000 })
    const svg = buildChartSvg(width, height, cfg.hueOffset, cfg.rotateDeg)
    await writeFile(svgPath, svg)

    for (const targetWidth of PROJECT_WIDTHS) {
      await renderRaster(svg, width, targetWidth, path.join(ROOT, slug, `${name}-${targetWidth}`))
      await renderRaster(svg, width, targetWidth, path.join(ROOT, slug, `${name}-${targetWidth}-grey`), { grey: true })
    }
  }
}

async function processPortrait() {
  const svgPath = path.join(ROOT, 'portrait.svg')
  const raw = await readFile(svgPath, 'utf8')
  // Drop the removed-in-E1 font name (V3, 44-ink-build-plan.md §Dependencies)
  // -- the raster only ever fell back to Georgia (librsvg has no webfont
  // access), so this is a text-only cleanup, not a visual change.
  const cleaned = raw.replace(/'Source Serif 4', /, '')
  if (cleaned !== raw) await writeFile(svgPath, cleaned)

  const { width } = parseViewBox(cleaned, { width: 800, height: 1000 })
  for (const targetWidth of PORTRAIT_WIDTHS) {
    await renderRaster(cleaned, width, targetWidth, path.join(ROOT, `portrait-${targetWidth}`))
  }
}

async function main() {
  for (const slug of Object.keys(CHART)) await processProject(slug)
  await processPortrait()
  console.log('[placeholders] wrote colour-chart stand-ins ->', ROOT)
}

main().catch((err) => {
  console.error('[placeholders] failed:', err)
  process.exit(1)
})
