#!/usr/bin/env node
/**
 * scripts/shots.mjs
 *
 * Builds the site (respecting --mode) and boots `vite preview` against the
 * real dist/ output, so screenshots match the prerendered HTML exactly
 * (rather than a dev-server SSR render). Then drives headless Chromium
 * (Playwright) to capture full-page PNGs into ../notes/plan/shots/ (repo root, outside the app folder).
 *
 * Usage:
 *   node scripts/shots.mjs [routes] [widths] [flags]
 *   npm run shots -- / 1440
 *   npm run shots -- "/,/about,/projects/tidewater" "1440,390" --reduced-motion --prefix e1
 *   npm run shots -- / 1440 --mode about-accordion   # builds+serves the D3 accordion variant
 *
 * Positional args (both optional, comma-separated lists):
 *   routes   default: /,/about,/projects/tidewater,/projects/kopi-ledger,/projects/halftone
 *   widths   default: 1440,390
 *
 * Flags:
 *   --reduced-motion   emulate `prefers-reduced-motion: reduce`
 *   --prefix <name>    output subfolder under ../notes/plan/shots/ (default: "default", or the mode)
 *   --mode <mode>      Vite mode to build/preview, e.g. "about-accordion" (default: the plain build)
 *   --skip-build       reuse the existing dist/ instead of rebuilding (faster local iteration)
 *   --hover <selector> hover this selector (first match) before the screenshot, e.g. for M9's card hover
 *   --click <selector> click this selector (first match) before the screenshot, e.g. to open the menu
 *   --suffix <name>    extra filename suffix, so a --hover/--click capture doesn't clobber the plain shot
 *                       of the same route@width (e.g. "hover" -> home-1440-hover.png)
 *
 * Exits 1 if the build fails, or if any route logs a console error/warning
 * or an uncaught page error while loading.
 *
 * Git Bash on Windows note: its MSYS layer rewrites a bare leading-slash
 * argument (e.g. the "/" in `npm run shots -- / 1440`) into an absolute
 * Windows path before node ever sees it. Run with `MSYS_NO_PATHCONV=1`
 * prefixed (or from PowerShell/cmd.exe, which don't do this) to pass a
 * literal "/" through untouched.
 */
import { spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'

const VIEWPORT_HEIGHT = 900 // full-page capture grows past this; it's just the initial viewport

const DEFAULT_ROUTES = ['/', '/about', '/projects/tidewater', '/projects/kopi-ledger', '/projects/halftone']
const DEFAULT_WIDTHS = [1440, 390]

function parseArgs(argv) {
  const flags = {
    reducedMotion: false,
    prefix: undefined,
    mode: undefined,
    skipBuild: false,
    hover: undefined,
    click: undefined,
    suffix: undefined,
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--reduced-motion') flags.reducedMotion = true
    else if (arg === '--skip-build') flags.skipBuild = true
    else if (arg === '--prefix') flags.prefix = argv[++i]
    else if (arg === '--mode') flags.mode = argv[++i]
    else if (arg === '--hover') flags.hover = argv[++i]
    else if (arg === '--click') flags.click = argv[++i]
    else if (arg === '--suffix') flags.suffix = argv[++i]
    else positional.push(arg)
  }
  return { flags, positional }
}

const { flags, positional } = parseArgs(process.argv.slice(2))
const routes = positional[0] ? positional[0].split(',') : DEFAULT_ROUTES
const widths = positional[1] ? positional[1].split(',').map(Number) : DEFAULT_WIDTHS
const prefix = flags.prefix ?? flags.mode ?? 'default'
const outDir = path.resolve('../notes/plan/shots', prefix)

function build() {
  let cmdArgs
  if (!flags.mode) {
    cmdArgs = ['npm', 'run', 'build']
  } else if (flags.mode === 'about-accordion') {
    cmdArgs = ['npm', 'run', 'build:accordion']
  } else {
    // Arbitrary mode beyond the two convenience scripts: call the CLI directly.
    cmdArgs = ['npx', 'vite-react-ssg', 'build', '--mode', flags.mode]
  }
  // `npm`/`npx` are .cmd shims on Windows, which only run through a shell.
  // Join into one command string (all args are fixed, no untrusted input) so
  // shell:true doesn't also need an args array (Node's DEP0190).
  const result = spawnSync(cmdArgs.join(' '), { stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error('[shots] build failed')
    process.exit(1)
  }
}

// Lenis's lerp smoothing converges asymptotically; poll until two
// consecutive reads agree instead of guessing a duration (same approach as
// scripts/check-transitions.mjs's waitForStableScroll).
async function waitForStableScroll(page, maxWaitMs = 4000, intervalMs = 150) {
  let last = await page.evaluate(() => window.scrollY)
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    await page.waitForTimeout(intervalMs)
    const current = await page.evaluate(() => window.scrollY)
    if (Math.abs(current - last) < 1) return current
    last = current
  }
  return last
}

// A full-page screenshot never scrolls the page on its own, so
// ScrollTrigger's top-85% batch reveals (12-motion.md M4) never fire and
// mid/lower-page content sits at its pre-reveal opacity:0 -- a tall blank
// band. Wheel-scroll the real page through its full height, the same way a
// user's mouse wheel would, so Lenis's own RAF loop drives the scroll (a raw
// `window.scrollTo` can fight Lenis's internal target and get silently
// reverted next frame), then scroll back to the top the same way. Reveals
// never reverse on the way back up -- `createScrollReveals` uses
// `ScrollTrigger.batch(..., { once: true })`, which kills the trigger the
// instant it fires -- so this is safe to run before every capture.
async function settleFullPage(page) {
  const { scrollHeight, viewportHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }))

  let traveled = 0
  while (traveled < scrollHeight) {
    await page.mouse.wheel(0, viewportHeight)
    await waitForStableScroll(page)
    await page.waitForTimeout(1300) // slowest M4 reveal (media, 1100ms) plus margin
    traveled += viewportHeight
  }

  for (let guard = 0; guard < 60; guard++) {
    const y = await page.evaluate(() => window.scrollY)
    if (y <= 0) break
    await page.mouse.wheel(0, -viewportHeight)
    await waitForStableScroll(page)
  }
  await page.waitForTimeout(300)
}

