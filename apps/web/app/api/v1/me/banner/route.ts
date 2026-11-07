import { NextResponse } from 'next/server'
import { z } from 'zod'
import { readAgentBanner, saveAgentBanner } from '../../../../../lib/agent-banners'
import { readSession } from '../../../../../lib/wallet-profile'
import { checkClaimBurst, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const agentId = z.string().regex(/^(56|97):0x[0-9a-fA-F]{40}:(0|[1-9]\d{0,77})$/)
const body = z.object({ agentId, dataUrl: z.string().max(2_100_000).nullable() }).strict()
async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) return null
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > 2_110_000) return null
      chunks.push(part.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch { return null } finally { await reader.cancel().catch(() => undefined) }
}
const unavailable = () => NextResponse.json({ error: 'unavailable', detail: 'The banner could not be read or saved just now. Try again; no new banner is confirmed.' }, { status: 503 })

export async function GET(request: Request) {
  const input = agentId.safeParse(new URL(request.url).searchParams.get('agentId'))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'Choose an agent first.' }, { status: 400 })
  try { return NextResponse.json({ banner: await readAgentBanner(input.data.toLowerCase()) }, { headers: { 'cache-control': 'no-store' } }) } catch { return unavailable() }
}

export async function PUT(request: Request) {
  const session = readSession(request.headers.get('authorization'))
  if (!session) return NextResponse.json({ error: 'sign_in', detail: 'Sign in with the agent owner wallet to change its banner.' }, { status: 401 })
  const limit = checkClaimBurst(`banner:${session.address}:${clientKey(request.headers)}`)
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', detail: limit.detail }, { status: 429 })
  const input = body.safeParse(await readBody(request))
  if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'Choose the agent and a banner under 1.5 MB, or remove its existing banner.' }, { status: 400 })
  try {
    const saved = await saveAgentBanner(session, input.data.agentId.toLowerCase(), input.data.dataUrl)
    if (!saved.ok) return NextResponse.json({ error: 'refused', detail: saved.detail }, { status: saved.status })
    return NextResponse.json({ banner: saved.banner }, { headers: { 'cache-control': 'no-store' } })
  } catch { return unavailable() }
}
