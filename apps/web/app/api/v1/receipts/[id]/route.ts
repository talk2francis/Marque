import { NextResponse } from 'next/server'
import { readReceipt } from '../../../../../lib/runs'

export const dynamic = 'force-dynamic'

/** The receipt, whole, so anyone can recompute its hash from what we published. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await readReceipt(id)
  if (!row) return NextResponse.json({ error: 'no such receipt' }, { status: 404 })
  return NextResponse.json({
    id: row.id,
    hash: row.hash,
    receipt: row.body,
    anchorTxHash: row.anchorTxHash,
    anchorBlock: row.anchorBlock,
    issuedAt: row.issuedAt,
  })
}
