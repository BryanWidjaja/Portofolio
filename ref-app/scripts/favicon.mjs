#!/usr/bin/env node
/**
 * scripts/favicon.mjs
 *
 * 45-ink-approved.md §Owner feedback item 4 (supersedes 44-ink-build-plan.md
 * §Assets V24's 朱砂 seal square): the plain `BW` monogram, ink on paper --
 * no cinnabar, no stone, no wear filter. The glyph-outline code (trace
 * `B`/`W` into SVG paths with opentype.js) is the part scripts/seal.mjs
 * shared before that script was deleted with the seal; this is now the
 * only place it lives.
 *
 * 46-polish-plan.md §Fonts / 45 §Polish round decision 1: re-pointed from
 * Alegreya Bold to Cormorant 700 (the shipped display bold). opentype.js
 * can't parse woff2 (no brotli support), so this reads the plain .woff
 * Fontsource also publishes, straight out of node_modules instead of the
 * old gstatic fetch+cache -- the font is already an installed dependency,
 * so there is nothing left to fetch or cache.
 *
 * Usage: node scripts/favicon.mjs
 * Outputs: public/favicon.svg (<=2kB), public/favicon-32.png, public/favicon-180.png
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import opentype from 'opentype.js'
import sharp from 'sharp'

const FONT_PATH = path.resolve('node_modules/@fontsource/cormorant/files/cormorant-latin-700-normal.woff')
const OUT_SVG = path.resolve('public/favicon.svg')
const OUT_32 = path.resolve('public/favicon-32.png')
const OUT_180 = path.resolve('public/favicon-180.png')

const INK = '#141a1e'
const PAPER = '#f2ecde'
const BOX = 100
const GLYPH_MARGIN = 6 // gap kept clear around each glyph, all 4 sides
const HALF_H = BOX / 2 // each character's register, top or bottom half
const GLYPH_BOX_W = BOX - GLYPH_MARGIN * 2
const GLYPH_BOX_H = HALF_H - GLYPH_MARGIN * 2

/** Independent width/height budgets, not a single shared square -- height
 * is the primary constraint so `B` and `W` land on the same optical
 * cap-height, unless that would overflow the width budget, in which case
 * width binds instead. */
function glyphPathIn(font, char, cx, cy, boxW, boxH) {
  const glyph = font.charToGlyph(char)
  const unscaledPath = glyph.getPath(0, 0, 1000)
  const bbox = unscaledPath.getBoundingBox()
  const w = bbox.x2 - bbox.x1
  const h = bbox.y2 - bbox.y1
  const scale = Math.min(boxH / h, boxW / w)
  const x = cx - ((bbox.x1 + bbox.x2) / 2) * scale
  // `unscaledPath` already flipped font-space Y into path-space Y, so this
  // re-centres with a minus, same as `x` -- a `+` here clipped `B` off the
  // top of the mark.
  const y = cy - ((bbox.y1 + bbox.y2) / 2) * scale
  return glyph.getPath(x, y, 1000 * scale).toPathData(0)
}

function buildSvg(font) {
  const topCy = HALF_H / 2
  const bottomCy = HALF_H + HALF_H / 2
  const bPath = glyphPathIn(font, 'B', BOX / 2, topCy, GLYPH_BOX_W, GLYPH_BOX_H)
  const wPath = glyphPathIn(font, 'W', BOX / 2, bottomCy, GLYPH_BOX_W, GLYPH_BOX_H)

  // 45 §Owner feedback item 4: ink on paper, not a cinnabar seal -- the
  // paper square is still rounded (rx unchanged) so the mark reads as one
  // tile at 16px, but the fill/glyph colours are now the plain background
  // and ink tokens instead of the stone/cutout pair.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">` +
    `<rect width="${BOX}" height="${BOX}" rx="6" fill="${PAPER}"/>` +
    `<path d="${bPath}" fill="${INK}"/>` +
    `<path d="${wPath}" fill="${INK}"/>` +
    `</svg>\n`
  )
}

async function main() {
  const fontBuf = await readFile(FONT_PATH)
  const font = opentype.parse(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength))

  const svg = buildSvg(font)
  const bytes = Buffer.byteLength(svg, 'utf-8')
  if (bytes > 2048) {
    console.warn(`[favicon] warning: favicon.svg is ${bytes}B, over the 2kB budget`)
  }

  await mkdir(path.dirname(OUT_SVG), { recursive: true })
  await writeFile(OUT_SVG, svg)

  const svgBuf = Buffer.from(svg)
  await writeFile(OUT_32, await sharp(svgBuf).resize(32, 32).png().toBuffer())
  await writeFile(OUT_180, await sharp(svgBuf).resize(180, 180).png().toBuffer())

  console.log(`[favicon] wrote ${OUT_SVG} (${bytes}B), ${OUT_32}, ${OUT_180}`)
}

main().catch((err) => {
  console.error('[favicon] failed:', err)
  process.exit(1)
})
