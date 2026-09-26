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
const C = { ink: '#191a14', paper: '#f4f1e9', night: '#101109', nightInk: '#ece9e1', brass: '#8a6a22', brassMark: '#b0892c', brassLit: '#d9ae45' }
const geist = readFileSync(join(ROOT, 'apps/web/public/fonts/geist-latin.woff2')).toString('base64')

const mark = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 69" width="400" height="276"><title>Marque</title><g fill="${fill}"><path d="${L}"/><path d="${R}"/></g></svg>\n`
// Lockup: mark, then the wordmark set in Geist 600 (embedded), cap height matched to the mark.
const lockup = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100" width="840" height="200"><title>Marque</title>
<style>@font-face{font-family:'Geist';src:url(data:font/woff2;base64,${geist}) format('woff2');font-weight:100 900}text{font-family:'Geist',Helvetica,Arial,sans-serif;font-weight:600;letter-spacing:-1px}</style>
<g fill="${fill}" transform="translate(10 15.5) scale(1)"><path d="${L}"/><path d="${R}"/></g>
<text x="130" y="72" font-size="66" fill="${fill}">Marque</text></svg>\n`

writeFileSync(join(OUT, 'marque-mark-dark.svg'), mark(C.ink))          // dark mark, for light backgrounds
writeFileSync(join(OUT, 'marque-mark-light.svg'), mark(C.nightInk))    // light mark, for dark backgrounds
writeFileSync(join(OUT, 'marque-lockup-dark.svg'), lockup(C.ink))
writeFileSync(join(OUT, 'marque-lockup-light.svg'), lockup(C.nightInk))
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
await render(`<div style="padding:0">${lockup(C.ink).replace(/width="840" height="200"/, 'width="1680" height="400"')}</div>`, 1680, 400, 'marque-lockup-dark-vector.png', true)
await render(`<div style="padding:0">${lockup(C.nightInk).replace(/width="840" height="200"/, 'width="1680" height="400"')}</div>`, 1680, 400, 'marque-lockup-light-vector.png', true)
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
| marque-lockup-dark.svg / marque-lockup-light.svg | Vector lockup: exact mark paths, wordmark set in Geist 600 (font embedded). For print and large sizes. |
| marque-lockup-*-vector.png | The vector lockup rendered at 1680 x 400, transparent. |
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
