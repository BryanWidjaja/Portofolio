#!/usr/bin/env node
/** Validate complete-frame source and responsive image derivatives. */
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const masterRoot = path.join(root, 'assets/projects')
const outputRoot = path.join(root, 'public/projects')
const widths = [320, 640, 960, 1600, 1920]
const errors = []
let checked = 0

async function metadata(file) {
  try {
    return await sharp(file).metadata()
  } catch (error) {
    errors.push(`${path.relative(root, file)}: cannot decode (${error.message})`)
    return null
  }
}

async function checkFamily(slug, name, source, maxWidth) {
  const sourceMeta = await metadata(source)
  if (!sourceMeta?.width || !sourceMeta.height) return
  for (const width of widths.filter((candidate) => candidate <= maxWidth)) {
    const expectedWidth = Math.min(width, sourceMeta.width)
    for (const format of ['webp', 'avif']) {
      const file = path.join(outputRoot, slug, `${name}-${width}.${format}`)
      try {
        await access(file)
      } catch {
        errors.push(`${path.relative(root, file)}: missing derivative`)
        continue
      }
      const image = await metadata(file)
      checked++
      if (image?.width !== expectedWidth || image?.height !== Math.round(sourceMeta.height * expectedWidth / sourceMeta.width)) {
        errors.push(`${path.relative(root, file)}: ${image?.width}x${image?.height}, expected ${expectedWidth}x${Math.round(sourceMeta.height * expectedWidth / sourceMeta.width)} (source ${sourceMeta.width}x${sourceMeta.height})`)
      }
    }
  }
}

for (const slug of ['btardew-walley', 'instatags']) {
  const dir = path.join(masterRoot, slug)
  const masters = (await readdir(dir)).filter((file) => /\.(?:png|jpe?g|webp)$/i.test(file))
  if (!masters.length) errors.push(`${path.relative(root, dir)}: no image masters`)
  for (const file of masters) {
    const source = path.join(dir, file)
    const sourceMeta = await metadata(source)
    if (sourceMeta?.width) await checkFamily(slug, path.parse(file).name, source, sourceMeta.width >= 1920 ? 1920 : 1600)
  }
}

const slidesDir = path.resolve(root, '../notes/static-malware-detection/newest')
for (const [name, file] of [['cover', '3.png'], ...Array.from({ length: 10 }, (_, index) => [`slide-${index + 1}`, `${index + 1}.png`])]) {
  await checkFamily('malware-detection', name, path.join(slidesDir, file), 1920)
}

// Content dimensions are also part of the rendering contract: stale
// descriptors can distort aspect-ratio layout before image decode completes.
const content = await readFile(path.join(root, 'src/content/projects.ts'), 'utf8')
const imageStarts = [...content.matchAll(/src:\s*'([^']+)'/g)]
for (let index = 0; index < imageStarts.length; index++) {
  const [match] = imageStarts[index]
  const start = imageStarts[index].index
  const next = imageStarts[index + 1]?.index ?? content.length
  const block = content.slice(start, next)
  const dimensions = block.match(/\bwidth:\s*(\d+),\s*\n\s*height:\s*(\d+)/)
  if (!match.startsWith("src: '/projects/") || !dimensions) continue
  const src = match.match(/'([^']+)'/)[1]
  const declared = { width: Number(dimensions[1]), height: Number(dimensions[2]) }
  const file = path.join(root, 'public', src.replace(/^\//, ''))
  const actual = await metadata(file)
  checked++
  if (!actual || actual.width !== declared.width || actual.height !== declared.height) {
    errors.push(`${src}: projects.ts declares ${declared.width}x${declared.height}; served source is ${actual?.width}x${actual?.height}`)
  }
}

console.log(`[project-assets] ${checked} source/derivative images decoded; dimensions match content and no derivative enlarges its source.`)
if (errors.length) {
  for (const error of errors) console.error(`[project-assets] FAIL ${error}`)
  process.exitCode = 1
} else console.log('[project-assets] PASS all required source/derivative dimensions and formats match.')
