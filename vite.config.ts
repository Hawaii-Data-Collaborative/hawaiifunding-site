import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The site's pages, one folder per hawaiifunding.org address (/stateviz, /fedviz, ...), plus
// index.html for Home.
const PAGES = ['stateviz', 'fedviz', 'programid', 'database', 'methodology', 'contact']

/**
 * Fills each page's shared pieces at dev and build time:
 *   <!--header-->, <!--footer-->  the files in site/partials/
 *   {{root}}                      the relative path back to the site root ('./' or '../'), so
 *                                 links and images work at any base (a GitHub Pages project
 *                                 address or a domain root)
 *   data-page="X"                 marks the current page's nav link with aria-current="page"
 *   data-licensed                 elements showing a stock photo or icon from public/images/licensed/
 *                                 (git-ignored until the licenses are confirmed); when that folder
 *                                 isn't there, as in a GitHub build, they are left out
 */
function sitePartials(): Plugin {
  const partial = (name: string) => readFileSync(resolve(__dirname, 'site/partials', `${name}.html`), 'utf8')
  // SITE_LICENSED_IMAGES=0 builds without them even when the folder is there (to preview the
  // GitHub build locally)
  const haveLicensed =
    process.env.SITE_LICENSED_IMAGES !== '0' && existsSync(resolve(__dirname, 'public/images/licensed'))
  const dropLicensed = (html: string) =>
    haveLicensed
      ? html
      : html
          .replace(/<img data-licensed[^>]*>\s*/g, '')
          .replace(/<div class="hero__photo" data-licensed[^>]*><\/div>\s*/g, '')
  return {
    name: 'site-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!html.includes('<!--header-->')) return html
        const parts = ctx.path.replace(/^\//, '').split('/')
        const depth = parts.length - 1
        const root = depth ? '../'.repeat(depth) : './'
        const page = depth ? parts[0] : 'home'
        return dropLicensed(html)
          .replace('<!--header-->', partial('header'))
          .replace('<!--footer-->', partial('footer'))
          .replaceAll('{{root}}', root)
          .replaceAll(`data-page="${page}"`, `data-page="${page}" aria-current="page"`)
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), sitePartials()],
  // '/' locally and at a domain root; build with SITE_BASE=/hawaiifunding-site/ for a GitHub
  // Pages project address.
  base: process.env.SITE_BASE ?? '/',
  server: { port: 3001 },
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(PAGES.map(p => [p, resolve(__dirname, p, 'index.html')]))
      }
    }
  }
})
