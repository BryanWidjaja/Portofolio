import { chromium } from 'playwright'
import { preview } from 'vite'

const server = await preview({ root: process.cwd(), preview: { port: 4174, strictPort: false } })
const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4174/'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack))
await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
await page.waitForTimeout(2600)

console.log('pre-scroll', JSON.stringify(await page.evaluate(() => window.__stRafDebug())))

await page.mouse.wheel(0, 900)

for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(150)
  const snap = await page.evaluate(() => ({ y: window.scrollY, dbg: window.__stRafDebug() }))
  console.log(`t+${(i + 1) * 150}ms`, JSON.stringify(snap))
}

const info = await page.evaluate(() => {
  const el = document.querySelector('[data-menu-button]')
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return {
    found: true,
    opacity: cs.opacity,
    display: cs.display,
    visibility: cs.visibility,
    pointerEvents: cs.pointerEvents,
    rect: { w: r.width, h: r.height, x: r.x, y: r.y },
    stRaf: window.__stRafDebug ? window.__stRafDebug() : 'n/a',
  }
})
console.log('button info', JSON.stringify(info, null, 2))

try {
  await page.click('[data-menu-button]', { timeout: 5000 })
  console.log('CLICK OK')
} catch (e) {
  console.log('CLICK FAILED', e.message)
}

await browser.close()
await server.close()
