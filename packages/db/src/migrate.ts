import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const sql = postgres(url, { max: 1 })
  await migrate(drizzle(sql), { migrationsFolder: join(here, '..', 'drizzle') })
  await sql.end()
  console.log('migrations applied')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
