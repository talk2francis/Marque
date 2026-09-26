#!/usr/bin/env node
/**
 * P2-06: build docs/phase2/brand-kit/marque-brand-kit.zip and publish it at
 * apps/web/public/brand/marque-brand-kit.zip (served at https://marque.trade/brand/...).
 * Mark SVGs use the exact paths from apps/web/app/_components/MarqueMark.tsx; PNGs are
 * rendered from those SVGs by headless Chromium. The raster lockups are the ones extracted
 * from Francis's brand art (what the site header uses). The OG image is the live one.
 */
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/phase2/brand-kit/marque-brand-kit')
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true })
const L = 'M50 21C43 13 27 5 17 2.5C9 1 0 3 0 8.5L0 63L1 67.5C15 54 33 32 50 21Z'
const R = 'M50 21C57 13 73 5 83 2.5C91 1 100 3 100 8.5L100 63L99 67.5C85 54 67 32 50 21Z'
// Phase 2 tokens (packages/ui/src/tokens.css): Day ink and canvas, Night canvas and ink, brass per ground.
const C = { ink: '#17170F', paper: '#F2EFE7', night: '#0E0F0B', nightInk: '#ECE8DE', brass: '#8A6A22', brassMark: '#B0892C', brassLit: '#D6A64F' }
// The vector lockup and wordmark are the potrace outlines of Francis's artwork that the site
// itself renders (apps/web/app/_components/brand/Wordmark.tsx), read from that file so the kit
// and the site can never drift.
const WM = readFileSync(join(ROOT, 'apps/web/app/_components/brand/Wordmark.tsx'), 'utf8')
const grab = (name) => { const m = WM.match(new RegExp(`const ${name} = ([^\\n]+)`)); if (!m) throw new Error(`brand-kit: ${name} not found in Wordmark.tsx`); return JSON.parse(m[1].replace(/^'(.*)'$/, '"$1"')) }
const traced = (prefix, fill, w) => {
  const [x, y, vw, vh] = grab(`${prefix}_VIEWBOX`).split(' ').map(Number)
  const h = Math.round((w * vh) / vw)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${vw} ${vh}" width="${w}" height="${h}"><title>Marque</title><g fill="${fill}" transform="${grab(`${prefix}_TRANSFORM`)}">${grab(`${prefix}_PATHS`).map((d) => `<path d="${d}"/>`).join('')}</g></svg>\n`
}
const mark = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 69" width="400" height="276"><title>Marque</title><g fill="${fill}"><path d="${L}"/><path d="${R}"/></g></svg>\n`
const lockup = (fill, w = 840) => traced('LOCKUP', fill, w)
const wordmark = (fill, w = 840) => traced('WORDMARK', fill, w)

writeFileSync(join(OUT, 'marque-mark-dark.svg'), mark(C.ink))          // dark mark, for light backgrounds
writeFileSync(join(OUT, 'marque-mark-light.svg'), mark(C.nightInk))    // light mark, for dark backgrounds
writeFileSync(join(OUT, 'marque-lockup-dark.svg'), lockup(C.ink))
writeFileSync(join(OUT, 'marque-lockup-light.svg'), lockup(C.nightInk))
writeFileSync(join(OUT, 'marque-wordmark-dark.svg'), wordmark(C.ink))
writeFileSync(join(OUT, 'marque-wordmark-light.svg'), wordmark(C.nightInk))
copyFileSync(join(ROOT, 'apps/web/public/brand/lockup-ink.png'), join(OUT, 'marque-lockup-dark.png'))
copyFileSync(join(ROOT, 'apps/web/public/brand/lockup-cream.png'), join(OUT, 'marque-lockup-light.png'))

