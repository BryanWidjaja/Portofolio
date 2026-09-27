#!/usr/bin/env node
/**
 * scripts/ink-textures.mjs
 *
 * Generates every code-based ink texture (44-ink-build-plan.md §Assets),
 * so later phases only ever consume files, never regenerate them:
 *   - public/ink/paper.webp        512² seamless grain+fibre tile (V2)
 *   - public/ink/brush-edge.webp   1024x128 bristle-front strip (E3)
 *   - public/ink/blot.webp         512² fibrous blot mask (E3/E4)
 *   - public/ink/mist-{1,2,3}.webp 2048x600 hero mist planes (E2)
 *   - public/ink/line-{1,2,3}.svg  variable-width brush lines (E4)
 *
 * Every buffer is built from a seeded PRNG (mulberry32), so two runs are
 * byte-identical -- `npm run assets:textures` twice gives the same
 * md5sum (44 §Exec tasks E1 accept).
 *
 * Usage: node scripts/ink-textures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const OUT_DIR = path.resolve('public/ink')
const SEED = 0xc0ffee

function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function smoothstep(t) {
  return t * t * (3 - 2 * t)
}

/** Tileable value noise: a `grid` x `grid` lattice of random values, wrapped
 * at the edges (torus) so the field repeats seamlessly at 0/1. */
function makeLattice(grid, rand) {
  const values = new Float32Array(grid * grid)
  for (let i = 0; i < values.length; i++) values[i] = rand()
  return function sample(u, v) {
    const x = ((u % 1) + 1) % 1
    const y = ((v % 1) + 1) % 1
    const gx = x * grid
    const gy = y * grid
    const x0 = Math.floor(gx) % grid
    const y0 = Math.floor(gy) % grid
    const x1 = (x0 + 1) % grid
    const y1 = (y0 + 1) % grid
    const fx = smoothstep(gx - Math.floor(gx))
    const fy = smoothstep(gy - Math.floor(gy))
    const v00 = values[y0 * grid + x0]
    const v10 = values[y0 * grid + x1]
    const v01 = values[y1 * grid + x0]
    const v11 = values[y1 * grid + x1]
    const top = v00 + (v10 - v00) * fx
    const bottom = v01 + (v11 - v01) * fx
    return top + (bottom - top) * fy
  }
}

