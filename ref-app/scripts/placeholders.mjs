#!/usr/bin/env node
/**
 * scripts/placeholders.mjs
 *
 * Rasterises the "replace me" stand-ins for every image the owner still has
 * to supply. Each one is a plain paper frame with a square in the middle
 * saying, in words, what real image belongs in that slot -- the content
 * pass (2026-09-28, owner: "for undocumented / no photos on the repo, use
 * a square with a text inside telling me what to replace with") replaced
 * the round-3 colour-chart grids, which said nothing about what goes there.
 * Every current project now has real images (scripts/project-images.mjs),
 * so only the portrait still uses a box; PROJECTS below is where a future
 * project without images goes until it has some.
 *
 * The square is sized to survive every crop the site applies with
 * `object-fit: cover`: a cover is 16:10 but shows as 4:5 on phones (the
 * central half of its width) and as a ~2.3:1 band in the home page's lead
 * card (the central ~70% of its height), so its square sits inside the
 * region both of those keep. Gallery and portrait frames already match
 * their containers' aspect, so their squares are just centred.
 *
 * Text is set as outlined paths straight from the site's own shipped faces
 * (Cormorant 600 heading, Public Sans 400/500 body and label, read with
 * opentype.js the same way scripts/favicon.mjs does), not as SVG <text>:
 * librsvg has no webfont access, so <text> would fall back to whatever
 * system serif the build machine has.
 *
 * Each project's square is tinted with its own light OKLCH wash so the
 * brush reveal (src/ink/brush.ts) still visibly paints *something* on
 * hover; the baked grey counterpart BrushReveal's overlay <img> uses
 * (R4-4, `-grey` files) is the same SVG through sharp's `.grayscale()`.
 *
 * Outputs (SVG master + AVIF/WebP at two widths, colour + grey):
 *   public/placeholders/<slug>/{cover,gallery-1,gallery-2}.svg
 *   public/placeholders/<slug>/{cover,gallery-1,gallery-2}-{960,1600}[-grey].{avif,webp}
 *   public/placeholders/portrait.svg, portrait-{640,1200}.{avif,webp}
 *
 * To swap in a real image: drop it in over the matching `-960`/`-1600`
 * files (and the `-grey` ones -- sharp's `.grayscale()` makes those), or
 * point the entry's `src` in src/content/projects.ts / about.ts somewhere
 * else that has the same `-grey` sibling.
 *
 * Usage: node scripts/placeholders.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import opentype from 'opentype.js'
import sharp from 'sharp'

const ROOT = path.resolve('public/placeholders')
const PROJECT_WIDTHS = [960, 1600]
const PORTRAIT_WIDTHS = [640, 1200]

const PAPER = '#F2ECDE' // --color-background (theme.css)
const INK = '#141A1E' // --color-ink (theme.css), same fill favicon.mjs uses
const INK_MUTED = '#434B52' // --color-ink-muted (theme.css)

const FONTS = {
  heading: opentype.loadSync(path.resolve('node_modules/@fontsource/cormorant/files/cormorant-latin-600-normal.woff')),
  body: opentype.loadSync(path.resolve('node_modules/@fontsource/public-sans/files/public-sans-latin-400-normal.woff')),
  label: opentype.loadSync(path.resolve('node_modules/@fontsource/public-sans/files/public-sans-latin-500-normal.woff')),
}

const SIZES = {
  cover: { width: 1600, height: 1000, square: 600 },
  'gallery-1': { width: 1200, height: 900, square: 640 },
  'gallery-2': { width: 900, height: 1200, square: 640 },
  portrait: { width: 800, height: 1000, square: 600 },
}

// What each project slot should become, in words the owner can act on:
// `body` is the instruction, `footer` names the slot and its shape. Empty
// while every project has real images (scripts/project-images.mjs); a new
// project without any gets an entry here until it does, e.g.
//   'my-project': {
//     hue: 230,
//     cover: { body: 'A screenshot of …', footer: 'Cover · 16:10 · keep the subject centred' },
//     'gallery-1': { body: '…', footer: 'Gallery 1 · 4:3 landscape' },
//     'gallery-2': { body: '…', footer: 'Gallery 2 · 3:4 portrait' },
//   },
const PROJECTS = {}

const PORTRAIT = {
  hue: null,
  body: 'A portrait photo of you. It is shown in greyscale on the About page.',
  footer: 'Portrait · 4:5',
}

// ---------------------------------------------------------------------
// OKLCH -> sRGB (Björn Ottosson's reference matrices), for the square's
// light per-project wash.
// ---------------------------------------------------------------------
function oklchToHex(L, C, hueDeg) {
  const h = (hueDeg * Math.PI) / 180
  const a = Math.cos(h) * C
  const b = Math.sin(h) * C
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const toSrgb = (c) => {
    const x = Math.min(1, Math.max(0, c))
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  }
  return '#' + lin.map((c) => Math.round(toSrgb(c) * 255).toString(16).padStart(2, '0')).join('')
}

/** Greedy word wrap against the font's real advance widths. */
function wrap(font, text, size, maxWidth) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (line && font.getAdvanceWidth(candidate, size) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** One line of text as an outlined <path>, left-aligned at (x, baseline). */
function textPath(font, text, x, baseline, size, fill) {
  return `<path d="${font.getPath(text, x, baseline, size).toPathData(1)}" fill="${fill}" />`
}

function buildBoxSvg({ width, height, square }, { body, footer }, hue) {
  const x0 = (width - square) / 2
  const y0 = (height - square) / 2
  const pad = square * 0.09
  const inner = square - pad * 2
  const tx = x0 + pad

  const headingSize = square * 0.085
  const bodySize = square * 0.046
  const labelSize = square * 0.032

  const parts = []
  let y = y0 + pad + headingSize * 0.8
  parts.push(textPath(FONTS.heading, 'Replace with', tx, y, headingSize, INK))
  y += headingSize * 0.55
  for (const line of wrap(FONTS.body, body, bodySize, inner)) {
    y += bodySize * 1.45
    parts.push(textPath(FONTS.body, line, tx, y, bodySize, INK))
  }
  // Footer pinned to the square's own bottom edge.
  const footerY = y0 + square - pad
  parts.push(textPath(FONTS.label, footer.toUpperCase(), tx, footerY, labelSize, INK_MUTED))

  const fill = hue === null ? '#E7E0D0' : oklchToHex(0.9, 0.05, hue)
  const stroke = square * 0.006
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-hidden="true">`,
    `  <rect width="${width}" height="${height}" fill="${PAPER}" />`,
    `  <rect x="${x0}" y="${y0}" width="${square}" height="${square}" fill="${fill}" stroke="${INK}" stroke-width="${stroke.toFixed(1)}" stroke-dasharray="${(stroke * 4).toFixed(1)} ${(stroke * 3).toFixed(1)}" />`,
    ...parts.map((p) => `  ${p}`),
    `</svg>`,
    '',
  ].join('\n')
}

async function renderRaster(svgText, nativeW, targetWidth, outBase, { grey = false } = {}) {
  // Render at a density matched to the target width so the outlined text
  // stays crisp at both sizes (sharp/librsvg rasterises before any resize).
  const density = 72 * (targetWidth / nativeW)
  let pipeline = sharp(Buffer.from(svgText), { density })
  if (grey) pipeline = pipeline.grayscale()
  await Promise.all([
    pipeline.clone().webp({ quality: 82, effort: 6 }).toFile(`${outBase}.webp`),
    pipeline.clone().avif({ quality: 50, effort: 6 }).toFile(`${outBase}.avif`),
  ])
}

async function processProject(slug) {
  const cfg = PROJECTS[slug]
  const dir = path.join(ROOT, slug)
  await mkdir(dir, { recursive: true })
  for (const name of ['cover', 'gallery-1', 'gallery-2']) {
    const size = SIZES[name]
    const svg = buildBoxSvg(size, cfg[name], cfg.hue)
    await writeFile(path.join(dir, `${name}.svg`), svg)
    for (const targetWidth of PROJECT_WIDTHS) {
      await renderRaster(svg, size.width, targetWidth, path.join(dir, `${name}-${targetWidth}`))
      await renderRaster(svg, size.width, targetWidth, path.join(dir, `${name}-${targetWidth}-grey`), { grey: true })
    }
  }
}

async function processPortrait() {
  const size = SIZES.portrait
  const svg = buildBoxSvg(size, PORTRAIT, PORTRAIT.hue)
  await writeFile(path.join(ROOT, 'portrait.svg'), svg)
  for (const targetWidth of PORTRAIT_WIDTHS) {
    await renderRaster(svg, size.width, targetWidth, path.join(ROOT, `portrait-${targetWidth}`))
  }
}

async function main() {
  for (const slug of Object.keys(PROJECTS)) await processProject(slug)
  await processPortrait()
  console.log('[placeholders] wrote replace-me stand-ins ->', ROOT)
}

main().catch((err) => {
  console.error('[placeholders] failed:', err)
  process.exit(1)
})
