#!/usr/bin/env node
/**
 * scripts/project-images.mjs
 *
 * Turns each project's master images into the files the site serves:
 * `public/projects/<slug>/<name>-{960,1600}.{avif,webp}`, plus a baked-grey
 * `-grey` twin of each cover (R4-4: what a home card's BrushReveal shows
 * until the brush paints colour in).
 *
 * Masters live in `assets/projects/<slug>/<name>.webp` (lossless-quality
 * WebP, 1600px wide), outside `public/` so they're never served. Each one
 * is real output from the project itself, never a mock-up:
 *
 *   malware-detection  cover, gallery-2: the repo's own StaticProcessor
 *                      run on a benign Windows PE (distlib's w64.exe
 *                      launcher), cells coloured on validated ramps;
 *                      gallery-1: the README's architecture-comparison
 *                      table (camera-ready paper numbers) as a chart
 *   btardew-walley     all three: the game's real terminal output (Home
 *                      map, Plant Farm on day 4, Buy Tools store),
 *                      captured by driving the compiled game over stdin
 *   instatags          cover, gallery-1: the SvelteKit frontend's landing
 *                      hero and upload page, served locally; gallery-2:
 *                      the Chrome extension's own popup HTML at its
 *                      20rem x 25rem size. The landing page's placeholder
 *                      testimonials (quotes attributed to real people) and
 *                      the footer are kept out of frame.
 *
 * To replace one: drop a new master in and re-run this.
 *
 * Usage: node scripts/project-images.mjs
 */
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SRC = path.resolve('assets/projects')
const OUT = path.resolve('public/projects')
const WIDTHS = [960, 1600]

async function render(master, outBase, width, grey) {
  let pipeline = sharp(master).resize({ width, withoutEnlargement: false })
  if (grey) pipeline = pipeline.grayscale()
  await Promise.all([
    pipeline.clone().webp({ quality: 82, effort: 6 }).toFile(`${outBase}.webp`),
    pipeline.clone().avif({ quality: 50, effort: 6 }).toFile(`${outBase}.avif`),
  ])
}

async function main() {
  for (const slug of await readdir(SRC)) {
    const outDir = path.join(OUT, slug)
    await mkdir(outDir, { recursive: true })
    for (const file of await readdir(path.join(SRC, slug))) {
      const name = path.parse(file).name
      const master = path.join(SRC, slug, file)
      for (const width of WIDTHS) {
        await render(master, path.join(outDir, `${name}-${width}`), width, false)
        // Only the cover gets a grey twin: it's the one image shown on a
        // home card, the only place the brush paint-out runs. Project pages
        // show their images in plain colour.
        if (name === 'cover') await render(master, path.join(outDir, `${name}-${width}-grey`), width, true)
      }
      console.log(`[project-images] ${slug}/${name}`)
    }
  }
}

main().catch((err) => {
  console.error('[project-images] failed:', err)
  process.exit(1)
})
