import { closeCache } from './cache.js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

let sql: postgres.Sql | undefined
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url
}

/** Lazily-created singleton. Safe to import from anywhere; connects on first use. */
export function db() {
  if (!dbInstance) {
    sql = postgres(connectionString(), {
      max: Number(process.env.PGPOOL_MAX ?? 10),
      idle_timeout: 30,
      connect_timeout: 10,
      onnotice: () => {},
    })
    dbInstance = drizzle(sql, { schema })
  }
  return dbInstance
}

let chartersSql: postgres.Sql | undefined
let chartersInstance: ReturnType<typeof drizzle<typeof schema>> | undefined

/**
 * The Charters tables' database. CHARTERS_DATABASE_URL when set (before launch, the dark worker writes to its own
 * database), otherwise the main one. A small pool of its own, so charter reads can never starve the site.
 */
export function chartersDb() {
  const own = process.env.CHARTERS_DATABASE_URL
  if (!own || own === process.env.DATABASE_URL) return db()
  if (!chartersInstance) {
    chartersSql = postgres(own, { max: Number(process.env.CHARTERS_PGPOOL_MAX ?? 4), idle_timeout: 30, connect_timeout: 10, onnotice: () => {} })
    chartersInstance = drizzle(chartersSql, { schema })
  }
  return chartersInstance
}

/** Raw driver, for the rare query Drizzle cannot express. */
export function raw(): postgres.Sql {
  db()
  if (!sql) throw new Error('unreachable: sql initialised by db()')
  return sql
}

export async function closeDb(): Promise<void> {
  // The projection cache's Redis connection would otherwise keep a script alive.
  await closeCache()
  if (sql) {
    await sql.end({ timeout: 5 })
    sql = undefined
    dbInstance = undefined
  }
  if (chartersSql) {
    await chartersSql.end({ timeout: 5 })
    chartersSql = undefined
    chartersInstance = undefined
  }
}
