import { NextResponse } from 'next/server'
import { readCharter } from '../../../../../lib/charters'
import { hasControlCharacters } from '../../../../../lib/request-guard'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // App Router already decoded this parameter. Decoding twice admits encoded NULs.
  if (id.length > 256 || hasControlCharacters(id)) return NextResponse.json({ error: 'invalid charter id' }, { status: 400 })
  const charter = await readCharter(id)
  if (!charter) return NextResponse.json({ error: 'no such charter' }, { status: 404 })
  return NextResponse.json({ charter })
}
