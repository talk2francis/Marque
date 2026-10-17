import { NextResponse } from 'next/server'
import { readReceipt } from '../../../../../lib/runs'
import { receiptEvidence } from '../../../../../lib/receipt-evidence'
import { buildReceiptBundle } from '@marque/execution'
import { checkWindow, clientKey } from '../../../../../lib/limits'
import { withDeadline } from '../../../../../lib/deadline'

export const dynamic = 'force-dynamic'

/** The receipt, whole, so anyone can recompute its hash from what we published. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = { 'Cache-Control': 'no-store' }
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) return NextResponse.json({ error: 'invalid_receipt_id' }, { status: 400, headers })
  const rate = checkWindow('receipt-read', clientKey(request.headers), 120, 60_000, 'Receipt reads are limited to 120 a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfterSeconds ?? 60) } })
  let row: Awaited<ReturnType<typeof readReceipt>>
  try { row = await withDeadline(readReceipt(id), 8000) }
  catch { return NextResponse.json({ error: 'receipt_unavailable', detail: 'The receipt could not be read. Retry later.' }, { status: 503, headers }) }
  if (!row) return NextResponse.json({ error: 'no such receipt' }, { status: 404 })
  if (new URL(request.url).searchParams.get('format') === 'bundle') {
    try { return NextResponse.json(buildReceiptBundle(row), { headers: { 'Cache-Control': 'no-store' } }) }
    catch { return NextResponse.json({ error: 'receipt_integrity_unavailable', detail: 'The preserved receipt could not be exported as a verifiable bundle.' }, { status: 422, headers: { 'Cache-Control': 'no-store' } }) }
  }
  return NextResponse.json({
    id: row.id,
    hash: row.hash,
    receipt: row.body,
    anchorTxHash: row.anchorTxHash,
    anchorBlock: row.anchorBlock,
    issuedAt: row.issuedAt,
    evidence: receiptEvidence(row),
  })
}
