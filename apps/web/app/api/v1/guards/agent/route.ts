import { NextResponse } from 'next/server'
import { AgentActsQuery } from '@marque/charters'
import { agentActs } from '../../../../../lib/guards'
import { gate, parseQuery, unavailable, NO_STORE } from '../../../../../lib/guards-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/guards/agent?agentId=56:0x8004...:341556 : what an agent's declared executors did, from Acted events. */
export async function GET(request: Request) {
  const blocked = gate(request, 'agent', 60)
  if (blocked) return blocked
  const q = parseQuery(request, AgentActsQuery)
  if (!q.ok) return q.response
  try { return NextResponse.json(await agentActs(q.value.agentId), { headers: NO_STORE }) } catch { return unavailable() }
}
