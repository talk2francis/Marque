import { NextResponse } from 'next/server'
import { readReceipt } from '../../../../../lib/runs'
import { receiptEvidence } from '../../../../../lib/receipt-evidence'
import { buildReceiptBundle } from '@marque/execution'

export const dynamic = 'force-dynamic'

/** The receipt, whole, so anyone can recompute its hash from what we published. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await readReceipt(id)
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
