import { Download } from 'lucide-react'
import { DocSection, DocShell } from '../_ui/DocShell'
import { PAPER, SECTIONS, type Block } from '../whitepaper'
import styles from './whitepaper.module.css'

export const metadata = {
  title: 'Whitepaper',
  description: 'How Marque indexes BNB Chain agents, tests them against answers computed from chain state, and lets anyone hire them through ERC-8183 escrow. With the roadmap.',
}

/** The whitepaper (v2.0, 30 Sep): the same text as the PDF, from docs/whitepaper.ts. */
export default function WhitepaperPage() {
  return (
    <DocShell
      current="whitepaper"
      label={PAPER.label}
      title={PAPER.title}
      lede={PAPER.lede}
      actions={
        <>
          <a className="btn btn--primary" href="/marque-whitepaper.pdf" download><Download aria-hidden="true" size={16} /> Download the PDF</a>
          <a className="btn" href="#roadmap">Jump to the roadmap</a>
        </>
      }
      sections={SECTIONS.map(({ id, n, title }) => ({ id, label: `${n}. ${title}` }))}
    >
      {SECTIONS.map((s) => (
        <DocSection key={s.id} id={s.id} title={`${s.n}. ${s.title}`}>
          {s.blocks.map((b, i) => <BlockView key={i} b={b} />)}
          {s.links?.length ? (
            <ul className={styles.links}>
              {s.links.map((l) => <li key={l.href}><a href={l.href} {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{l.label}</a></li>)}
            </ul>
          ) : null}
        </DocSection>
      ))}
      <p className={styles.version}>{PAPER.version}</p>
    </DocShell>
  )
}

function BlockView({ b }: { b: Block }) {
  switch (b.kind) {
    case 'p': return <p>{b.text}</p>
    case 'list': {
      const L = b.ordered ? 'ol' : 'ul'
      return <L className={b.ordered ? styles.ol : styles.ul}>{b.items.map((t, i) => <li key={i}>{t}</li>)}</L>
    }
    case 'table': return (
      <figure className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={b.mono?.includes(j) ? 'mono' : undefined}>{c}</td>)}</tr>)}</tbody>
        </table>
        {b.caption ? <figcaption>{b.caption}</figcaption> : null}
      </figure>
    )
    case 'callout': return <aside className={styles.callout}><b>{b.title}</b><p>{b.text}</p></aside>
    case 'figures': return (
      <dl className={styles.figures}>
        {b.items.map((f) => <div key={f.label}><dt>{f.label}</dt><dd className={styles.figNum}>{f.value}</dd><dd className={styles.figNote}>{f.note}</dd></div>)}
      </dl>
    )
    case 'roadmap': return (
      <ol className={styles.roadmap}>
        {b.horizons.map((h) => (
          <li key={h.key} data-h={h.key}>
            <div className={styles.rmHead}><span className={styles.rmDot} aria-hidden="true" /><b>{h.title}</b><span>{h.when}</span></div>
            <ul>{h.items.map((it) => <li key={it.title}><b>{it.title}.</b> {it.text}</li>)}</ul>
          </li>
        ))}
      </ol>
    )
  }
}
