#!/usr/bin/env node
/**
 * scripts/project-images.mjs
 *
 * Turns each project's master images into the files the site serves:
 * `public/projects/<slug>/<name>-{960,1600}.{avif,webp}`, plus a baked-grey
 * `-grey` twin of each cover (R4-4: what a home card's BrushReveal shows
 * until the brush paints colour in).
 *
 * Masters live in `assets/projects/<slug>/<name>.webp` (lossless-quality
 * WebP, 1600px wide), outside `public/` so they're never served. Each one
 * is real output from the project itself, never a mock-up:
 *
 *   malware-detection  cover, gallery-2: the repo's own StaticProcessor
 *                      run on a benign Windows PE (distlib's w64.exe
 *                      launcher), cells coloured on validated ramps --
 *                      the cover (51 §E5, R5e) mounts the byte, entropy
 *                      and section channels as three leaves on paper;
 *                      gallery-1: the README's architecture-comparison
 *                      table (camera-ready paper numbers) as a chart
 *   btardew-walley     cover: kept from round 5 (51 §E5, R5f) -- the day-4
 *                      Plant Farm frame's own ANSI text re-typeset as ink
 *                      on paper, pale washes on the ripe wheat (W) and
 *                      growing beetroot (b) cells. gallery-1..4: round 6's
 *                      4B ink print family (58 §F2, R6d) -- the game
 *                      driven live over stdin again, every feature its
 *                      views expose visited fresh, re-typeset the same
 *                      way: monospace #141a1e on #F2ECDE, one 1600x1000
 *                      canvas, one font size, tight centred crop, pale
 *                      washes only on what matters (animals, money). In
 *                      importance order: the Home map + HUD, the Animal
 *                      Farm map (nine sample animals), the Inventory
 *                      Menu, and the Buy Tools store.
 *                      gallery-5..12: round 6 agent F2b's "cover every
 *                      feature" correction -- one more fresh playthrough
 *                      (same JDK 21 build, dev-mode teleport + BFS-routed
 *                      walks over the grids decoded from GameMaps.java)
 *                      visiting the rest of the game's views: planting,
 *                      the grown/ripe crop, the animal harvest prompt,
 *                      the farm/seed store, the animal store, the sleep
 *                      confirmation, the login/register menu and the
 *                      tutorial's first page. Same re-typeset method, 34px
 *                      line pitch (vs the four above's 40px) so the
 *                      tutorial's 27 real lines fit the fixed canvas at
 *                      the one Consolas 30px size, no shrinking, no crop
 *                      of real content.
 *   instatags          round 6 (58 §F2, R6c/R6d): cover -- the *renewed*
 *                      Chrome extension's (instatags-ChromeExtension-
 *                      Renewed) real popup HTML, idle state, untransformed,
 *                      mounted at its own 22rem x 26rem proportions on the
 *                      same wide paper field the previous cover used.
 *                      gallery-1/2/4: the SvelteKit frontend served from
 *                      its own `npm run dev` (owner-approved) -- the
 *                      landing page, the upload page (its drop zone, not
 *                      the result screen), and the How To Use carousel.
 *                      gallery-3: the renewed extension's own loading
 *                      state (spinner + "Getting tags..."). The result
 *                      screen is skipped throughout (no backend) -- never
 *                      `output.json`, never invented tags.
 *                      Round 6 agent F2b fixed two flaws and added three
 *                      images: gallery-3 (loading) and the new gallery-5
 *                      (the extension's real "Image not found on this
 *                      page." toast, reached by stubbing only the minimal
 *                      chrome.tabs/chrome.scripting host APIs so the
 *                      popup's own click handler runs its own real
 *                      no-image branch) are now mounted the same thin-
 *                      bordered paper field as `cover`, no caption baked
 *                      in. gallery-4 (how-to-use) was recaptured after
 *                      one real click of the carousel's own "next"
 *                      control -- the vendored Carousel component clones
 *                      extra slides into the DOM *after* Siema computes
 *                      its initial transform, so the fresh-load state is
 *                      permanently off by one cloneCount (Step 6 before
 *                      Step 1, cards sliced at both edges); one click
 *                      lands it back on the correct Step-1-first reading
 *                      with zero cards cut, at a narrower 1043x900 frame
 *                      (the widest crop with no mid-card cut at this
 *                      viewport). gallery-6/7 are the About Us and
 *                      Thank You pages from the same dev server.
 *
 * To replace one: drop a new master in and re-run this.
 *
 * Usage: node scripts/project-images.mjs
 */
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const SRC = path.resolve('assets/projects')
const OUT = path.resolve('public/projects')
const WIDTHS = [960, 1600]

async function render(master, outBase, width, grey) {
  let pipeline = sharp(master).resize({ width, withoutEnlargement: false })
  if (grey) pipeline = pipeline.grayscale()
  await Promise.all([
    pipeline.clone().webp({ quality: 82, effort: 6 }).toFile(`${outBase}.webp`),
    pipeline.clone().avif({ quality: 50, effort: 6 }).toFile(`${outBase}.avif`),
  ])
}

async function main() {
  for (const slug of await readdir(SRC)) {
    const outDir = path.join(OUT, slug)
    await mkdir(outDir, { recursive: true })
    for (const file of await readdir(path.join(SRC, slug))) {
      const name = path.parse(file).name
      const master = path.join(SRC, slug, file)
      for (const width of WIDTHS) {
        await render(master, path.join(outDir, `${name}-${width}`), width, false)
        // Only the cover gets a grey twin: it's the one image shown on a
        // home card, the only place the brush paint-out runs. Project pages
        // show their images in plain colour.
        if (name === 'cover') await render(master, path.join(outDir, `${name}-${width}-grey`), width, true)
      }
      console.log(`[project-images] ${slug}/${name}`)
    }
  }
}

main().catch((err) => {
  console.error('[project-images] failed:', err)
  process.exit(1)
})
