#!/usr/bin/env node
/**
 * Build responsive project evidence in AVIF and WebP.
 *
 * Real masters live outside public/:
 * - assets/projects/btardew-walley: terminal output captured from the game
 *   and consistently typeset as ink on paper.
 * - assets/projects/instatags: real FrontEnd/renewed-extension captures;
 *   scripts/capture-instatags.mjs retains browser PNGs and reproduces them.
 * - notes/static-malware-detection/newest/1.png..10.png: the owner's intact
 *   1920x1080 conference slides. Slide 3 also supplies the home cover.
 *
 * No derivative is enlarged. The 320/640/960/1600 suffix names are stable
 * URL slots; ProjectImage uses each master's actual width as the final srcset
 * descriptor when a source is smaller than the slot name.
 */
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const sourceRoot = path.resolve('assets/projects')
const outputRoot = path.resolve('public/projects')
const widths = [320, 640, 960, 1600]

async function render(master, outputBase, width, grey = false) {
  let pipeline = sharp(master).resize({ width, withoutEnlargement: true })
  if (grey) pipeline = pipeline.grayscale()
  await Promise.all([
    pipeline.clone().webp({ quality: 82, effort: 6 }).toFile(`${outputBase}.webp`),
    pipeline.clone().avif({ quality: 50, effort: 6 }).toFile(`${outputBase}.avif`),
  ])
}

async function renderFamily(slug) {
  const outputDir = path.join(outputRoot, slug)
  await mkdir(outputDir, { recursive: true })
  for (const file of await readdir(path.join(sourceRoot, slug))) {
    const master = path.join(sourceRoot, slug, file)
    const metadata = await sharp(master).metadata().catch(() => null)
    if (!metadata?.width) continue
    const name = path.parse(file).name
    const familyWidths = metadata.width >= 1920 ? [...widths, 1920] : widths
    for (const width of familyWidths) {
      await render(master, path.join(outputDir, `${name}-${width}`), width)
      if (name === 'cover') await render(master, path.join(outputDir, `${name}-${width}-grey`), width, true)
    }
    console.log(`[project-images] ${slug}/${name} (${metadata.width}x${metadata.height})`)
  }
}

async function renderMalwareSlides() {
  const masters = path.resolve('../notes/static-malware-detection/newest')
  const outputDir = path.join(outputRoot, 'malware-detection')
  await mkdir(outputDir, { recursive: true })
  const slides = Array.from({ length: 10 }, (_, index) => [`slide-${index + 1}`, `${index + 1}.png`])
  for (const [name, source] of [['cover', '3.png'], ...slides]) {
    const master = path.join(masters, source)
    for (const width of [...widths, 1920]) {
      await render(master, path.join(outputDir, `${name}-${width}`), width)
      if (name === 'cover') await render(master, path.join(outputDir, `${name}-${width}-grey`), width, true)
    }
    console.log(`[project-images] malware-detection/${name} <- newest/${source}`)
  }
}

await renderFamily('btardew-walley')
await renderFamily('instatags')
await renderMalwareSlides()
