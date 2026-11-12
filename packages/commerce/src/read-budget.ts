import { sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { db } from '@marque/db'

const dialect = new PgDialect()
const inflight = new Map<string, ReturnType<typeof executeRead>>()

async function executeRead(query: SQL, scope: 'exact' | 'catalog', options: { jit?: false; timeoutMs?: number } = {}) {
  return db().transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    // A background projection refresh (nobody waits on it) may take a longer, still bounded, budget.
    const ms = options.timeoutMs && options.timeoutMs > 0 && options.timeoutMs <= 60_000 ? Math.round(options.timeoutMs) : scope === 'exact' ? 4000 : 8000
    await tx.execute(sql`select set_config('statement_timeout', ${`${ms}ms`}, true), set_config('lock_timeout', '500ms', true)`)
    // Compilation can dominate discovery's indexed single-row lookups. This
    // opt-in policy ends with the read-only transaction; other reads keep JIT.
    if (options.jit === false) await tx.execute(sql`set local jit = 'off'`)
    return tx.execute(query)
  })
}

/** Read-only statement bounds. HTTP deadlines do not cancel background SQL. */
export function boundedCommerceRead(query: SQL, scope: 'exact' | 'catalog' = 'catalog') {
  return executeRead(query, scope)
}

/** Opt-in for catalog projections that consume rows without mutating them. */
export function coalescedCatalogRead(query: SQL, options: { jit?: false; timeoutMs?: number } = {}) {
  return coalescedRead(query, 'catalog', options)
}

/** Share only overlapping exact reads; completed observations are never retained. */
export function coalescedExactRead(query: SQL) {
  return coalescedRead(query, 'exact')
}

function coalescedRead(query: SQL, scope: 'exact' | 'catalog', options: { jit?: false; timeoutMs?: number } = {}) {
  // No completed observation is cached. Each caller still evaluates expiry and
  // capability state independently after reading the shared observation.
  const compiled = dialect.sqlToQuery(query)
  if (!compiled.params.every(value => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) {
    return executeRead(query, scope, options)
  }
  const key = JSON.stringify([scope, options.jit ?? true, options.timeoutMs ?? 0, compiled.sql, compiled.params])
  const existing = inflight.get(key)
  if (existing) return existing
  const run = executeRead(query, scope, options)
  inflight.set(key, run)
  run.finally(() => { if (inflight.get(key) === run) inflight.delete(key) }).catch(() => undefined)
  return run
}