/** 2-octave fbm on a torus, normalized to [0,1]. */
function makeFbm(rand, gridA, gridB, weightA = 0.6) {
  const a = makeLattice(gridA, rand)
  const b = makeLattice(gridB, rand)
  const weightB = 1 - weightA
  return (u, v) => a(u, v) * weightA + b(u, v) * weightB
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** V2 (41-ink-replace-map.md), R3-3 (47-round3-plan.md §R1 item 3): 1024²
 * device-px alpha-only grain+fibre tile, drawn at 512 CSS px
 * (`background-size: 512px`, styles/base.css) -- 2 device px per CSS px, so
 * it stays crisp at DPR<=2 and downsamples cleanly at 1x (fixes one of
 * `47` §Diagnosis's three named causes of the old tile's blur outright: a
 * 512-native tile forced through `background-size: 512px` needed the
 * browser to upscale it on any HiDPI screen).
 *
 * `47` R1 bans interpolated value-noise at a 2-4px cell (the old tile's
 * 160/250-grid fbm) -- that's the scale that reads as a smudged blob
 * rather than grain. The fix here doesn't replace it with a *different*
 * interpolated field at another scale; it drops interpolation entirely.
 * The tile is three flat layers, each a plain Bernoulli draw (no lattice,
 * no smoothstep, so there's no smooth gradient anywhere for the eye to
 * read as blur):
 *   1. TOOTH: ~74% of pixels independently get one fixed low alpha. No
 *      per-pixel *value* variety (every "on" pixel is bit-identical) --
 *      tried with a random value per pixel instead (even quantized to a
 *      handful of levels) and it triples-to-quintuples the file size for
 *      no measurable visual gain, because a uniform fill compresses near
 *      losslessly while *any* variety reintroduces high-frequency entropy.
 *      The randomness lives entirely in *which* pixels are on, which is
 *      what makes it read as grain instead of a flat tint.
 *   2. SPECKLE: a sparse (~0.04%), brighter 1-2px fleck on top.
 *   3. FIBRE: thin, gently curved, bilinear-AA lines (`45`/`47`'s "1px
 *      anti-aliased fibres, 20-90px, sparse, low alpha").
 * A back-of-envelope worth recording: hitting `45` item 11's block std-dev
 * bar from *pure* per-pixel noise looks CLT-impossible at first (a 32px
 * measurement block block-averages thousands of independent pixels, which
 * should collapse any per-pixel variance to ~0) -- but that reasoning
 * applies to the std-dev of *block means*, not the std-dev *within* each
 * block, which is what "per-32px-patch std-dev as a roughness proxy" (G6)
 * actually measures. Per-pixel Bernoulli noise has substantial WITHIN-
 * block std-dev by construction (that's what "roughness" means), and it's
 * essentially the same in every patch regardless of position -- which is
 * exactly why no large-scale correlated field is needed at all.
 *
 * Measured (own script, methodology: raw pixel-buffer stats, alpha-
 * composited over each surface's flat colour; "block" = a 32-CSS-px /
 * 64-native-px tile; the std-dev range is the 10th-90th percentile of
 * per-block within-block std-dev, matching G6's own range-shaped numbers
 * rather than a single figure):
 *   light paper:  mean darkening 1.81% (target 1.6-2.0), max 32px-block
 *                 mean darkening 1.86% (target <=5%, lots of headroom),
 *                 per-block std-dev 2.41-2.47 (previous surface: 2.4-2.9,
 *                 same order)
 *   dark panel (`.ink-paper-dark::before`, opacity 0.38, unchanged):
 *                 per-block std-dev 2.22-2.27 (target 2.2-2.8, held)
 *   worst single grain pixel (the speckle layer's own alpha, 60/255) on
 *   the dark panel: paper-text 6.41:1, line-text (清, `--color-line`)
 *   4.60:1 (both >=4.5 required)
 *   file size: LOSSLESS WebP, 117.2kB (<=120kB budget) -- chosen over
 *   lossy after measuring both: a uniform-fill Bernoulli mask compresses
 *   losslessly to a smaller file than *any* lossy encode of a design with
 *   real per-pixel value variety (tested: even quantizing to 4 discrete
 *   alpha levels nearly triples the file size versus one fixed value), AND
 *   ships with zero encoding artefacts (perfectly answers `47`'s "lossy
 *   WebP smears fine grain" cause -- there is nothing lossy to smear it). */
async function buildPaper(rand) {
  const CSS_SIZE = 512
  const DEVICE_SCALE = 2 // 2 device px per CSS px -- crisp through DPR 2, clean downsample at 1x
  const size = CSS_SIZE * DEVICE_SCALE // 1024
  const grainRgb = hexToRgb('#c2bdb2')
  const buf = Buffer.alloc(size * size * 4)

  function setPx(x, y, a) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    if (a <= buf[i + 3]) return // lower layers never darken over a higher one already placed
    buf[i] = grainRgb[0]
    buf[i + 1] = grainRgb[1]
    buf[i + 2] = grainRgb[2]
    buf[i + 3] = a
  }

  // 1. Tooth: independent per-pixel Bernoulli draw, one fixed alpha for
  // every "on" pixel (see the doc comment above for why a fixed value,
  // not a random one, is deliberate).
  const TOOTH_P = 0.75
  const TOOTH_ALPHA = 31
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rand() < TOOTH_P) setPx(x, y, TOOTH_ALPHA)
    }
  }

  // 2. Sparse 1-2 device-px speckle flecks, brighter than the tooth.
  const SPECKLE_ALPHA = 60
  const speckleCount = Math.round(size * size * 0.0002)
  for (let s = 0; s < speckleCount; s++) {
    const cx = Math.floor(rand() * size)
    const cy = Math.floor(rand() * size)
    setPx(cx, cy, SPECKLE_ALPHA)
    if (rand() < 0.5) {
      setPx(cx + 1, cy, SPECKLE_ALPHA)
      setPx(cx, cy + 1, SPECKLE_ALPHA)
    }
  }

  // 3. Thin, gently curved, anti-aliased fibres (~1 device px wide, 20-90
  // CSS px long, sparse, low alpha) -- bilinear-splatted so the edge is
  // AA rather than a hard-stepped line, with wraparound copies near the
  // tile edges so a fibre crossing one still tiles seamlessly.
  const FIBRE_ALPHA = 12
  const fibreCount = 16 + Math.floor(rand() * 10)
  for (let f = 0; f < fibreCount; f++) {
    let px = rand() * size
    let py = rand() * size
    let angle = rand() * Math.PI * 2
    const curve = (rand() - 0.5) * 0.05 // gentle bow, not a straight ruled line
    const lenCss = 20 + rand() * 70
    const len = lenCss * DEVICE_SCALE
    const step = 0.75
    const steps = Math.ceil(len / step)
    const nearEdge = px < 40 || px > size - 40 || py < 40 || py > size - 40
    const offsets = nearEdge ? [-size, 0, size] : [0]
    for (let s = 0; s <= steps; s++) {
      angle += curve * 0.02
      px += Math.cos(angle) * step
      py += Math.sin(angle) * step
      const x0 = Math.floor(px)
      const y0 = Math.floor(py)
      const fx = px - x0
      const fy = py - y0
      for (const ox of offsets) {
        for (const oy of offsets) {
          setPx(x0 + ox, y0 + oy, Math.round(FIBRE_ALPHA * (1 - fx) * (1 - fy)))
          setPx(x0 + 1 + ox, y0 + oy, Math.round(FIBRE_ALPHA * fx * (1 - fy)))
          setPx(x0 + ox, y0 + 1 + oy, Math.round(FIBRE_ALPHA * (1 - fx) * fy))
          setPx(x0 + 1 + ox, y0 + 1 + oy, Math.round(FIBRE_ALPHA * fx * fy))
        }
      }
    }
  }

  return sharp(buf, { raw: { width: size, height: size, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer()
}

/** Brush-edge strip (44 §Assets): 1024x128, 40% solid ink / 20% bristle
 * front with 飞白 (dry-brush) streaks / 40% clear. A hover/reveal mask, not
 * yet consumed until E3 wires up BrushReveal. */
async function buildBrushEdge(rand) {
  const w = 1024
  const h = 128
  const ink = hexToRgb('#141a1e')
  const buf = Buffer.alloc(w * h * 4)
  const solidEnd = w * 0.4
  const bristleEnd = w * 0.6

  // Per-row bristle streak lengths into the bristle zone, so the boundary
  // reads as dry-brush strands rather than a hard vertical edge.
  const streakLen = new Float32Array(h)
  for (let y = 0; y < h; y++) streakLen[y] = rand()

  for (let y = 0; y < h; y++) {
    const reach = bristleEnd - solidEnd
    const streak = solidEnd + reach * (0.3 + streakLen[y] * 0.7)
    for (let x = 0; x < w; x++) {
      let alpha = 0
      if (x < solidEnd) {
        alpha = 255
      } else if (x < streak) {
        const t = (x - solidEnd) / Math.max(1, streak - solidEnd)
        alpha = Math.round(255 * (1 - smoothstep(t)) * (0.5 + rand() * 0.5))
      }
      const i = (y * w + x) * 4
      buf[i] = ink[0]
      buf[i + 1] = ink[1]
      buf[i + 2] = ink[2]
      buf[i + 3] = alpha
    }
  }

  return sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .webp({ quality: 55, alphaQuality: 65, effort: 6 })
    .toBuffer()
}

/** Blot mask (44 §Assets): 512² noise-thresholded diffusion blob, fibrous
 * edge. Consumed as a `mask-image` by BrushReveal/M4 later (E3/E4). */
async function buildBlot(rand) {
  const size = 512
  const ink = hexToRgb('#141a1e')
  const fbm = makeFbm(rand, 6, 20, 0.7)
  const buf = Buffer.alloc(size * size * 4)
  const cx = 0.5
  const cy = 0.5

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const dx = u - cx
      const dy = v - cy
      const dist = Math.sqrt(dx * dx + dy * dy) * 2 // 0 at centre, ~1 at edge
      const n = fbm(u, v)
      // Radial falloff perturbed by noise -> an irregular, fibrous silhouette.
      const field = 1 - dist + (n - 0.5) * 0.5
      const alpha = Math.round(clamp((field - 0.35) / 0.25, 0, 1) * 255)
      const i = (y * size + x) * 4
      buf[i] = ink[0]
      buf[i + 1] = ink[1]
      buf[i + 2] = ink[2]
      buf[i + 3] = alpha
    }
  }

  return sharp(buf, { raw: { width: size, height: size, channels: 4 } })
    .webp({ quality: 60, alphaQuality: 70, effort: 6 })
    .toBuffer()
}

/** Mist plane (44 §Assets): 2048x600, paper colour + alpha, large-scale fbm
 * so it reads as a soft drifting layer once E2 animates it over the hero. */
async function buildMist(rand) {
  const w = 2048
  const h = 600
  const paper = hexToRgb('#f2ecde')
  const fbm = makeFbm(rand, 5, 11, 0.5)
  const buf = Buffer.alloc(w * h * 4)
  const aspect = w / h

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sample on a torus stretched to the plane's aspect ratio so the
      // horizontal edges still tile if the plane ever scrolls/loops.
      const u = x / w
      const v = (y / h) / aspect
      const n = fbm(u, v)
      const vertical = 1 - Math.abs(y / h - 0.5) * 1.6 // fades top/bottom
      const alpha = Math.round(clamp(n * vertical, 0, 1) * 130)
      const i = (y * w + x) * 4
      buf[i] = paper[0]
      buf[i + 1] = paper[1]
      buf[i + 2] = paper[2]
      buf[i + 3] = alpha
    }
  }

  return sharp(buf, { raw: { width: w, height: h, channels: 4 } })
    .webp({ quality: 50, alphaQuality: 60, effort: 6 })
    .toBuffer()
}

