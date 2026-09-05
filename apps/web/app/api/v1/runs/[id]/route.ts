import { NextResponse } from 'next/server'
import { readRun } from '../../../../../lib/runs'

export const dynamic = 'force-dynamic'

/**
 * The Run Room polls this.
 *
 * It returns the events as stored, with their real timestamps, and nothing
 * synthesised in between. A timeline that invents intermediate steps to look
 * busy is a fabricated metric wearing a clock.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const view = await readRun(id)
  if (!view) return NextResponse.json({ error: 'no such run' }, { status: 404 })
  return NextResponse.json({
    run: view.run,
    events: view.events,
    receipt: view.receipt ? { id: view.receipt.id, hash: view.receipt.hash } : null,
  })
}
