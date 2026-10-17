import { sql, type SQL } from 'drizzle-orm'
import { db } from '@marque/db'

/** Read-only statement bounds. HTTP deadlines do not cancel background SQL. */
export async function boundedCommerceRead(query: SQL, scope: 'exact' | 'catalog' = 'catalog') {
  return db().transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(scope === 'exact' ? sql`set local statement_timeout = '4000ms'` : sql`set local statement_timeout = '8000ms'`)
    await tx.execute(sql`set local lock_timeout = '500ms'`)
    return tx.execute(query)
  })
}
