#!/usr/bin/env node
/** Build responsive transparent layers for the living-handscroll scenes. */
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const MASTER_DIR = path.resolve('../notes/plan/ambient-v1/masters')
const OUT_DIR = path.resolve('public/ambient/v1')
const WIDTHS = {
  ridge: { mobile: 960, wide: 1920 },
  'bank-right': { mobile: 720, wide: 1200 },
  waterline: { mobile: 960, wide: 1920 },
}
const MAX_BYTES = { avif: 180_000, webp: 280_000 }

await mkdir(OUT_DIR, { recursive: true })

for (const [name, sizes] of Object.entries(WIDTHS)) {
  const master = path.join(MASTER_DIR, `${name}.png`)
  for (const [size, width] of Object.entries(sizes)) {
    const base = sharp(master).rotate().resize({ width, withoutEnlargement: true, kernel: 'lanczos3' }).ensureAlpha()
    for (const format of ['avif', 'webp']) {
      const output = path.join(OUT_DIR, `${name}-${size}.${format}`)
      const pipeline = base.clone()
      if (format === 'avif') {
        await pipeline.avif({ quality: 42, effort: 5, chromaSubsampling: '4:4:4' }).toFile(output)
      } else {
        await pipeline.webp({ quality: 78, alphaQuality: 90, effort: 5 }).toFile(output)
      }
      const [metadata, file] = await Promise.all([sharp(output).metadata(), stat(output)])
      if (!metadata.hasAlpha) throw new Error(`${output} lost its alpha channel`)
      if (metadata.width > width) throw new Error(`${output} was upscaled beyond ${width}px`)
      if (file.size > MAX_BYTES[format]) throw new Error(`${output} is ${file.size} bytes; limit is ${MAX_BYTES[format]}`)
      console.log(`[ambient-images] ${path.basename(output)} ${metadata.width}x${metadata.height}, ${Math.round(file.size / 1024)} kB`)
    }
  }
}
