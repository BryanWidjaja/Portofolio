#!/usr/bin/env node
/**
 * scripts/hero.mjs
 *
 * 45-ink-approved.md §G2 approved + §Hero rounds, 42-ink-direction.md §Hero,
 * 44-ink-build-plan.md §Assets: turns the approved master
 * (notes/plan/ink-hero/in/hero-r3.png, 5504x3072) into the hero's delivery
 * set. One pass over the full-resolution pixel buffer does three things at
 * once (44 §Assets "level paper to #FFF, denoise the paper, gate the
 * zones"):
 *   1. Crops the master's extra ~43px of width off the RIGHT edge (the
 *      dense mass), never the left void where the name sits, so the aspect
 *      goes from 1.792 to the target 16:9 (1.778) exactly.
 *   2. Measures the four 42 §Hero luminance zones (OKLab L) and the
 *      saturated-pixel fraction (OKLCH C) at full resolution, printing
 *      PASS/FAIL against the three gated zones. On a failure this script
 *      reports it and exits non-zero -- it never moves the gates or
 *      re-crops to force a pass (orchestrator note, 2026-09-23).
 *   3. Levels any pixel at or above 94% OKLab L to pure white (ramped in
 *      from 90% so there's no hard edge), which both flattens the paper and
 *      erases the master's own grain there -- once the delivered image
 *      shows the paper texture, only one grain shows, not the AI paper
 *      texture stacked on ours.
 *
 * 46-polish-plan.md item 3(a)/owner decision 5: each derivative used to
 * gain its paper grain live, in the browser, via `mix-blend-mode: multiply`
 * against a CSS background tile (components/Hero.tsx) -- diagnosis measured
 * that blend costing ~180ms of compositor Commit per route change (a
 * blended element can't be composited on its own layer, so every frame
 * anywhere in its stacking context re-commits the whole blended area). This
 * script now bakes the identical grain into the delivered pixels instead:
 * public/ink/paper.webp is flattened onto the same background color it
 * sits on in body's own CSS background (styles/base.css), then composited
 * with a multiply blend and tiled across each resized derivative, in that
 * derivative's own pixel grid. Hero.tsx no longer sets any blend mode or
 * background of its own.
 *
 * `47` R3-3 (2026-09-25): the tile is now baked at 1024x1024 device px so
 * `background-size: 512px` stays crisp through DPR 2 (styles/base.css) --
 * but the tile fed into THIS composite is downsampled back to 512x512
 * first. Reasoning: the hero derivatives are static raster images with no
 * DPR of their own, tiled at their *native* pixel grid; the body's CSS
 * tile, at a typical DPR-1 display, is what the browser itself downsamples
 * 1024->512 to. Compositing the full 1024 tile directly into the hero
 * would repeat the grain every 1024 native px instead of 512, halving its
 * apparent frequency right at the dissolve seam versus the page below it.
 * Downsampling here first reproduces the same DPR-1 appearance the page
 * uses, so the two sides of the seam tile at the same frequency (measured
 * via an autocorrelation pass over a 1440-wide screenshot straddling the
 * seam -- R1's report has the numbers).
 *
 * Outputs (44 §Assets):
 *   public/hero/hero-{1280,1920,2560,3840}.{avif,webp}      16:9 desktop
 *   public/hero/hero-m-{720,1080,1296}.{avif,webp}          9:16 mobile crop
 *
 * Usage: node scripts/hero.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const MASTER = path.resolve('../notes/plan/ink-hero/in/hero-r3.png')
const OUT_DIR = path.resolve('public/hero')
const PAPER_TILE = path.resolve('public/ink/paper.webp')
// styles/theme.css --color-background: the solid layer paper.webp's own
// alpha channel sits on in body's own CSS background (styles/base.css) --
// flattening onto it here reproduces the same opaque grain the old
// mix-blend-multiply saw live in the browser (46 item 3a).
const PAPER_BACKDROP = '#f2ecde'

const DESKTOP_WIDTHS = [1280, 1920, 2560, 3840]
const MOBILE_WIDTHS = [720, 1080, 1296] // 9:16, height = width * 16/9

// 44 §Assets budget table (kB).
const DESKTOP_BUDGET_KB = { 1280: 90, 1920: 160, 2560: 250, 3840: 400 }
const MOBILE_BUDGET_KB = { 720: 70, 1080: 130, 1296: 170 }
const WEBP_MULTIPLIER = 1.4

// 42 §Hero "Luminance gates": zone box in image-fraction coordinates, plus
// the mean-L gate each one is measured against. `bottomQuarter` has no gate
// of its own (42 only lists nav/name/description) but is printed alongside
// them for parity with the orchestrator's own G2 measurement.
const ZONES = [
  { key: 'nav', label: 'nav band', x0: 0, x1: 1, y0: 0, y1: 0.1, gate: 0.85 },
  { key: 'name', label: 'name zone', x0: 0.04, x1: 0.46, y0: 0.18, y1: 0.62, gate: 0.8 },
  { key: 'description', label: 'description zone', x0: 0.6, x1: 0.94, y0: 0.8, y1: 0.94, gate: 0.9 },
  { key: 'bottomQuarter', label: 'bottom quarter', x0: 0, x1: 1, y0: 0.75, y1: 1, gate: null },
]
const SATURATION_THRESHOLD = 0.08 // OKLCH C above which a pixel counts as "saturated"
const LEVEL_START = 0.9 // OKLab L where whitening starts ramping in
const LEVEL_END = 0.94 // OKLab L at/above which a pixel is forced pure white

function srgbToLinear(c8) {
  const c = c8 / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Björn Ottosson's OKLab conversion. Returns [L, C] (OKLCH lightness and chroma) for one sRGB pixel. */
