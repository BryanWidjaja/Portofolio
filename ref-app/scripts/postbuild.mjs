// scripts/postbuild.mjs
// Called from vite.config.ts's ssgOptions.onFinished after every prerender build.
// Writes sitemap.xml and robots.txt from the site/project content. With
// dirStyle:"flat" the "404" route already prerenders straight to
// dist/404.html, which is also the filename most static hosts look for.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * @param {string} dir absolute path to the build output directory
 * @param {{ site: { url: string }, projects: { slug: string }[] }} data
 */
export async function postbuild(dir, { site, projects }) {
  const routes = ['/', '/about', ...projects.map((p) => `/projects/${p.slug}`)]
  const base = site.url.replace(/\/$/, '')

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map((route) => `  <url><loc>${base}${route}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n')
  await writeFile(path.join(dir, 'sitemap.xml'), sitemap, 'utf-8')

  const robots = [`User-agent: *`, `Allow: /`, `Disallow: /404`, ``, `Sitemap: ${base}/sitemap.xml`, ``].join('\n')
  await writeFile(path.join(dir, 'robots.txt'), robots, 'utf-8')
}
