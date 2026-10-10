import { hasControlCharacters } from './request-guard'

/** Next already decoded searchParams. Never decode user input a second time. */
export function comparisonIds(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 2048) return []
  return [...new Set(value.split(',').map(id => id.trim()).filter(id =>
    id.length > 0 && id.length <= 128 && !hasControlCharacters(id),
  ))].slice(0, 3)
}

/** Apply before capability enrichment, not after resolving the whole market. */
export function selectedAgentRows<T extends { agentId: string }>(rows: readonly T[], ids: readonly string[]): T[] {
  const selected = new Set(ids)
  return rows.filter(row => selected.has(row.agentId))
}