const b = await chromium.launch()
async function render(html, w, h, file, transparent = false) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  await p.setContent(`<html><body style="margin:0;${transparent ? '' : ''}">${html}</body></html>`)
  await p.waitForTimeout(150)
  await p.screenshot({ path: join(OUT, file), omitBackground: transparent })
  await p.close()
}
const square = (bg, fill, size) => `<div style="width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center">
<svg viewBox="0 0 100 69" width="${Math.round(size * 0.62)}"><g fill="${fill}"><path d="${L}"/><path d="${R}"/></g></svg></div>`
for (const size of [1024, 512]) {
  await render(square(C.paper, C.ink, size), size, size, `marque-square-${size}-light.png`)
  await render(square(C.night, C.nightInk, size), size, size, `marque-square-${size}-dark.png`)
}
const lockH = Number(lockup(C.ink, 1680).match(/height="(\d+)"/)[1])
await render(`<div style="line-height:0">${lockup(C.ink, 1680)}</div>`, 1680, lockH, 'marque-lockup-dark-vector.png', true)
await render(`<div style="line-height:0">${lockup(C.nightInk, 1680)}</div>`, 1680, lockH, 'marque-lockup-light-vector.png', true)
await b.close()

const og = await fetch('https://marque.trade/opengraph-image')
writeFileSync(join(OUT, 'marque-og-1200x630.png'), Buffer.from(await og.arrayBuffer()))

writeFileSync(join(OUT, 'BRAND.md'), `# Marque brand kit

**Name:** Marque
**One-liner:** Marque is the BNB Smart Chain agent marketplace that tests agents before you hire them, holds your payment in on-chain escrow until the work is delivered, and records every hire on chain.
**Short:** Hire BNB Chain agents that actually work, with escrowed payment and on-chain proof.
**Tagline:** Software for a more certain tomorrow.
**URL:** https://marque.trade
**X:** @marquetrade (https://x.com/marquetrade)

## Files

| File | Use |
|---|---|
| marque-mark-dark.svg / marque-mark-light.svg | The winged M. Dark on light backgrounds, light on dark. |
| marque-lockup-dark.png / marque-lockup-light.png | The official lockup (mark and wordmark) from the brand art. Prefer these. |
| marque-lockup-dark.svg / marque-lockup-light.svg | Vector lockup: an outline trace of the official lockup art, no font needed. For print and large sizes. |
| marque-wordmark-dark.svg / marque-wordmark-light.svg | The wordmark alone, outline trace of the official art. |
| marque-lockup-*-vector.png | The vector lockup rendered 1680 px wide, transparent. |
| marque-square-1024-*.png / marque-square-512-*.png | App and avatar tiles, light and dark. |
| marque-og-1200x630.png | Social share image, as served by the site. |

## Colours

| Token | Hex | Use |
|---|---|---|
| Ink | ${C.ink} | Mark and text on light |
| Paper | ${C.paper} | Light background |
| Night | ${C.night} | Dark background |
| Night ink | ${C.nightInk} | Mark and text on dark |
| Brass | ${C.brass} | Accent on light (text-safe) |
| Brass mark | ${C.brassMark} | Accent fills |
| Brass lit | ${C.brassLit} | Accent on dark |

## Type

| Family | Use |
|---|---|
| General Sans (400, 500, 600) | Everything: UI, headings, body |
| Instrument Serif (400, italic) | Statement lines only: hero, section statements |
| IBM Plex Mono (400, 500) | Hashes, addresses, prices in tables |

## Clear space and size

- Keep clear space around the mark equal to half its height on every side.
- Minimum size: mark 16 px tall on screen; lockup 24 px tall.

## Do

- Use the dark mark on Paper or light photography, the light mark on Night or dark photography.
- Keep the two wings together and level.
- Use Brass as an accent only, never for the mark itself.

## Do not

- Recolour the mark outside Ink, Night ink or pure white/black.
- Stretch, rotate, outline or add shadows or gradients to the mark.
- Separate the wings, or set the wordmark in another typeface.
- Place the mark on busy backgrounds without enough contrast.
`)

const zip = join(ROOT, 'docs/phase2/brand-kit/marque-brand-kit.zip')
execFileSync('python3', ['-c', `import zipfile,os,sys
src=sys.argv[1]; out=sys.argv[2]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(src)): z.write(os.path.join(src,f), 'marque-brand-kit/'+f)`, OUT, zip])
copyFileSync(zip, join(ROOT, 'apps/web/public/brand/marque-brand-kit.zip'))
console.log('built', zip)
