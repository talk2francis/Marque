import { NextResponse } from 'next/server'
import { readCharter } from '../../../../../lib/charters'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const charter = await readCharter(decodeURIComponent(id))
  if (!charter) return NextResponse.json({ error: 'no such charter' }, { status: 404 })
  return NextResponse.json({ charter })
}
