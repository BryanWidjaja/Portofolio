#!/usr/bin/env node
/**
 * scripts/cast.mjs
 *
 * Round 4 motion-proof harness: captures a CDP screencast (not a series of
 * full `page.screenshot()` calls, which cost 0.5-2.5s each and blur out the
 * motion between them) and composes the sampled frames into one labelled
 * montage PNG via `sharp` (already a repo devDependency — no new package
 * added, per the harness spec). Builds/serves dist/ the same way
 * scripts/shots.mjs and scripts/perf.mjs do.
 *
 * Usage:
 *   node scripts/cast.mjs [flags]
 *   node scripts/cast.mjs --route / --ms 2000 --frames 10                       # cold load of "/"
 *   node scripts/cast.mjs --script scroll --ms 3000 --frames 12 --skip-build
 *   node scripts/cast.mjs --script transition --out ../notes/plan/shots/r4-research/transition.png
 *
 * Flags:
 *   --route <path>     cold-load mode: capture from before first paint through --ms of "/" (or given route)
 *   --script <name>    scripted-interaction mode instead of cold-load: hover-card | open-menu | scroll | transition
 *                       (loads "/" and settles first, THEN starts the screencast and runs the action)
 *   --frames <n>        frames to sample into the montage (default 12)
 *   --ms <n>            capture window in ms (default 2000)
 *   --width <n>         per-frame thumbnail width in the montage, px (default 320)
 *   --out <path>        output PNG path (default ../notes/plan/shots/<mode>-<label>.png, repo root, never inside ref-app/)
 *   --label <name>      filename/log tag when --out is omitted
 *   --skip-build         reuse the existing dist/ instead of rebuilding
 *   --cpu <rate>         CDP CPU throttle multiplier (default 1 — this tool is for seeing motion, not measuring it;
 *                         use perf.mjs for throttled timing)
 *
 * Each thumbnail gets its elapsed-ms-since-capture-start label burned into
 * its own top-left corner (sharp SVG composite — no extra dependency).
 */
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'
import sharp from 'sharp'

function parseArgs(argv) {
  const flags = {
    route: '/',
    script: undefined,
    frames: 12,
    ms: 2000,
    width: 320,
    out: undefined,
    label: 'cast',
    skipBuild: false,
    cpu: 1,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--route') flags.route = argv[++i]
    else if (arg === '--script') flags.script = argv[++i]
    else if (arg === '--frames') flags.frames = Number(argv[++i])
    else if (arg === '--ms') flags.ms = Number(argv[++i])
    else if (arg === '--width') flags.width = Number(argv[++i])
    else if (arg === '--out') flags.out = argv[++i]
    else if (arg === '--label') flags.label = argv[++i]
    else if (arg === '--skip-build') flags.skipBuild = true
    else if (arg === '--cpu') flags.cpu = Number(argv[++i])
  }
  return flags
}

const flags = parseArgs(process.argv.slice(2))
const mode = flags.script ? 'script' : 'cold'
const defaultOut = path.resolve('../notes/plan/shots', `${mode}-${flags.script ?? flags.label}.png`)
const outPath = flags.out ? path.resolve(flags.out) : defaultOut

function build() {
  const result = spawnSync('npm run build', { stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error('[cast] build failed')
    process.exit(1)
  }
}

const SCRIPTS = {
  'hover-card': async (page) => {
    const card = page.locator('a[href="/projects/malware-detection"]').first()
    await card.scrollIntoViewIfNeeded()
    const box = await card.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  },
  'open-menu': async (page) => {
    await page.click('[data-menu-button]')
  },
  scroll: async (page) => {
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(60)
    }
  },
  transition: async (page) => {
    await page.click('a[href="/projects/malware-detection"]')
  },
}

