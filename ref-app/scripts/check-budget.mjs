#!/usr/bin/env node
/**
 * scripts/check-budget.mjs
 *
 * Perf budget gate (spec §10 / 13-build-plan.md §E6): sums the gzip size of
 * every JS file transitively reachable from the "index.html" entry in
 * Vite's build manifest -- the entry chunk plus its static and dynamic
 * imports. react-dom/client is a *dynamic* import in this build (see
 * dist/.vite/manifest.json), but it still has to load on first paint to
 * hydrate, so it counts toward the real cost of first visit. Exits 1 if the
 * total exceeds the ~182KB gzip budget (raised from 180 by the owner,
 * 45-ink-approved.md §Round 5 R5h, to cover the tone registry and the
 * project-video player).
 *
 * Usage: node scripts/check-budget.mjs [--budget <kb>]
 * Run `npm run build` first -- this reads dist/.vite/manifest.json.
 */
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const DEFAULT_BUDGET_KB = 182

function parseArgs(argv) {
  let budgetKb = DEFAULT_BUDGET_KB
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--budget') budgetKb = Number(argv[++i])
  }
  return { budgetKb }
}

async function main() {
  const { budgetKb } = parseArgs(process.argv.slice(2))
  const distDir = path.resolve('dist')
  const manifestPath = path.join(distDir, '.vite', 'manifest.json')

  let manifest
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
  } catch {
    console.error(`[check-budget] couldn't read ${manifestPath} -- run \`npm run build\` first`)
    process.exit(1)
  }

  const entry = manifest['index.html']
  if (!entry) {
    console.error('[check-budget] no "index.html" entry in dist/.vite/manifest.json')
    process.exit(1)
  }

  const visited = new Set()
  const jsFiles = new Set()

  function collect(key) {
    if (visited.has(key)) return
    visited.add(key)
    const item = manifest[key]
    if (!item) return
    if (item.file?.endsWith('.js')) jsFiles.add(item.file)
    for (const dep of [...(item.imports ?? []), ...(item.dynamicImports ?? [])]) collect(dep)
  }
  collect('index.html')

  const rows = []
  let totalBytes = 0
  for (const file of jsFiles) {
    const buf = await readFile(path.join(distDir, file))
    const gzipBytes = gzipSync(buf, { level: 9 }).length
    totalBytes += gzipBytes
    rows.push({ file, gzipBytes })
  }
  rows.sort((a, b) => b.gzipBytes - a.gzipBytes)

  for (const { file, gzipBytes } of rows) {
    console.log(`[check-budget] ${file}: ${(gzipBytes / 1000).toFixed(2)} kB gzip`)
  }

  const totalKb = totalBytes / 1000
  const budgetBytes = budgetKb * 1000
  console.log(`[check-budget] total: ${totalKb.toFixed(2)} kB gzip (budget ${budgetKb} kB)`)

  if (totalBytes > budgetBytes) {
    console.error(`[check-budget] over budget by ${(totalKb - budgetKb).toFixed(2)} kB`)
    process.exit(1)
  }
}

main()
