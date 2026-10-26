/**
 * The website's written documentation as Markdown files in the repo (docs/site), generated from the same data the
 * pages render: the FAQ, the articles (changelog, attribution, delivery status, risks, terms, privacy), the whitepaper
 * and the roadmap. `pnpm site-docs` writes them; site-docs.test.ts fails CI when a file differs from its source, so a
 * reader of the repository sees exactly what marque.trade says.
 */
import { FAQ, faqSlug } from '../app/docs/faq/faq'
import { articles } from '../app/docs/articles'
import { PAPER, ROADMAP, ROADMAP_CHECKED, SECTIONS, type Block, type Horizon } from '../app/docs/whitepaper'

const SITE = 'https://marque.trade'
const abs = (href: string) => (href.startsWith('http') ? href : `${SITE}${href}`)
const head = (title: string, path: string, note?: string) => [
  `# ${title}`, '',
  `> Mirrors [${SITE}${path}](${SITE}${path}). Generated from the same source as the page (\`pnpm site-docs\`); a test keeps the two identical.${note ? ` ${note}` : ''}`, '',
]
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

function table(h: string[], rows: string[][]): string[] {
  return [`| ${h.map(cell).join(' | ')} |`, `|${h.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`), '']
}

function roadmap(horizons: readonly Horizon[]): string[] {
  return horizons.flatMap((h) => [
    `### ${h.title} (${h.when})`, '', ...(h.lead ? [h.lead, ''] : []),
    ...h.items.map((i) => `- **${i.title}.** ${i.text}${i.exit ? ` Exit: ${i.exit}` : ''}${i.href ? ` [Open](${abs(i.href)})` : ''}`), '',
  ])
}

function block(b: Block): string[] {
  switch (b.kind) {
    case 'p': return [b.text, '']
    case 'list': return [...b.items.map((t, i) => (b.ordered ? `${i + 1}. ${t}` : `- ${t}`)), '']
    case 'table': return [...table(b.head, b.rows), ...(b.caption ? [`*${b.caption}*`, ''] : [])]
    case 'callout': return [`> **${b.title}** ${b.text}`, '']
    case 'figures': return table(['Figure', 'What', 'Note'], b.items.map((f) => [f.value, f.label, f.note]))
    case 'roadmap': return roadmap(b.horizons)
  }
}

export function faqMarkdown(): string {
  const out = [...head('Questions, answered', '/docs/faq')]
  for (const g of FAQ) {
    out.push(`## ${g.group}`, '', g.intro, '')
    for (const f of g.items) {
      out.push(`### ${f.q}`, '', `<a id="${faqSlug(f.q)}"></a>${f.a}${f.href ? ` [${f.link ?? 'More'}](${abs(f.href)})` : ''}`, '')
    }
  }
  return `${out.join('\n').trimEnd()}\n`
}

export function articleMarkdown(key: string): string {
  const a = articles[key]!
  const out = [...head(a.title, `/docs/${key}`), a.description, '']
  for (const s of a.sections) {
    out.push(`## ${s.title}`, '', ...s.paragraphs.flatMap((p) => [p, '']))
    if (s.links?.length) out.push(s.links.map((l) => `[${l.label}](${abs(l.href)})`).join(' · '), '')
  }
  return `${out.join('\n').trimEnd()}\n`
}

export function whitepaperMarkdown(): string {
  const out = [...head(PAPER.title, '/docs/whitepaper', `PDF: ${SITE}/marque-whitepaper.pdf`), `*${PAPER.label}*`, '', PAPER.lede, '', `*${PAPER.version}*`, '']
  for (const s of SECTIONS) {
    out.push(`## ${s.n}. ${s.title}`, '', ...s.blocks.flatMap(block))
    if (s.links?.length) out.push(s.links.map((l) => `[${l.label}](${abs(l.href)})`).join(' · '), '')
  }
  return `${out.join('\n').trimEnd()}\n`
}

export function roadmapMarkdown(): string {
  return `${[...head('Roadmap', '/docs/whitepaper#roadmap', `Checked ${ROADMAP_CHECKED}.`), ...roadmap(ROADMAP)].join('\n').trimEnd()}\n`
}

/** Every generated file: path under docs/site, and its content. */
export function siteDocs(): Array<{ path: string; content: string }> {
  const files = [
    { path: 'FAQ.md', content: faqMarkdown() },
    { path: 'WHITEPAPER.md', content: whitepaperMarkdown() },
    { path: 'ROADMAP.md', content: roadmapMarkdown() },
    ...Object.keys(articles).map((k) => ({ path: `${k.toUpperCase()}.md`, content: articleMarkdown(k) })),
  ]
  const index = [
    '# The website, in the repository', '',
    `Everything written on [marque.trade](${SITE}) for people, as Markdown. The files in this folder are generated from the same source as the pages, and a test fails CI if they differ. Pages built as interactive views (guides, the developer client, MCP setup, Why Marque, the Protocol) are in [pages/](pages/), captured from the live site with their capture date.`, '',
    '| File | Page |', '|---|---|',
    ...files.map((f) => `| [${f.path}](${f.path}) | ${f.content.split('\n')[0]!.replace(/^# /, '')} |`),
    '',
  ].join('\n')
  return [{ path: 'README.md', content: index }, ...files]
}
