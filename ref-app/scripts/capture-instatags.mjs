#!/usr/bin/env node
/**
 * Capture authentic InstaTags web states from the owner's FrontEnd repo.
 * Start that repo on port 5190, then run: node scripts/capture-instatags.mjs
 * Raw browser PNGs remain in assets/sources/instatags; lossless WebP masters
 * are written to assets/projects/instatags for project-images.mjs.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'

const base = process.env.INSTATAGS_URL ?? 'http://127.0.0.1:5190'
const rawDir = path.resolve('assets/sources/instatags')
const masterDir = path.resolve('assets/projects/instatags')

const captures = [
  { route: '/', name: 'gallery-1', width: 1440, height: 900 },
  { route: '/upload', name: 'gallery-2', width: 1440, height: 900 },
  { route: '/how-to-use', name: 'gallery-4', width: 1920, height: 1080, settleCarousel: true },
  { route: '/about-us', name: 'gallery-6', width: 1440, height: 900 },
  { route: '/thank-you', name: 'gallery-7', width: 1440, height: 900 },
]

await mkdir(rawDir, { recursive: true })
await mkdir(masterDir, { recursive: true })
const browser = await chromium.launch()
try {
  for (const capture of captures) {
    const page = await browser.newPage({ viewport: { width: capture.width, height: capture.height }, deviceScaleFactor: 1 })
    await page.goto(`${base}${capture.route}`, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}' })
    if (capture.settleCarousel) {
      const next = page.getByRole('button', { name: 'right' }).last()
      if (await next.count()) {
        for (let i = 0; i < 2; i += 1) await next.click()
      }
      await page.waitForTimeout(50)
    }
    const raw = path.join(rawDir, `${capture.name}.png`)
    await page.screenshot({ path: raw })
    await sharp(raw).webp({ lossless: true, effort: 6 }).toFile(path.join(masterDir, `${capture.name}.webp`))
    console.log(`[capture-instatags] ${capture.route} -> ${capture.name} (${capture.width}x${capture.height})`)
    await page.close()
  }

  const popupUrl = pathToFileURL(path.resolve('.scratch/instatags-extension-renewed/index.html')).href
  const popupStates = [
    { name: 'cover', state: 'idle' },
    { name: 'gallery-3', state: 'loading' },
    { name: 'gallery-5', state: 'toast' },
  ]
  for (const capture of popupStates) {
    const page = await browser.newPage({ viewport: { width: 352, height: 416 }, deviceScaleFactor: 2 })
    await page.addInitScript((state) => {
      window.chrome = {
        tabs: {
          query: state === 'loading' ? () => new Promise(() => {}) : async () => [{ id: 1 }],
        },
        scripting: {
          executeScript: async () => [{ result: null }],
        },
      }
    }, capture.state)
    await page.goto(popupUrl, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    if (capture.state !== 'idle') {
      await page.getByRole('button', { name: 'Get Tags' }).click()
      if (capture.state === 'toast') {
        await page.locator('.toast.visible').waitFor()
        await page.waitForTimeout(300)
      }
    }
    const raw = path.join(rawDir, `${capture.name}.png`)
    await page.screenshot({ path: raw })
    const popup = await sharp(raw).png().toBuffer()
    const frame = Buffer.from('<svg width="708" height="836"><rect x="1" y="1" width="706" height="834" fill="none" stroke="#5d5547" stroke-opacity=".45" stroke-width="2"/></svg>')
    await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#f2ecde' } })
      .composite([
        { input: popup, left: 448, top: 84 },
        { input: frame, left: 446, top: 82 },
      ])
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(masterDir, `${capture.name}.webp`))
    console.log(`[capture-instatags] renewed extension ${capture.state} -> ${capture.name}`)
    await page.close()
  }
} finally {
  await browser.close()
}
