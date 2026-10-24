import { NextResponse } from 'next/server'
import { z } from 'zod'
import { openHeld } from '../../../../../lib/held-quote'

export const dynamic = 'force-dynamic'
const Body = z.object({ held: z.string().min(20).max(8000) })

/** POST /api/v1/hire/held: open a held quote from a plan_hire link, if Marque sealed it and it has not expired. */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const h = openHeld(p.data.held)
  if (!h) return NextResponse.json({ error: 'invalid', detail: 'This hire link was not made by Marque.' }, { status: 400 })
  if (h.quote.expiresAt - Date.now() / 1000 < 60) return NextResponse.json({ error: 'expired', detail: 'The price in this link has expired. Ask for a fresh one.', task: h.task }, { status: 410 })
  return NextResponse.json(h, { headers: { 'Cache-Control': 'no-store' } })
}
