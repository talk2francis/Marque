import { sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { db } from '@marque/db'

const dialect = new PgDialect()
const inflight = new Map<string, ReturnType<typeof executeRead>>()

async function executeRead(query: SQL, scope: 'exact' | 'catalog', options: { jit?: false } = {}) {
  return db().transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(scope === 'exact' ? sql`set local statement_timeout = '4000ms'` : sql`set local statement_timeout = '8000ms'`)
    await tx.execute(sql`set local lock_timeout = '500ms'`)
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
export function coalescedCatalogRead(query: SQL, options: { jit?: false } = {}) {
  // No completed observation is cached. Each caller still evaluates expiry and
  // capability state independently after reading the shared observation.
  const compiled = dialect.sqlToQuery(query)
  if (!compiled.params.every(value => value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) {
    return executeRead(query, 'catalog', options)
  }
  const key = JSON.stringify([options.jit ?? true, compiled.sql, compiled.params])
  const existing = inflight.get(key)
  if (existing) return existing
  const run = executeRead(query, 'catalog', options)
  inflight.set(key, run)
  run.finally(() => { if (inflight.get(key) === run) inflight.delete(key) }).catch(() => undefined)
  return run
}
