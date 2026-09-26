import { NextResponse, type NextRequest } from 'next/server'
import { agentForSheet } from '@marque/commerce'
import { hireError } from '../../../../../lib/hire-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/hire/agent?agentId=: the agent the hire sheet is about, with its last live quote. */
export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get('agentId') ?? ''
  if (agentId.length < 3 || agentId.length > 200) return NextResponse.json({ error: 'bad_request', detail: 'Name an agent.' }, { status: 400 })
  try {
    return NextResponse.json(await agentForSheet(agentId), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return hireError(err, 'agent')
  }
}
