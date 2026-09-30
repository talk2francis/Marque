/**
 * The Marque whitepaper PDF (A4): a designed print document, not a screenshot of the page.
 *
 *   npx tsx scripts/whitepaper/build.mts
 *
 * The text is apps/web/app/docs/whitepaper.ts, the same source as /docs/whitepaper, so
 * the page and the PDF never drift. Brand: the traced lockup (Wordmark.tsx) on the cover,
 * on every running header and on the back cover; the Monument world plates on the covers;
 * the site's own fonts embedded. Writes apps/web/public/marque-whitepaper.pdf and
 * docs/marque-whitepaper.pdf.
 */
import { readFileSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import sharp from 'sharp'
import { PAPER, SECTIONS, ROADMAP, type Block } from '../../apps/web/app/docs/whitepaper.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WEB = resolve(ROOT, 'apps/web')
const b64 = (p: string) => readFileSync(resolve(ROOT, p)).toString('base64')
const uri = (p: string, type: string) => `data:${type};base64,${b64(p)}`
// Cover art as JPEG: Chromium embeds a JPEG as is, but stores a decoded WebP uncompressed.
const jpeg = async (p: string) => `data:image/jpeg;base64,${(await sharp(resolve(ROOT, p)).resize({ width: 1654, withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer()).toString('base64')}`
const COVER_ART = await jpeg('brand-assets/Homepage-dark-theme.png')
const BACK_ART = await jpeg('brand-assets/Homepage-light-theme.png')

// ---- brand: the traced lockup, exactly as the site draws it ----------------
const wm = readFileSync(resolve(WEB, 'app/_components/brand/Wordmark.tsx'), 'utf8')
const pick = (name: string) => wm.match(new RegExp(`const ${name} = '([^']+)'`))![1]!
const LOCKUP_PATHS = JSON.parse(wm.match(/const LOCKUP_PATHS = (\[[\s\S]*?\])\n/)![1]!) as string[]
const lockup = (fill: string, h: number) => {
  const vb = pick('LOCKUP_VIEWBOX')
  const [, , w, hh] = vb.split(' ').map(Number) as [number, number, number, number]
  return `<svg viewBox="${vb}" height="${h}" width="${Math.round((h * w) / hh)}" xmlns="http://www.w3.org/2000/svg"><g transform="${pick('LOCKUP_TRANSFORM')}" fill="${fill}">${LOCKUP_PATHS.map((d) => `<path d="${d.replace(/\n/g, ' ')}"/>`).join('')}</g></svg>`
}

const INK = '#1A1916', INK2 = '#4B4841', INK3 = '#6A665E', PAPERC = '#F7F4EE', HAIR = 'rgba(26,25,22,0.14)'
const BRONZE = '#7A6135', CHAMP = '#D6C29A', NIGHT = '#111110', MOSS = '#2F6A47', FOREST = '#1E2925'

const font = (fam: string, file: string, weight: number, style = 'normal') =>
  `@font-face{font-family:'${fam}';src:url(${uri(`apps/web/fonts/${file}`, 'font/woff2')}) format('woff2');font-weight:${weight};font-style:${style}}`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---- figures ---------------------------------------------------------------
const lifecycle = `<svg viewBox="0 0 700 150" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="General Sans">
  <line x1="40" y1="46" x2="660" y2="46" stroke="${HAIR}" stroke-width="1.5"/>
  ${[['Quote', 'agent signs', 'free, no wallet'], ['Escrow', 'buyer pays', 'exact amount'], ['Delivery', 'agent posts', 'hash on chain'], ['Rating', 'buyer rates', 'ERC-8004'], ['Settlement', 'window closes', 'or refund']]
    .map(([t, a, b], i) => `<g transform="translate(${40 + i * 155},0)">
      <circle cx="0" cy="46" r="${i === 4 ? 9 : 10}" fill="${i === 4 ? PAPERC : INK}" stroke="${INK}" stroke-width="1.5"/>
      <text x="0" y="51" text-anchor="middle" font-size="11" fill="${i === 4 ? INK : PAPERC}" font-weight="600">${i + 1}</text>
      <text x="0" y="92" text-anchor="middle" font-size="15" font-weight="600" fill="${INK}">${t}</text>
      <text x="0" y="112" text-anchor="middle" font-size="11.5" fill="${INK2}">${a}</text>
      <text x="0" y="128" text-anchor="middle" font-size="11.5" fill="${INK3}">${b}</text></g>`).join('')}
</svg>`

const block = (b: Block): string => {
  switch (b.kind) {
    case 'p': return `<p>${esc(b.text)}</p>`
    case 'list': return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((t) => `<li>${esc(t)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`
    case 'table': return `<figure class="tbl"><table><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, j) => `<td${b.mono?.includes(j) ? ' class="mono"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`
    case 'callout': return `<aside class="callout"><b>${esc(b.title)}</b><p>${esc(b.text)}</p></aside>`
    case 'figures': return `<div class="figs">${b.items.map((f) => `<div><span class="fl">${esc(f.label)}</span><span class="fv">${esc(f.value)}</span><span class="fn">${esc(f.note)}</span></div>`).join('')}</div>`
    case 'roadmap': return `<div class="rm">${b.horizons.map((h) => `<div class="rmcol" data-h="${h.key}"><div class="rmh"><i></i><b>${esc(h.title)}</b><span>${esc(h.when)}</span></div>${h.items.map((it) => `<div class="rmi"><b>${esc(it.title)}</b><p>${esc(it.text)}</p></div>`).join('')}</div>`).join('')}</div>`
  }
}

const body = SECTIONS.map((s) => {
  const extra = s.id === 'hire' ? `<figure class="diagram">${lifecycle}<figcaption>Figure 1. A hire on Marque: five steps, each a signature the buyer gives or an event anyone can open on BscScan.</figcaption></figure>` : ''
  const blocks = s.blocks.map(block)
  // The lifecycle figure sits after the section's first paragraph.
  if (extra) blocks.splice(1, 0, extra)
  return `<section class="sec${s.id === 'roadmap' ? ' sec-rm' : ''}" id="${s.id}">
    <div class="sech"><span class="secn">${s.n}</span><h2>${esc(s.title)}</h2></div>
    ${blocks.join('\n')}
    ${s.links?.length ? `<p class="links">${s.links.map((l) => `${esc(l.label)}: <span class="mono">${esc(l.href.startsWith('/') ? `marque.trade${l.href}` : l.href.replace(/^https:\/\//, ''))}</span>`).join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>` : ''}
  </section>`
}).join('\n')

const toc = SECTIONS.map((s) => `<li><span>${s.n}</span>${esc(s.title)}</li>`).join('')
const nextItems = ROADMAP.find((h) => h.key === 'next')!.items.slice(0, 3).map((i) => `<li>${esc(i.title)}</li>`).join('')

const head = `<!doctype html><html><head><meta charset="utf-8"><style>
${font('General Sans', 'GeneralSans-Regular.woff2', 400)}${font('General Sans', 'GeneralSans-Medium.woff2', 500)}${font('General Sans', 'GeneralSans-Semibold.woff2', 600)}
${font('Instrument Serif', 'instrument-serif-400-latin.woff2', 400)}${font('Instrument Serif', 'instrument-serif-400-italic-latin.woff2', 400, 'italic')}
${font('Plex Mono', 'ibm-plex-mono-400-latin.woff2', 400)}${font('Plex Mono', 'ibm-plex-mono-500-latin.woff2', 500)}
@page { size: A4; margin: 24mm 19mm 22mm; }
@page cover { margin: 0; }
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:'General Sans',Arial,sans-serif;font-size:10.2pt;line-height:1.58;color:${INK2};background:#fff}
.cover{page:cover;position:relative;width:210mm;height:297mm;overflow:hidden;background:${NIGHT};color:#EEEBE4}
.cover .img{position:absolute;inset:0;background:url(${COVER_ART}) 70% 40%/cover no-repeat}
.cover .veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(17,17,16,.72) 0%,rgba(17,17,16,.05) 34%,rgba(17,17,16,0) 52%,rgba(17,17,16,.86) 78%,${NIGHT} 100%)}
.cover .top{position:absolute;left:18mm;right:18mm;top:17mm;display:flex;justify-content:space-between;align-items:center;font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:rgba(238,235,228,.72)}
.cover .bottom{position:absolute;left:18mm;right:18mm;bottom:20mm}
.cover .kick{font-size:8pt;letter-spacing:.24em;text-transform:uppercase;color:${CHAMP};margin:0 0 5mm}
.cover h1{font-family:'Instrument Serif',serif;font-weight:400;font-size:46pt;line-height:.98;letter-spacing:-.01em;margin:0 0 6mm;color:#F3F0EA}
.cover h1 em{color:${CHAMP}}
.cover .lede{font-size:11pt;line-height:1.55;max-width:128mm;color:rgba(238,235,228,.82);margin:0 0 10mm}
.cover .meta{display:flex;gap:10mm;padding-top:5mm;border-top:1px solid rgba(238,235,228,.22);font-size:8.5pt;color:rgba(238,235,228,.7)}
.cover .meta b{display:block;color:#EEEBE4;font-weight:500;font-size:9pt}
.front{break-after:page}
.front h3,.eyebrow{font-size:7.6pt;letter-spacing:.22em;text-transform:uppercase;color:${INK3};font-weight:500;margin:0 0 4mm}
.toc{list-style:none;margin:0 0 12mm;padding:0;columns:2;column-gap:12mm}
.toc li{display:flex;gap:4mm;padding:2.2mm 0;border-bottom:1px solid ${HAIR};font-size:10.5pt;color:${INK};break-inside:avoid}
.toc li span{width:7mm;color:${BRONZE};font-variant-numeric:tabular-nums}
.glance{display:grid;grid-template-columns:1.25fr 1fr;gap:10mm}
.glance .card{padding:6mm;border:1px solid ${HAIR};border-radius:3mm;background:${PAPERC}}
.keys{margin-top:10mm;display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-top:1px solid ${INK}}
.keys div{padding:3.5mm 4mm 0 0}
.keys div+div{padding-left:4mm;border-left:1px solid ${HAIR}}
.keys b{display:block;color:${INK};font-weight:500;font-size:9.4pt;margin-bottom:1mm}
.keys span{font-size:8.4pt;color:${INK3}}
.keys .mono{font-size:7.6pt}
.glance .card.dark{background:${FOREST};border-color:${FOREST};color:#EDF0EA}
.glance .card.dark h3{color:#B3BEB6}
.glance .card.dark li{color:#EDF0EA}
.glance p{margin:0 0 3mm}
.glance ul{margin:0;padding-left:4.5mm}
.glance li{margin:0 0 1.6mm}
.pull{font-family:'Instrument Serif',serif;font-size:21pt;line-height:1.15;color:${INK};margin:0 0 5mm}
.pull em{color:${BRONZE}}
.sec{margin:0 0 9mm}
.sec-rm{break-before:page}
.sech{display:flex;align-items:baseline;gap:4mm;margin:0 0 4mm;padding-top:3mm;border-top:1.2px solid ${INK};break-after:avoid}
.secn{font-family:'Instrument Serif',serif;font-size:26pt;line-height:1;color:${BRONZE};min-width:10mm}
h2{font-family:'General Sans',sans-serif;font-weight:500;font-size:16pt;letter-spacing:-.015em;line-height:1.2;color:${INK};margin:0}
p{margin:0 0 3.2mm;orphans:3;widows:3}
ul,ol{margin:0 0 4mm;padding-left:5mm}
li{margin:0 0 1.8mm}
ul li::marker{color:${BRONZE}}
ol li::marker{color:${INK3};font-variant-numeric:tabular-nums}
.tbl{margin:3mm 0 5mm;break-inside:avoid}
table{width:100%;border-collapse:collapse;font-size:8.6pt;line-height:1.45}
th{text-align:left;font-size:6.8pt;letter-spacing:.16em;text-transform:uppercase;font-weight:500;color:${INK3};padding:0 3mm 2mm 0;border-bottom:1px solid ${INK}}
td{padding:2mm 3mm 2mm 0;border-bottom:1px solid ${HAIR};vertical-align:top}
td:first-child{color:${INK};font-weight:500}
.mono,td.mono{font-family:'Plex Mono',monospace;font-size:7.8pt;font-weight:400;word-break:break-all}
figcaption{font-size:7.8pt;color:${INK3};margin-top:2mm}
.callout{margin:3mm 0 5mm;padding:4mm 5mm;border-left:2px solid ${BRONZE};background:${PAPERC};break-inside:avoid}
.callout b{display:block;color:${INK};font-weight:500;margin-bottom:1.2mm}
.callout p{margin:0}
.figs{display:grid;grid-template-columns:repeat(4,1fr);margin:4mm 0 5mm;border-top:1px solid ${INK};break-inside:avoid}
.figs div{display:flex;flex-direction:column;gap:1mm;padding:3mm 3mm 0 0}
.figs div+div{padding-left:3mm;border-left:1px solid ${HAIR}}
.fl{font-size:6.6pt;letter-spacing:.16em;text-transform:uppercase;color:${INK3}}
.fv{font-size:22pt;font-weight:300;letter-spacing:-.02em;color:${INK};line-height:1.1}
.fn{font-size:7.6pt;color:${INK3}}
.diagram{margin:4mm 0 5mm;padding:5mm 4mm 3mm;border:1px solid ${HAIR};border-radius:2mm;background:${PAPERC};break-inside:avoid}
.links{font-size:8.2pt;color:${INK3}}
.rm{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm;margin-top:5mm}
.rmcol{border-top:1.2px solid ${HAIR};padding-top:3mm}
.rmcol[data-h=shipped]{border-top-color:${MOSS}}
.rmcol[data-h=next]{border-top-color:${BRONZE}}
.rmh{display:flex;flex-direction:column;gap:.5mm;margin-bottom:3mm}
.rmh i{width:3mm;height:3mm;border-radius:50%;border:1px solid ${INK3};margin-bottom:1.5mm}
.rmcol[data-h=shipped] .rmh i{background:${MOSS};border-color:${MOSS}}
.rmcol[data-h=next] .rmh i{background:${BRONZE};border-color:${BRONZE}}
.rmh b{font-size:12pt;font-weight:500;color:${INK}}
.rmh span{font-size:7.4pt;letter-spacing:.14em;text-transform:uppercase;color:${INK3}}
.rmi{margin:0 0 3.2mm;break-inside:avoid}
.rmi b{display:block;font-size:8.8pt;font-weight:500;color:${INK};margin-bottom:.6mm}
.rmi p{font-size:8pt;line-height:1.45;margin:0}
.back{page:cover;position:relative;width:210mm;height:297mm;overflow:hidden;background:${PAPERC}}
.back .img{position:absolute;left:0;right:0;top:0;height:170mm;background:url(${BACK_ART}) 72% 45%/cover no-repeat}
.back .veil{position:absolute;left:0;right:0;top:0;height:171mm;background:linear-gradient(180deg,rgba(247,244,238,0) 55%,${PAPERC} 100%)}
.back .txt{position:absolute;left:18mm;right:18mm;bottom:22mm}
.back .txt .pull{font-size:26pt;max-width:140mm}
.back .row{display:flex;justify-content:space-between;align-items:flex-end;padding-top:6mm;margin-top:8mm;border-top:1px solid ${HAIR};font-size:8.6pt}
.back .row b{display:block;color:${INK};font-weight:500}
</style></head><body>`
const coverHtml = `<div class="cover"><div class="img"></div><div class="veil"></div>
  <div class="top">${lockup('#EEEBE4', 30)}<span>Whitepaper · v2.0</span></div>
  <div class="bottom">
    <p class="kick">BNB Smart Chain · Agent marketplace</p>
    <h1>An agent market<br>built around <em>evidence.</em></h1>
    <p class="lede">${esc(PAPER.lede)}</p>
    <div class="meta"><div><b>Version 2.0</b>30 September 2026</div><div><b>marque.trade</b>Live on BSC mainnet</div><div><b>Source</b>github.com/talk2francis/Marque</div></div>
  </div>
</div>`
const bodyHtml = `<div class="front">
  <h3>Contents</h3>
  <ol class="toc">${toc}</ol>
  <div class="glance">
    <div class="card">
      <h3>At a glance</h3>
      <p class="pull">A registration says who an agent is. It never says <em>how good it is.</em></p>
      <p>Marque indexes every ERC-8004 agent on BNB Smart Chain, tests the ones it can reach against answers computed from chain state, and lets anyone hire them through BNB Chain's ERC-8183 escrow from their own wallet. Every step, pass and failure is on the record.</p>
    </div>
    <div class="card dark">
      <h3>What comes next</h3>
      <ul>${nextItems}</ul>
      <p style="margin-top:4mm;color:#B3BEB6">The full roadmap is section 12.</p>
    </div>
  </div>
  <div class="keys">
    <div><b>Use it</b><span>marque.trade: the marketplace, the quest, every agent's record. No wallet needed to look.</span></div>
    <div><b>Check it</b><span>Every hire is an ERC-8183 job on BNB Chain. Escrow contract <span class="mono">0xea4d…6eba6</span>, readable on BscScan.</span></div>
    <div><b>Build on it</b><span>Open source at github.com/talk2francis/Marque. Public API at marque.trade/api/v1.</span></div>
  </div>
</div>
${body}`
const backHtml = `<div class="back"><div class="img"></div><div class="veil"></div>
  <div class="txt">
    <p class="pull">Hire agents that <em>actually work.</em></p>
    <p>Try an agent free, then hire it at a live price. Your payment waits in BNB Chain's escrow contract until the work is delivered, and every step is recorded on chain.</p>
    <div class="row"><div>${lockup(INK, 26)}</div><div style="text-align:right"><b>marque.trade</b>Telegram · t.me/marque_marketplace · X · @marquetrade</div></div>
    <p style="margin-top:5mm;font-size:7.4pt;color:${INK3}">${esc(PAPER.version)} Figures are dated; the live pages are the current record. Nothing here is investment advice.</p>
  </div>
</div>`
const doc = (inner: string) => `${head}${inner}</body></html>`

const header = `<div style="width:100%;padding:0 19mm;display:flex;justify-content:space-between;align-items:center;font-family:Arial,sans-serif;font-size:7px;letter-spacing:1.6px;text-transform:uppercase;color:${INK3};-webkit-print-color-adjust:exact">
  ${lockup(INK, 11)}<span>Whitepaper · v2.0 · September 2026</span></div>`
const footer = `<div style="width:100%;padding:0 19mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif;font-size:7px;letter-spacing:1.2px;color:${INK3};-webkit-print-color-adjust:exact">
  <span>MARQUE.TRADE</span><span class="pageNumber"></span></div>`

// Three passes, merged: the covers bleed with no running header; the body carries the
// lockup header and page numbers on every page.
const browser = await chromium.launch()
const page = await browser.newPage()
const TMP = resolve(ROOT, 'node_modules/.tmp-whitepaper')
const { mkdirSync } = await import('node:fs')
mkdirSync(TMP, { recursive: true })
const parts: string[] = []
for (const [name, inner, running] of [['cover', coverHtml, false], ['body', bodyHtml, true], ['back', backHtml, false]] as const) {
  await page.setContent(doc(inner), { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  const path = resolve(TMP, `${name}.pdf`)
  await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: running, headerTemplate: running ? header : '<span></span>', footerTemplate: running ? footer : '<span></span>' })
  parts.push(path)
}
await browser.close()
const out = resolve(WEB, 'public/marque-whitepaper.pdf')
const { execFileSync } = await import('node:child_process')
execFileSync('pdfunite', [...parts, out])
copyFileSync(out, resolve(ROOT, 'docs/marque-whitepaper.pdf'))
console.log(out)
