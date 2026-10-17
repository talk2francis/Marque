import 'server-only'
import { sql } from 'drizzle-orm'
import { boundedCommerceRead } from '@marque/commerce/reads'
import { ledgerOutcomeReferences } from './outcome-links'

export async function readLedgerOutcomeReferences() {
  const result = await boundedCommerceRead(sql`
    select id, benchmark_id, coalesce(job_id, manifest->>'job_id') as job_id, block_number, ran_at,
      manifest->>'chain_id' as action_chain, manifest->>'receipt_id' as receipt_id
    from benchmark_run order by id limit 201`, 'exact')
  const rows = ((result as { rows?: unknown[] }).rows ?? result) as Array<Record<string, unknown>>
  return ledgerOutcomeReferences(rows.map(r => ({
    id: r['id'], benchmarkId: r['benchmark_id'], jobId: r['job_id'],
    chainId: r['action_chain'] === '56' ? 56 : r['action_chain'] === '97' ? 97 : null,
    receiptId: r['receipt_id'], block: r['block_number'], at: new Date(String(r['ran_at'])).toISOString(),
  })), new Date().toISOString())
}
