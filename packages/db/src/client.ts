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

/** Raw driver, for the rare query Drizzle cannot express. */
export function raw(): postgres.Sql {
  db()
  if (!sql) throw new Error('unreachable: sql initialised by db()')
  return sql
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 })
    sql = undefined
    dbInstance = undefined
  }
}
