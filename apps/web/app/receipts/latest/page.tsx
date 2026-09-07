import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'
import { db, receipt as receiptTable } from '@marque/db'

export const dynamic = 'force-dynamic'

/**
 * A stable link the footer can point at (P10.5D item 5): jumps to the most
 * recent public receipt, or the judge flow if none has settled yet.
 */
export default async function LatestReceipt() {
  const [row] = await db()
    .select({ id: receiptTable.id })
    .from(receiptTable)
    .orderBy(desc(receiptTable.issuedAt))
    .limit(1)
  redirect(row ? `/receipts/${row.id}` : '/judge')
}