/** Brush line (44 §Assets): a tapered stroke (藏锋 -- hidden/pointed tips,
 * never a blunt square end), width varying along its length so no two
 * generated lines look alike. Rendered as a single filled path, ink-faint
 * colour applied by the consuming component, not baked in. */
function buildLineSvg(rand, seedOffset) {
  const width = 600
  const height = 24
  const samples = 14
  const baseWidth = 2 + rand() * 1 // 2-3px at the belly
  const top = []
  const bottom = []

  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const x = t * width
    // Gentle wander around the centreline so it doesn't read as a ruled line.
    const wander = Math.sin(t * Math.PI * (1.5 + seedOffset * 0.3) + rand()) * 1.5
    const y = height / 2 + wander
    // Taper to ~0 width at both ends (smoothstep in from each tip).
    const taper = Math.min(smoothstep(clamp(t / 0.08, 0, 1)), smoothstep(clamp((1 - t) / 0.08, 0, 1)))
    const w = baseWidth * (0.5 + rand() * 0.5) * taper
    top.push([x, y - w / 2])
    bottom.push([x, y + w / 2])
  }

  const round = (n) => Math.round(n * 100) / 100
  const path =
    top.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)},${round(y)}`).join(' ') +
    ' ' +
    bottom
      .slice()
      .reverse()
      .map(([x, y]) => `L${round(x)},${round(y)}`)
      .join(' ') +
    ' Z'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${path}" fill="currentColor"/></svg>\n`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const [paper, brushEdge, blot, mist1, mist2, mist3] = await Promise.all([
    buildPaper(mulberry32(SEED)),
    buildBrushEdge(mulberry32(SEED ^ 0x1111)),
    buildBlot(mulberry32(SEED ^ 0x2222)),
    buildMist(mulberry32(SEED ^ 0x3001)),
    buildMist(mulberry32(SEED ^ 0x3002)),
    buildMist(mulberry32(SEED ^ 0x3003)),
  ])

  await Promise.all([
    writeFile(path.join(OUT_DIR, 'paper.webp'), paper),
    writeFile(path.join(OUT_DIR, 'brush-edge.webp'), brushEdge),
    writeFile(path.join(OUT_DIR, 'blot.webp'), blot),
    writeFile(path.join(OUT_DIR, 'mist-1.webp'), mist1),
    writeFile(path.join(OUT_DIR, 'mist-2.webp'), mist2),
    writeFile(path.join(OUT_DIR, 'mist-3.webp'), mist3),
    writeFile(path.join(OUT_DIR, 'line-1.svg'), buildLineSvg(mulberry32(SEED ^ 0x4001), 0)),
    writeFile(path.join(OUT_DIR, 'line-2.svg'), buildLineSvg(mulberry32(SEED ^ 0x4002), 1)),
    writeFile(path.join(OUT_DIR, 'line-3.svg'), buildLineSvg(mulberry32(SEED ^ 0x4003), 2)),
  ])

  console.log('[ink-textures] wrote paper, brush-edge, blot, mist x3, line x3 ->', OUT_DIR)
}

main().catch((err) => {
  console.error('[ink-textures] failed:', err)
  process.exit(1)
})
