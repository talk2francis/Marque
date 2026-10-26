/**
 * Capture the website's interactive pages as Markdown in docs/site/pages: the page is rendered in a browser and its
 * main content walked into headings, paragraphs, lists, tables, code and links. Each file names its URL and capture
 * time. Re-run after a content change: node scripts/site-pages.mjs [origin]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ORIGIN = process.argv[2] ?? 'https://marque.trade'
const PAGES = [
  ['GUIDE.md', '/docs', 'How to use Marque'],
  ['DEVELOPERS.md', '/docs/developers', 'Developer read client'],
  ['SELLERS.md', '/docs/sellers', 'Seller setup and recovery'],
  ['MCP.md', '/docs/mcp', 'Marque for agents (MCP)'],
  ['WHY-MARQUE.md', '/why', 'Why Marque'],
  ['PROTOCOL.md', '/protocol', 'Protocol and contracts'],
  ['AGENT-FORGE.md', '/builders', 'The Agent Forge'],
]
const dir = join(import.meta.dirname, '..', 'docs', 'site', 'pages')
mkdirSync(dir, { recursive: true })
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const index = []
for (const [file, path, label] of PAGES) {
  const p = await ctx.newPage()
  await p.goto(ORIGIN + path, { waitUntil: 'networkidle', timeout: 120000 })
  // Open every disclosure so collapsed answers are included.
  await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true }))
  const md = await p.evaluate((origin) => {
    const main = document.querySelector('main') ?? document.body
    const skip = (el) => el.closest('nav, header[role=banner], footer, script, style, noscript, [aria-hidden=true], .sr-only, button, form')
    const inline = (node) => {
      let s = ''
      for (const c of node.childNodes) {
        if (c.nodeType === 3) s += c.textContent
        else if (c.nodeType === 1) {
          const el = c
          if (skip(el) && el !== node) continue
          const t = el.tagName
          if (t === 'A') { const h = el.getAttribute('href') ?? ''; const txt = inline(el).trim(); s += txt ? (h && !h.startsWith('#') ? `[${txt}](${h.startsWith('/') ? origin + h : h})` : txt) : '' }
          else if (t === 'CODE' && el.parentElement?.tagName !== 'PRE') s += '`' + el.textContent + '`'
          else if (t === 'STRONG' || t === 'B') { const x = inline(el).trim(); s += x ? `**${x}** ` : '' }
          else if (t === 'EM' || t === 'I') { const x = inline(el).trim(); s += x ? `*${x}*` : '' }
          else if (t === 'BR') s += ' '
          else if (!['SVG', 'IMG', 'BUTTON', 'SCRIPT', 'STYLE'].includes(t)) s += inline(el)
        }
      }
      return s.replace(/\s+/g, ' ')
    }
    const out = []
    const walk = (el) => {
      for (const c of el.children) {
        if (skip(c)) continue
        const t = c.tagName
        if (/^H[1-4]$/.test(t)) { const x = inline(c).trim(); if (x) out.push('#'.repeat(Number(t[1]) + (t === 'H1' ? 0 : 0)) + ' ' + x, '') }
        else if (t === 'P') { const x = inline(c).trim(); if (x) out.push(x, '') }
        else if (t === 'UL' || t === 'OL') { [...c.children].filter((li) => li.tagName === 'LI').forEach((li, i) => { const x = inline(li).trim(); if (x) out.push(`${t === 'OL' ? `${i + 1}.` : '-'} ${x}`) }); out.push('') }
        else if (t === 'PRE') { out.push('```', c.textContent.replace(/\n+$/, ''), '```', '') }
        else if (t === 'TABLE') {
          const rows = [...c.querySelectorAll('tr')].map((r) => [...r.children].map((td) => inline(td).trim().replace(/\|/g, '\\|')))
          if (rows.length) { out.push(`| ${rows[0].join(' | ')} |`, `|${rows[0].map(() => '---').join('|')}|`, ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`), '') }
        }
        else if (t === 'DL') { for (const d of c.querySelectorAll(':scope > div, :scope > dt')) { const dt = d.tagName === 'DT' ? d : d.querySelector('dt'); const dd = d.tagName === 'DT' ? d.nextElementSibling : d.querySelector('dd'); if (dt) out.push(`- **${inline(dt).trim()}:** ${dd ? inline(dd).trim() : ''}`) } out.push('') }
        else if (t === 'SUMMARY') { const x = inline(c).trim(); if (x) out.push(`**${x}**`, '') }
        else walk(c)
      }
    }
    walk(main)
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }, ORIGIN)
  const at = new Date().toISOString().slice(0, 16).replace('T', ' ')
  writeFileSync(join(dir, file), `> Captured from [${ORIGIN}${path}](${ORIGIN}${path}) on ${at} UTC (\`node scripts/site-pages.mjs\`). The live page is the current version.\n\n${md}\n`)
  index.push(`| [${file}](${file}) | [${label}](${ORIGIN}${path}) |`)
  console.log(file, md.length)
  await p.close()
}
writeFileSync(join(dir, 'README.md'), ['# Interactive pages, captured', '', 'Pages on marque.trade built as interactive views, captured as Markdown with their capture time. The generated documentation (FAQ, whitepaper, changelog and the rest) is one folder up and always identical to the site.', '', '| File | Page |', '|---|---|', ...index, ''].join('\n'))
await b.close()