async function captureScreencast(client, ms) {
  const frames = []
  let sessionEnabled = true
  const onFrame = async (params) => {
    frames.push({ data: params.data, timestamp: params.metadata.timestamp })
    if (sessionEnabled) {
      try {
        await client.send('Page.screencastFrameAck', { sessionId: params.sessionId })
      } catch {}
    }
  }
  client.on('Page.screencastFrame', onFrame)
  await client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
  await new Promise((resolve) => setTimeout(resolve, ms))
  sessionEnabled = false
  await client.send('Page.stopScreencast')
  client.off('Page.screencastFrame', onFrame)
  return frames
}

function sampleFrames(frames, n) {
  if (frames.length <= n) return frames
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(frames[Math.round((i * (frames.length - 1)) / (n - 1))])
  }
  return out
}

async function labelThumb(buffer, width, labelText) {
  const resized = await sharp(buffer).resize({ width }).png().toBuffer()
  const meta = await sharp(resized).metadata()
  const h = meta.height ?? Math.round((width * 9) / 16)
  const svg = Buffer.from(
    `<svg width="${width}" height="${h}">
      <rect x="0" y="0" width="${Math.max(46, labelText.length * 7)}" height="18" fill="black" fill-opacity="0.65"/>
      <text x="4" y="13" font-family="monospace" font-size="12" fill="white">${labelText}</text>
    </svg>`,
  )
  return sharp(resized).composite([{ input: svg, left: 0, top: 0 }]).png().toBuffer()
}

async function composeMontage(thumbBuffers, cols) {
  const first = await sharp(thumbBuffers[0]).metadata()
  const w = first.width
  const h = first.height
  const rows = Math.ceil(thumbBuffers.length / cols)
  const canvas = sharp({
    create: { width: w * cols, height: h * rows, channels: 4, background: { r: 20, g: 20, b: 20, alpha: 1 } },
  })
  const composites = thumbBuffers.map((buf, i) => ({
    input: buf,
    left: (i % cols) * w,
    top: Math.floor(i / cols) * h,
  }))
  return canvas.composite(composites).png().toBuffer()
}

async function main() {
  if (!flags.skipBuild) build()
  await mkdir(path.dirname(outPath), { recursive: true })

  const server = await preview({ root: process.cwd(), preview: { port: 4173, strictPort: false } })
  const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4173/'
  const browser = await chromium.launch()

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const client = await context.newCDPSession(page)
    await client.send('Page.enable')
    if (flags.cpu !== 1) await client.send('Emulation.setCPUThrottlingRate', { rate: flags.cpu })

    let frames
    if (mode === 'cold') {
      const capturePromise = captureScreencast(client, flags.ms)
      page.goto(new URL(flags.route, base).toString(), { waitUntil: 'load' }).catch(() => {})
      frames = await capturePromise
    } else {
      await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready
      })
      await page.waitForTimeout(1500)
      const action = SCRIPTS[flags.script]
      if (!action) {
        console.error(`[cast] unknown --script "${flags.script}" — expected one of ${Object.keys(SCRIPTS).join(', ')}`)
        process.exit(1)
      }
      const capturePromise = captureScreencast(client, flags.ms)
      action(page).catch(() => {})
      frames = await capturePromise
    }

    await context.close()

    if (frames.length === 0) {
      console.error('[cast] no frames captured')
      process.exit(1)
    }

    const sampled = sampleFrames(frames, flags.frames)
    const t0 = sampled[0].timestamp
    const thumbs = []
    for (const f of sampled) {
      const elapsedMs = Math.round((f.timestamp - t0) * 1000)
      thumbs.push(await labelThumb(Buffer.from(f.data, 'base64'), flags.width, `${elapsedMs}ms`))
    }
    const cols = Math.min(4, thumbs.length)
    const montage = await composeMontage(thumbs, cols)
    const fs = await import('node:fs/promises')
    await fs.writeFile(outPath, montage)
    console.log(`[cast] captured ${frames.length} frames, sampled ${sampled.length} -> ${path.relative(process.cwd(), outPath)}`)
  } finally {
    await browser.close()
    await server.close()
  }
}

main()
