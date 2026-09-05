import { NextResponse } from 'next/server'
import { z } from 'zod'
import { toSmallestUnit, type CharterGrant } from '@marque/mandates/types'
import { charterService, charterServiceAvailable, listCharters, readCharter, CHARTER_CHAIN_ID } from '../../../../lib/charters'
import { TEMPLATES, isCharterCategory } from '../../../../lib/charter-templates'
import { checkBurst, checkDailyCeiling, clientKey } from '../../../../lib/limits'

export const dynamic = 'force-dynamic'

/**
 * Grant a charter.
 *
 * The buyer chooses the category, the cap and the expiry. Everything else — the
 * contracts, the functions, the wording of what the agent may and may not do —
 * comes from the template, so a charter cannot be constructed with a permission
 * nobody wrote down.
 *
 * The cap is converted with toSmallestUnit, not by hand. Writing 1e8 for
 * "100 USDT" on BNB Chain sets a cap of 0.0000000001 and produces a charter
 * that can never execute — a silent failure the buyer would read as the agent
 * being broken.
 */
const grantBody = z.object({
  category: z.string().refine(isCharterCategory, 'unknown category'),
  agentId: z.string().min(1).max(200),
  agentName: z.string().max(200).nullish(),
  /** Cap in BNB, as the buyer typed it. */
  capBnb: z.number().positive().max(0.05),
  minutes: z.number().int().min(5).max(1440),
  label: z.string().max(120).nullish(),
})

export async function GET() {
  const charters = await listCharters()
  return NextResponse.json({ charters, chainId: CHARTER_CHAIN_ID })
}

export async function POST(request: Request) {
  if (!charterServiceAvailable()) {
    return NextResponse.json(
      { error: 'charters are not configured on this deployment' },
      { status: 503 },
    )
  }

  const burst = checkBurst(clientKey(request.headers))
  if (!burst.ok) {
    return NextResponse.json({ error: burst.detail }, {
      status: 429,
      headers: burst.retryAfterSeconds ? { 'Retry-After': String(burst.retryAfterSeconds) } : undefined,
    })
  }
  const daily = await checkDailyCeiling()
  if (!daily.ok) return NextResponse.json({ error: daily.detail }, { status: 429 })

  let body: z.infer<typeof grantBody>
  try {
    body = grantBody.parse(await request.json())
  } catch (err) {
    const detail = err instanceof z.ZodError
      ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'the request body could not be read'
    return NextResponse.json({ error: detail }, { status: 400 })
  }

  const template = TEMPLATES[body.category as keyof typeof TEMPLATES]
  const service = charterService()
  const owner = await service.provisionWallet({ label: 'marque-demo' })

  const grant: CharterGrant = {
    owner: owner.address,
    agentId: body.agentId,
    chainId: CHARTER_CHAIN_ID,
    expiresAt: Math.floor(Date.now() / 1000) + body.minutes * 60,
    calls: template.calls.map((c) => ({
      to: c.to,
      selectors: c.selectors,
      label: c.contract,
    })),
    spend: [{
      limit: toSmallestUnit(body.capBnb, 18),
      period: 'total',
      decimals: 18,
      symbol: 'tBNB',
    }],
  }

  try {
    const charter = await service.grant(grant, {
      agentName: body.agentName ?? null,
      grantedBy: 'visitor',
      label: body.label ?? template.name,
      category: body.category,
    })
    const view = await readCharter(charter.id)
    return NextResponse.json({ charter: view }, { status: 201 })
  } catch (err) {
    // The grant is a transaction. When it does not land, say what the chain
    // said — a charter that silently failed to exist is the one failure a
    // safety product may never paper over.
    const detail = err instanceof Error ? err.message.split('\n')[0] : String(err)
    return NextResponse.json({ error: `the grant transaction did not land: ${detail}` }, { status: 502 })
  }
}
