#!/usr/bin/env node
/**
 * scripts/perf.mjs
 *
 * Round 4 performance harness. Builds (or `--skip-build`) and serves dist/
 * via `vite preview` exactly like scripts/shots.mjs, then drives headless
 * Chromium (Playwright) with a raw CDP session for `Performance.getMetrics`
 * and `Emulation.setCPUThrottlingRate`, the same pattern check-transitions.mjs
 * uses for its own page hooks. This is the one measurement tool later round-4
 * agents should reuse instead of writing ad-hoc probes — it never edits
 * anything under src/; every A/B toggle below is applied at runtime (CSS
 * injection, an attribute flip, an asset swap, or a Playwright context
 * option), the same way the task brief for this round requires.
 *
 * Usage:
 *   node scripts/perf.mjs [scenarios] [flags]
 *   node scripts/perf.mjs                                   # all 4 scenarios, fresh build
 *   node scripts/perf.mjs --scenario scroll --skip-build
 *   node scripts/perf.mjs --scenario idle-hero --label baseline --json ../notes/plan/perf-baseline.json
 *   node scripts/perf.mjs inventory                          # one-shot DOM inventory of "/"
 *
 * Positional:
 *   inventory   run the DOM-inventory mode instead of scenarios (see below)
 *
 * Flags:
 *   --scenario <list>     comma-separated: idle-hero,scroll,idle-scrolled,transition (default: all 4)
 *   --skip-build           reuse the existing dist/ instead of rebuilding
 *   --label <name>         tag printed in the table / JSON so two runs (before/after a toggle) are distinguishable
 *   --json <path>           also write the full machine-readable result here
 *   --reduced-motion        emulate `prefers-reduced-motion: reduce` (this app's own "no Lenis, no mist,
 *                            no BrushReveal canvas" code path — see LenisProvider.tsx / heroMist.ts / BrushReveal.tsx)
 *   --css <string>          inject this CSS via page.addStyleTag before the scenario runs (repeatable)
 *   --set-attr <k>=<v>      set document.documentElement.setAttribute(k, v) before the scenario runs
 *   --init-script <js>      run this JS in every frame before page scripts (page.addInitScript), so a
 *                            single library can be neutralised in isolation without a src/ edit
 *   --probe <js>            evaluate this expression in the page *after* each scenario and print the
 *                            result -- for asking "what is still running?" once a window has closed
 *                            (e.g. `--set-attr data-transition=covering` trips heroMist.ts's own built-in
 *                            transitionActive() pause, killing both the idle mist drift and the scroll-scrub
 *                            with no source edit — it's an existing, intended hook, not a hack)
 *   --swap <needle>=<file>  page.route: any request URL containing <needle> is fulfilled from local <file>
 *                            instead (e.g. swap the 3840px hero painting or the paper tile for a 1x1 asset)
 *   --cpu <rate>            CDP CPU throttle multiplier (default 4, matches the §3 baseline)
 *   --viewport <WxH>        default 1440x900 (matches the §3 baseline)
 *
 * Per scenario this reports: long tasks (count + each duration, flagging
 * any > 100ms), Performance.getMetrics deltas (TaskDuration, ScriptDuration,
 * LayoutDuration, RecalcStyleDuration/count, and TaskOther = TaskDuration -
 * Script - Layout - RecalcStyle), a requestAnimationFrame callback count
 * (window.requestAnimationFrame is wrapped via `page.addInitScript` before
 * any app code runs), and, where cheap, an inferred average frame interval.
 *
 * Deterministic and re-runnable: every toggle is applied fresh each process
 * run, nothing is left mutated in dist/ or src/.
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { preview } from 'vite'

const SCENARIOS = ['idle-hero', 'scroll', 'idle-scrolled', 'transition']

function parseArgs(argv) {
  const flags = {
    scenario: undefined,
    skipBuild: false,
    label: 'run',
    json: undefined,
    reducedMotion: false,
    css: [],
    setAttr: undefined,
    initScript: undefined,
    probe: undefined,
    swap: undefined,
    cpu: 4,
    viewport: '1440x900',
  }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--skip-build') flags.skipBuild = true
    else if (arg === '--reduced-motion') flags.reducedMotion = true
    else if (arg === '--scenario') flags.scenario = argv[++i]
    else if (arg === '--label') flags.label = argv[++i]
    else if (arg === '--json') flags.json = argv[++i]
    else if (arg === '--css') flags.css.push(argv[++i])
    else if (arg === '--set-attr') flags.setAttr = argv[++i]
    else if (arg === '--init-script') flags.initScript = argv[++i]
    else if (arg === '--probe') flags.probe = argv[++i]
    else if (arg === '--swap') flags.swap = argv[++i]
    else if (arg === '--cpu') flags.cpu = Number(argv[++i])
    else if (arg === '--viewport') flags.viewport = argv[++i]
    else positional.push(arg)
  }
  return { flags, positional }
}

const { flags, positional } = parseArgs(process.argv.slice(2))
const mode = positional[0] === 'inventory' ? 'inventory' : 'scenarios'
const wantedScenarios = flags.scenario ? flags.scenario.split(',') : SCENARIOS
for (const s of wantedScenarios) {
  if (!SCENARIOS.includes(s)) {
    console.error(`[perf] unknown scenario "${s}" — expected one of ${SCENARIOS.join(', ')}`)
    process.exit(1)
  }
}
const [VP_W, VP_H] = flags.viewport.split('x').map(Number)

function build() {
  const result = spawnSync('npm run build', { stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error('[perf] build failed')
    process.exit(1)
  }
}

// Wrapped before any app script runs, so every rAF callback the app (GSAP's
// ticker, Lenis, Cursor's own trailTick, ScrollTrigger) ever schedules is
// counted, not just ones we know the name of.
const RAF_COUNTER_INIT = `
  window.__rafCount = 0;
  window.__rafStamps = [];
  window.__longTasks = [];
  const _raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => _raf((t) => {
    window.__rafCount++;
    // Keep a bounded tail of callback timestamps so a scenario can ask the
    // question that actually matters -- "is the page still running a frame
    // loop *now*?" -- instead of only "how many frames ran in total", which
    // a settling animation inflates long after the page has gone quiet.
    const st = window.__rafStamps;
    st.push(performance.now());
    if (st.length > 600) st.splice(0, st.length - 600);
    return cb(t);
  });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch {}
`

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

async function applyToggles(page) {
  for (const css of flags.css) await page.addStyleTag({ content: css })
  if (flags.setAttr) {
    const [k, v] = flags.setAttr.split('=')
    await page.evaluate(({ k, v }) => document.documentElement.setAttribute(k, v), { k, v })
  }
}

async function setupRouteSwap(context) {
  if (!flags.swap) return
  const [needle, file] = flags.swap.split('=')
  const absFile = path.resolve(file)
  await context.route(`**/*${needle}*`, (route) => route.fulfill({ path: absFile }))
}

function metricsToMap(metrics) {
  const m = {}
  for (const { name, value } of metrics) m[name] = value
  return m
}

function diffMetrics(before, after) {
  const b = metricsToMap(before)
  const a = metricsToMap(after)
  const d = (name) => (a[name] ?? 0) - (b[name] ?? 0)
  const taskDuration = d('TaskDuration')
  const scriptDuration = d('ScriptDuration')
  const layoutDuration = d('LayoutDuration')
  const recalcStyleDuration = d('RecalcStyleDuration')
  return {
    taskDurationMs: taskDuration * 1000,
    scriptDurationMs: scriptDuration * 1000,
    layoutDurationMs: layoutDuration * 1000,
    recalcStyleDurationMs: recalcStyleDuration * 1000,
    recalcStyleCount: d('RecalcStyleCount'),
    taskOtherMs: (taskDuration - scriptDuration - layoutDuration - recalcStyleDuration) * 1000,
  }
}

async function collectLongTasksAndRaf(page) {
  const { longTasks, rafCount, rafLast1s } = await page.evaluate(() => ({
    longTasks: window.__longTasks ?? [],
    rafCount: window.__rafCount ?? 0,
    rafLast1s: (window.__rafStamps ?? []).filter((t) => t > performance.now() - 1000).length,
  }))
  return { longTasks, rafCount, rafLast1s }
}

async function resetCounters(page) {
  await page.evaluate(() => {
    window.__longTasks = []
    window.__rafCount = 0
    window.__rafStamps = []
  })
}

async function newInstrumentedContext(browser) {
  const context = await browser.newContext({
    viewport: { width: VP_W, height: VP_H },
    reducedMotion: flags.reducedMotion ? 'reduce' : 'no-preference',
  })
  await setupRouteSwap(context)
  await context.addInitScript(RAF_COUNTER_INIT)
  if (flags.initScript) await context.addInitScript({ content: flags.initScript })
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  await client.send('Performance.enable')
  await client.send('Emulation.setCPUThrottlingRate', { rate: flags.cpu })
  return { context, page, client }
}

async function loadHome(page, base) {
  await page.goto(new URL('/', base).toString(), { waitUntil: 'load' })
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready
  })
  await applyToggles(page)
  await page.waitForTimeout(1500) // let boot entrance settle before measuring
}

async function runIdleHero(browser, base) {
  const { context, page, client } = await newInstrumentedContext(browser)
  await loadHome(page, base)
  await resetCounters(page)
  const before = (await client.send('Performance.getMetrics')).metrics
  await page.waitForTimeout(3000)
  const after = (await client.send('Performance.getMetrics')).metrics
  const { longTasks, rafCount, rafLast1s } = await collectLongTasksAndRaf(page)
  const probe = flags.probe ? await page.evaluate(flags.probe).catch((e) => `probe failed: ${e.message}`) : undefined
  await context.close()
  return { name: 'idle-hero', durationMs: 3000, metrics: diffMetrics(before, after), longTasks, rafCount, rafLast1s , probe }
}

async function runScroll(browser, base) {
  const { context, page, client } = await newInstrumentedContext(browser)
  await loadHome(page, base)
  await resetCounters(page)
  const before = (await client.send('Performance.getMetrics')).metrics
  const start = Date.now()
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(150) // 30 * 150ms = 4.5s total, per the §3 baseline
  }
  const durationMs = Date.now() - start
  const after = (await client.send('Performance.getMetrics')).metrics
  const { longTasks, rafCount, rafLast1s } = await collectLongTasksAndRaf(page)
  const probe = flags.probe ? await page.evaluate(flags.probe).catch((e) => `probe failed: ${e.message}`) : undefined
  await context.close()
  return { name: 'scroll', durationMs, metrics: diffMetrics(before, after), longTasks, rafCount, rafLast1s , probe }
}

async function runIdleScrolled(browser, base) {
  const { context, page, client } = await newInstrumentedContext(browser)
  await loadHome(page, base)
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 150)
  await waitForStableScroll(page)
  await resetCounters(page)
  const before = (await client.send('Performance.getMetrics')).metrics
  await page.waitForTimeout(3000)
  const after = (await client.send('Performance.getMetrics')).metrics
  const { longTasks, rafCount, rafLast1s } = await collectLongTasksAndRaf(page)
  const probe = flags.probe ? await page.evaluate(flags.probe).catch((e) => `probe failed: ${e.message}`) : undefined
  await context.close()
  return { name: 'idle-scrolled', durationMs: 3000, metrics: diffMetrics(before, after), longTasks, rafCount, rafLast1s , probe }
}

async function runTransition(browser, base) {
  const { context, page, client } = await newInstrumentedContext(browser)
  await loadHome(page, base)
  await resetCounters(page)
  const before = (await client.send('Performance.getMetrics')).metrics
  const start = Date.now()
  await page.click('a[href="/projects/tidewater"]')
  await page.waitForFunction(() => document.documentElement.dataset.transition === 'idle', { timeout: 5000 })
  const durationMs = Date.now() - start
  const after = (await client.send('Performance.getMetrics')).metrics
  const { longTasks, rafCount, rafLast1s } = await collectLongTasksAndRaf(page)
  const probe = flags.probe ? await page.evaluate(flags.probe).catch((e) => `probe failed: ${e.message}`) : undefined
  await context.close()
  return { name: 'transition', durationMs, metrics: diffMetrics(before, after), longTasks, rafCount, rafLast1s , probe }
}

const RUNNERS = {
  'idle-hero': runIdleHero,
  scroll: runScroll,
  'idle-scrolled': runIdleScrolled,
  transition: runTransition,
}

function printScenario(result) {
  const { name, durationMs, metrics, longTasks, rafCount, rafLast1s } = result
  const over100 = longTasks.filter((t) => t.duration > 100)
  console.log(`\n[perf] [${flags.label}] ${name} (${durationMs}ms wall clock)`)
  console.log(
    `  long tasks: ${longTasks.length} (${over100.length} > 100ms)` +
      (longTasks.length ? `  durations=[${longTasks.map((t) => Math.round(t.duration)).join(', ')}]` : ''),
  )
  console.log(
    `  TaskDuration=${metrics.taskDurationMs.toFixed(0)}ms  Script=${metrics.scriptDurationMs.toFixed(0)}ms  ` +
      `Layout=${metrics.layoutDurationMs.toFixed(0)}ms  RecalcStyle=${metrics.recalcStyleDurationMs.toFixed(0)}ms ` +
      `(x${metrics.recalcStyleCount})  TaskOther=${metrics.taskOtherMs.toFixed(0)}ms`,
  )
  if (result.probe !== undefined) console.log(`  probe: ${typeof result.probe === 'string' ? result.probe : JSON.stringify(result.probe)}`)
  const perSec = (metrics.recalcStyleCount / (durationMs / 1000)).toFixed(1)
  console.log(`  rAF callbacks: ${rafCount}  (last 1s: ${rafLast1s})  (recalcs/s=${perSec})`)
}

async function runInventory(browser, base) {
  const { context, page } = await newInstrumentedContext(browser)
  await loadHome(page, base)
  const inv = await page.evaluate(() => {
    const rows = []
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el)
      const flags = []
      if (s.mixBlendMode && s.mixBlendMode !== 'normal') flags.push(`mix-blend-mode:${s.mixBlendMode}`)
      if (s.filter && s.filter !== 'none') flags.push(`filter:${s.filter}`)
      if (s.backdropFilter && s.backdropFilter !== 'none') flags.push(`backdrop-filter:${s.backdropFilter}`)
      if (s.willChange && s.willChange !== 'auto') flags.push(`will-change:${s.willChange}`)
      if (s.contentVisibility && s.contentVisibility !== 'visible') flags.push(`content-visibility:${s.contentVisibility}`)
      if (flags.length) {
        rows.push({
          tag: el.tagName.toLowerCase(),
          cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 60) : '',
          flags,
        })
      }
    }
    const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
      const r = c.getBoundingClientRect()
      return { cssW: Math.round(r.width), cssH: Math.round(r.height), backingW: c.width, backingH: c.height }
    })
    return { rows, canvasCount: canvases.length, canvases }
  })
  await context.close()

  console.log(`\n[perf] inventory of / (${inv.rows.length} flagged elements, ${inv.canvasCount} canvases)`)
  for (const r of inv.rows) console.log(`  <${r.tag} class="${r.cls}">  ${r.flags.join(', ')}`)
  for (const c of inv.canvases) {
    console.log(`  canvas css=${c.cssW}x${c.cssH} backing=${c.backingW}x${c.backingH}`)
  }
  return inv
}

async function main() {
  if (!flags.skipBuild) build()

  const server = await preview({ root: process.cwd(), preview: { port: 4173, strictPort: false } })
  const base = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4173/'
  const browser = await chromium.launch()

  try {
    if (mode === 'inventory') {
      const inv = await runInventory(browser, base)
      if (flags.json) {
        await mkdir(path.dirname(flags.json), { recursive: true })
        await writeFile(flags.json, JSON.stringify({ label: flags.label, inventory: inv }, null, 2))
        console.log(`[perf] wrote ${flags.json}`)
      }
      return
    }

    const results = []
    for (const name of wantedScenarios) {
      const result = await RUNNERS[name](browser, base)
      printScenario(result)
      results.push(result)
    }

    if (flags.json) {
      await mkdir(path.dirname(flags.json), { recursive: true })
      await writeFile(flags.json, JSON.stringify({ label: flags.label, cpu: flags.cpu, viewport: flags.viewport, results }, null, 2))
      console.log(`\n[perf] wrote ${flags.json}`)
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

main()
