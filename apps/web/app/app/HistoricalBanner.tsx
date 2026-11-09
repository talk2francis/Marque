import { chartersPublic } from '../../lib/charters-access'

/** The earlier policy pages, once Charters is live (03_EXPERIENCE section 2): content unchanged, one line pointing on. */
export function HistoricalBanner() {
  if (!chartersPublic()) return null
  return (
    <p role="note" style={{ margin: '0 0 20px', padding: '10px 14px', border: '1px solid var(--hair-2)', borderRadius: 10, fontSize: 14, color: 'var(--ink-2)' }}>
      Charters are live. This page keeps the earlier policy records. <a href="/charters" style={{ color: 'var(--ink)', textUnderlineOffset: 3 }}>Open Charters</a>
    </p>
  )
}
