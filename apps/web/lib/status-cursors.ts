import { sql } from 'drizzle-orm'

/** Operational progress only. Per-identity checkpoints stay stored and are summarized below. */
export const STATUS_CURSOR_SOURCES = ['scan:list:56', 'scan:deep:56', 'chain:identity:56', 'registry:uri-events:56', 'registry:services-walk'] as const

export function statusCursorsQuery() {
  return sql`select source, cursor, updated_at from ingest_cursor
    where source in (${sql.join(STATUS_CURSOR_SOURCES.map(source => sql`${source}`), sql`, `)}) order by source`
}

export function serviceReconciliationQuery() {
  return sql`select count(*) filter (where source like 'registry:services:%')::int as snapshots,
    count(*) filter (where source like 'registry:services-attempt:%')::int as attempts,
    count(*) filter (where source like 'registry:services-pending:%' and cursor > 0)::int as pending,
    max(updated_at) filter (where source like 'registry:services:%') as last_snapshot
    from ingest_cursor where source like 'registry:services:%' or source like 'registry:services-attempt:%'
      or source like 'registry:services-pending:%'`
}

export function cursorReading(source: string, updatedAt: unknown, now = Date.now()) {
  const labels: Record<string, string> = {
    'scan:list:56': 'Registry listing offset',
    'scan:deep:56': 'Deep registry listing offset',
    'chain:identity:56': 'Identity token scan',
    'registry:uri-events:56': 'URI updates indexed to block',
    'registry:services-walk': 'Service reconciliation position',
  }
  const at = updatedAt instanceof Date ? updatedAt.getTime() : Date.parse(String(updatedAt))
  const minutes = (now - at) / 60_000
  const budget = source.startsWith('registry:') ? 20 : 120
  return {
    label: labels[source] ?? source,
    text: !Number.isFinite(minutes) ? 'unknown' : minutes < 1 ? 'just now' : minutes < 60 ? `${Math.round(minutes)} min ago` : `${(minutes / 60).toFixed(1)} h ago`,
    stale: !Number.isFinite(minutes) || minutes > budget,
  }
}
