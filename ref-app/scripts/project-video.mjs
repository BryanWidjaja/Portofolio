#!/usr/bin/env node
/**
 * scripts/project-video.mjs
 *
 * 51-round5-plan.md §E2 / 45-ink-approved.md R5b: turns the malware-
 * detection project's master trailer into the files the site serves from
 * `public/projects/malware-detection/`. Same shape as project-images.mjs
 * -- a one-way build step over a master that never ships as-is.
 *
 * Master: `../notes/static-malware-detection/video.mp4` (116.29 s, 1080p24
 * H.264 + AAC, 112.50 MB). It is git-excluded and stays there -- this
 * script only *reads* it; nothing that touches the master's raw bytes is
 * ever written under `ref-app/`.
 *
 * Orchestrator's item-3 follow-up (after 54-video-ideation.md §C,
 * "condensed honest supercut", the ranked recommendation): the single
 * `-ss 9 -t 8` loop opened on the tail of a black title card and, per the
 * owner's own point (the LinkedIn post the ideation traced), cut out the
 * 98.85% -> 87.02% correction entirely. The loop is now a 5-segment
 * concat -- every segment starts clear of a title card/black frame, and
 * 98.85% never appears without 87.02% following in the same loop.
 *
 * Outputs (measured 2026-09-29, this repo's ffmpeg 8.0/libsvtav1 3.1):
 *   loop.mp4    silent H.264 concat of LOOP_SEGMENTS (17s total), 1280
 *               wide, CRF 28, +faststart
 *   loop.webm   same concat, AV1 (libsvtav1) CRF 40
 *   poster.avif one frame from inside the first segment (t=13s, byte
 *               mosaics -- never a title card/black frame)
 *   poster.webp same frame, WebP fallback
 *   trailer.mp4 the full 116s cut at 720p, H.264 CRF 28 + AAC 96k,
 *               +faststart -- unchanged by this follow-up
 *
 * Usage: node scripts/project-video.mjs
 */
import { mkdir } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const MASTER = path.resolve('../notes/static-malware-detection/video.mp4')
const OUT = path.resolve('public/projects/malware-detection')

// 54-video-ideation.md §C ("condensed honest supercut", 17s): each segment
// starts clear of every title-card/black frame the ideation's contact
// sheet found, and the run carries the owner's own correction end to end
// -- byte mosaics, the decision tree, 98.85% (flagged in the source),
// 87.02%, then the flattering-vs-honest scale that puts them together.
const LOOP_SEGMENTS = [
  { start: 11, end: 15 }, // byte-image mosaics
  { start: 56, end: 59 }, // decision tree (threshold)
  { start: 62, end: 66 }, // "98.85%" (flagged in the source)
  { start: 80, end: 82 }, // "87.02%" (the honest number)
  { start: 110, end: 114 }, // flattering-vs-honest scale, both numbers together
]
// t=13s: inside the first segment's byte-mosaic beat, never a title
// card/black frame.
const POSTER_AT = 13

function concatFilter(segments, scale) {
  const labels = segments.map((_, i) => `v${i}`)
  const trims = segments.map(
    ({ start, end }, i) => `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[${labels[i]}]`,
  )
  const concat = `${labels.map((l) => `[${l}]`).join('')}concat=n=${labels.length}:v=1:a=0,scale=${scale}[outv]`
  return [...trims, concat].join(';')
}

function run(args) {
  const res = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' })
  if (res.status !== 0) {
    throw new Error(`ffmpeg failed: ffmpeg ${args.join(' ')}`)
  }
}

function size(file) {
  const bytes = statSync(file).size
  return `${(bytes / 1024 / 1024).toFixed(2)} MB (${bytes} bytes)`
}

async function main() {
  if (!existsSync(MASTER)) {
    console.error(`[project-video] master not found at ${MASTER} -- it stays in notes/, never in ref-app/`)
    process.exit(1)
  }
  await mkdir(OUT, { recursive: true })

  const loopMp4 = path.join(OUT, 'loop.mp4')
  const loopWebm = path.join(OUT, 'loop.webm')
  const posterPng = path.join(OUT, '.poster-tmp.png')
  const posterAvif = path.join(OUT, 'poster.avif')
  const posterWebp = path.join(OUT, 'poster.webp')
  const trailerMp4 = path.join(OUT, 'trailer.mp4')

  console.log('[project-video] encoding loop.mp4 (H.264, silent, 5-segment concat)...')
  run([
    '-i', MASTER,
    '-filter_complex', concatFilter(LOOP_SEGMENTS, '1280:-2'),
    '-map', '[outv]', '-an',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    loopMp4,
  ])

  console.log('[project-video] encoding loop.webm (AV1, silent, 5-segment concat)...')
  run([
    '-i', MASTER,
    '-filter_complex', concatFilter(LOOP_SEGMENTS, '1280:-2'),
    '-map', '[outv]', '-an',
    '-c:v', 'libsvtav1', '-crf', '40', '-preset', '6', '-pix_fmt', 'yuv420p',
    loopWebm,
  ])

  console.log('[project-video] extracting poster frame...')
  run(['-ss', String(POSTER_AT), '-i', MASTER, '-frames:v', '1', '-vf', 'scale=1280:-2', posterPng])
  run(['-i', posterPng, '-c:v', 'libaom-av1', '-crf', '32', '-b:v', '0', '-still-picture', '1', posterAvif])
  run(['-i', posterPng, '-c:v', 'libwebp', '-quality', '80', posterWebp])

  console.log('[project-video] encoding trailer.mp4 (full cut, 720p + audio)...')
  run([
    '-i', MASTER, '-vf', 'scale=1280:-2',
    '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    trailerMp4,
  ])

  // The PNG intermediate never ships -- only the encoded stills do.
  await import('node:fs/promises').then((fs) => fs.rm(posterPng, { force: true }))

  console.log('[project-video] done:')
  console.log(`  loop.mp4    ${size(loopMp4)}`)
  console.log(`  loop.webm   ${size(loopWebm)}`)
  console.log(`  poster.avif ${size(posterAvif)}`)
  console.log(`  poster.webp ${size(posterWebp)}`)
  console.log(`  trailer.mp4 ${size(trailerMp4)}`)
}

main().catch((err) => {
  console.error('[project-video] failed:', err)
  process.exit(1)
})
