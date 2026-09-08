import styles from './docs.module.css'

/**
 * Previous / next section links at the foot of each docs section — so the page
 * reads section by section rather than as one long scroll. Same section list as
 * the rail; kept here rather than imported so the two never drift.
 */
const ORDER: Array<{ id: string; title: string }> = [
  { id: 'what', title: 'What Marque is' },
  { id: 'categories', title: 'The four categories' },
  { id: 'finding', title: 'Finding an agent' },
  { id: 'comparing', title: 'Comparing agents' },
  { id: 'hiring', title: 'Hiring and execution' },
  { id: 'charters', title: 'Charters and revocation' },
  { id: 'mcs', title: 'The Marque Conformance Standard' },
  { id: 'builders', title: 'For builders: list your agent' },
  { id: 'api', title: 'The read API' },
  { id: 'contracts', title: 'Contracts and networks' },
  { id: 'security', title: 'Security model' },
]

export function Pager({ current }: { current: string }) {
  const i = ORDER.findIndex((s) => s.id === current)
  const prev = i > 0 ? ORDER[i - 1] : null
  const next = i >= 0 && i < ORDER.length - 1 ? ORDER[i + 1] : null

  return (
    <nav className={styles.pager} aria-label="Section navigation">
      {prev ? (
        <a href={`#${prev.id}`} className={styles.pagerPrev}>
          <span className={styles.pagerDir}>Previous</span>
          <span className={styles.pagerTitle}>{prev.title}</span>
        </a>
      ) : <span />}
      {next ? (
        <a href={`#${next.id}`} className={styles.pagerNext}>
          <span className={styles.pagerDir}>Next</span>
          <span className={styles.pagerTitle}>{next.title}</span>
        </a>
      ) : <span />}
    </nav>
  )
}