function oklch(r8, g8, b8) {
  const r = srgbToLinear(r8)
  const g = srgbToLinear(g8)
  const b = srgbToLinear(b8)
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return [L, Math.sqrt(a * a + bb * bb)]
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Loads the master and crops the extra width off the right edge (45 §G2 approved). */
async function loadCroppedMaster() {
  const base = sharp(MASTER)
  const meta = await base.metadata()
  const targetWidth = Math.round(meta.height * (16 / 9))
  const cropWidth = Math.min(targetWidth, meta.width)
  const { data, info } = await base
    .extract({ left: 0, top: 0, width: cropWidth, height: meta.height })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: info.channels }
}

/** Single full-resolution pass: measures every zone's OKLab L (mean + min)
 * and the saturated-pixel fraction from the UNTOUCHED pixel, then levels
 * that same pixel toward white in place. Mutates `data`. */
function levelAndMeasure(data, width, height, channels) {
  const sums = ZONES.map(() => 0)
  const mins = ZONES.map(() => 1)
  const counts = ZONES.map(() => 0)
  let saturated = 0

  for (let y = 0; y < height; y++) {
    const v = y / height
    const rowZones = ZONES.map((z, i) => (v >= z.y0 && v < z.y1 ? i : -1)).filter((i) => i !== -1)
    const rowOffset = y * width * channels
    for (let x = 0; x < width; x++) {
      const i = rowOffset + x * channels
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const [L, C] = oklch(r, g, b)
      if (C > SATURATION_THRESHOLD) saturated++

      if (rowZones.length) {
        const u = x / width
        for (const zi of rowZones) {
          const z = ZONES[zi]
          if (u >= z.x0 && u < z.x1) {
            sums[zi] += L
            counts[zi]++
            if (L < mins[zi]) mins[zi] = L
          }
        }
      }

      const t = smoothstep(LEVEL_START, LEVEL_END, L)
      if (t > 0) {
        data[i] = Math.round(r + (255 - r) * t)
        data[i + 1] = Math.round(g + (255 - g) * t)
        data[i + 2] = Math.round(b + (255 - b) * t)
      }
    }
  }

  const zoneReport = ZONES.map((z, i) => {
    const mean = counts[i] ? sums[i] / counts[i] : 0
    const pass = z.gate === null ? null : mean >= z.gate
    return { ...z, mean, min: mins[i], pass }
  })
  const saturatedPct = (saturated / (width * height)) * 100
  return { zoneReport, saturatedPct }
}

function printReport({ zoneReport, saturatedPct }) {
  console.log('[hero] full-resolution zone measurements (OKLab L):')
  let allPass = true
  for (const z of zoneReport) {
    const gateText = z.gate === null ? 'informational' : `gate >= ${z.gate.toFixed(2)}`
    const verdict = z.gate === null ? '' : z.pass ? ' PASS' : ' FAIL'
    if (z.pass === false) allPass = false
    console.log(
      `[hero]   ${z.label}: mean=${z.mean.toFixed(3)} min=${z.min.toFixed(3)} (${gateText})${verdict}`,
    )
  }
  console.log(`[hero]   saturated pixels: ${saturatedPct.toFixed(2)}% (C > ${SATURATION_THRESHOLD})`)
  return allPass
}