// Confirms the settle actually worked instead of trusting it blind: every
// `[data-reveal]` element (M4's scroll-triggered batch) must have finished
// at opacity 1. Returns details of the first offender, or null.
async function findUnrevealedElement(page) {
  return page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('[data-reveal]'))) {
      const opacity = Number(getComputedStyle(el).opacity)
      if (opacity < 0.98) {
        return { tag: el.tagName.toLowerCase(), reveal: el.getAttribute('data-reveal'), opacity }
      }
    }
    return null
  })
}

async function main() {
  if (!flags.skipBuild) build()
  await mkdir(outDir, { recursive: true })

  const server = await preview({ root: process.cwd(), preview: { port: 4173, strictPort: false } })
  const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4173/'

  const browser = await chromium.launch()
  let hadIssue = false

  try {
    for (const route of routes) {
      for (const width of widths) {
        const context = await browser.newContext({
          viewport: { width, height: VIEWPORT_HEIGHT },
          reducedMotion: flags.reducedMotion ? 'reduce' : 'no-preference',
        })
        const page = await context.newPage()

        page.on('console', (msg) => {
          const type = msg.type()
          if (type === 'error' || type === 'warning') {
            hadIssue = true
            console.error(`[shots] console.${type} on ${route}@${width}: ${msg.text()}`)
          }
        })
        page.on('pageerror', (err) => {
          hadIssue = true
          console.error(`[shots] pageerror on ${route}@${width}: ${err.message}`)
        })

        const target = new URL(route, base).toString()
        await page.goto(target, { waitUntil: 'load' })
        // Wait for webfonts, then let entrance animations settle.
        await page.evaluate(async () => {
          if (document.fonts?.ready) await document.fonts.ready
        })
        await page.waitForTimeout(2500)

        if (!flags.reducedMotion) {
          // Reduced motion sets every reveal to its end state immediately
          // (motion/reveal.ts), so nothing depends on scroll there -- skip
          // the settle pass and leave that path exactly as before.
          await settleFullPage(page)
          const unrevealed = await findUnrevealedElement(page)
          if (unrevealed) {
            hadIssue = true
            console.error(
              `[shots] unrevealed [data-reveal="${unrevealed.reveal}"] <${unrevealed.tag}> ` +
                `on ${route}@${width}: opacity=${unrevealed.opacity} (expected ~1 after settling)`,
            )
          }
        }

        if (flags.hover) {
          await page.hover(flags.hover)
          await page.waitForTimeout(600) // M9 card hover settles by 500ms
        }
        if (flags.click) {
          // A real coordinate click misses [data-menu-button]: it's
          // visibility:hidden at scroll 0 on md+ until Nav's M6
          // scroll-collapse reveals it, and hit-testing skips
          // visibility:hidden elements even with Playwright's `force`.
          // Dispatching .click() on the node directly still fires React's
          // onClick (same native event, just not coordinate-targeted).
          const clicked = await page.evaluate((sel) => {
            const el = document.querySelector(sel)
            if (!el) return false
            el.click()
            return true
          }, flags.click)
          if (!clicked) {
            hadIssue = true
            console.error(`[shots] --click selector "${flags.click}" matched nothing on ${route}@${width}`)
          }
          await page.waitForTimeout(1200) // M7 menu open runs ~700-1100ms
        }

        const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-')
        const reducedSuffix = flags.reducedMotion ? '-reduced' : ''
        const customSuffix = flags.suffix ? `-${flags.suffix}` : ''
        const file = path.join(outDir, `${slug}-${width}${reducedSuffix}${customSuffix}.png`)
        await page.screenshot({ path: file, fullPage: true })
        console.log(`[shots] saved ${path.relative(process.cwd(), file)}`)

        await context.close()
      }
    }
  } finally {
    await browser.close()
    await server.close()
  }

  if (hadIssue) {
    console.error('[shots] console errors or warnings were detected')
    process.exit(1)
  }
}

main()