async function writeVariant(pipeline, width, height, outBase, budgetKb, paperTile) {
  const resized = pipeline.clone().resize(width, height, { fit: 'cover' })
  const grained = resized.composite([{ input: paperTile, tile: true, blend: 'multiply' }])
  const [avif, webp] = await Promise.all([
    grained.clone().avif({ quality: 52, effort: 6 }).toBuffer(),
    grained.clone().webp({ quality: 78, effort: 6 }).toBuffer(),
  ])
  await Promise.all([writeFile(`${outBase}.avif`, avif), writeFile(`${outBase}.webp`, webp)])

  const avifKb = avif.length / 1000
  const webpKb = webp.length / 1000
  const avifOk = avifKb <= budgetKb
  const webpOk = webpKb <= budgetKb * WEBP_MULTIPLIER
  console.log(
    `[hero]   ${path.basename(outBase)}: avif ${avifKb.toFixed(1)}kB (<=${budgetKb}) ${avifOk ? 'PASS' : 'FAIL'}` +
      ` · webp ${webpKb.toFixed(1)}kB (<=${(budgetKb * WEBP_MULTIPLIER).toFixed(0)}) ${webpOk ? 'PASS' : 'FAIL'}`,
  )
  return avifOk && webpOk
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const { data, width, height, channels } = await loadCroppedMaster()
  console.log(`[hero] master cropped to ${width}x${height} (aspect ${(width / height).toFixed(4)})`)

  // Downsample 1024 -> 512 first (see the doc comment above): matches the
  // DPR-1 frequency the page's own CSS tile renders at, so the hero's baked
  // grain doesn't repeat at half the page's frequency across the seam.
  const paperTile = await sharp(PAPER_TILE).resize(512, 512).flatten({ background: PAPER_BACKDROP }).toBuffer()

  const measurement = levelAndMeasure(data, width, height, channels)
  const gatesPass = printReport(measurement)

  const leveled = sharp(data, { raw: { width, height, channels } })
  let sizesOk = true

  console.log('[hero] desktop 16:9 derivatives:')
  for (const w of DESKTOP_WIDTHS) {
    const h = Math.round((w * 9) / 16)
    const ok = await writeVariant(leveled, w, h, path.join(OUT_DIR, `hero-${w}`), DESKTOP_BUDGET_KB[w], paperTile)
    sizesOk = sizesOk && ok
  }

  // Mobile 9:16 art-directed crop (42 §Hero "Mobile 9:16"): full height, a
  // width slice starting at the same x=50% boundary as the quiet zone, wide
  // enough for an exact 9:16 crop -- keeps a peak, the waterfall, the pool
  // and the dissolve, per the approved master's composition.
  const cropWidth = Math.round((height * 9) / 16)
  const cropLeft = Math.min(Math.round(width * 0.5), width - cropWidth)
  const mobileMaster = leveled.clone().extract({ left: cropLeft, top: 0, width: cropWidth, height })
  console.log(`[hero] mobile 9:16 crop at x${cropLeft}-${cropLeft + cropWidth} (${cropWidth}x${height}):`)
  for (const w of MOBILE_WIDTHS) {
    const h = Math.round((w * 16) / 9)
    const ok = await writeVariant(mobileMaster, w, h, path.join(OUT_DIR, `hero-m-${w}`), MOBILE_BUDGET_KB[w], paperTile)
    sizesOk = sizesOk && ok
  }

  console.log(`[hero] wrote desktop + mobile derivatives -> ${OUT_DIR}`)

  if (!gatesPass) {
    console.error('[hero] a luminance gate failed at full resolution -- see zone report above. Not re-cropping or moving text to force a pass; report this.')
  }
  if (!sizesOk) {
    console.error('[hero] a derivative is over its 44 §Assets budget -- see sizes above.')
  }
  if (!gatesPass || !sizesOk) process.exit(1)
}

main().catch((err) => {
  console.error('[hero] failed:', err)
  process.exit(1)
})
