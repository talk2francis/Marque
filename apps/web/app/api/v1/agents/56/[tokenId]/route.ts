import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * One agent, with its full first-party evidence: every service we parsed, our
 * own probe history, and the classification with the terms that produced it.
 *
 * Probe history is returned rather than only the latest result, because "is it
 * up right now" is a weaker question than "how has it behaved".
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await params
  if (!/^[0-9]+$/.test(tokenId)) {
    return NextResponse.json({ error: 'bad_token_id' }, { status: 400 })
  }

  try {
    const d = db()
    const rows = await d.execute(sql`
      select a.*, c.category, c.confidence, c.method, c.rationale
      from agent a
      left join agent_category c on c.agent_id = a.id
      where a.chain_id = 56 and a.token_id = ${tokenId}
      limit 1
    `)
    const list = ((rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[])) as Array<Record<string, unknown>>
    const a = list[0]
    if (!a) return NextResponse.json({ error: 'not_found', chainId: 56, tokenId }, { status: 404 })

    const svc = await d.execute(sql`
      select id, kind, endpoint, resolved_endpoint, is_template, version, declared_price, source
      from agent_service where agent_id = ${a['id']} order by kind
    `)
    const probes = await d.execute(sql`
      select checked_at, ok, liveness, latency_ms, status_code, failure_class, detail, skills
      from probe where agent_id = ${a['id']} order by checked_at desc limit 20
    `)
    const unwrap = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as Array<Record<string, unknown>>

    return NextResponse.json({
      agentId: a['id'],
      chainId: 56,
      tokenId: a['token_id'],
      contractAddress: a['contract_address'],
      name: a['name'],
      description: a['description'],
      ownerAddress: a['owner_address'],
      agentWallet: a['agent_wallet'],
      imageUrl: a['image_url'],
      tags: a['tags'],
      supportedProtocols: a['supported_protocols'],
      x402Supported: a['x402_supported'],
      registryCreatedAt: a['registry_created_at'],
      classification: a['category']
        ? { category: a['category'], confidence: a['confidence'], method: a['method'], rationale: a['rationale'], provenance: 'MEASURED' }
        : null,
      services: unwrap(svc),
      // 8004scan's own verdict, returned but explicitly labelled as theirs and
      // possibly stale. Never presented as current health (AGENTS.md gotcha 6).
      registryHealth: {
        status: a['scan_health_status'],
        checkedAt: a['scan_health_checked_at'],
        parseStatus: a['scan_parse_status'],
        parseCodes: a['scan_parse_codes'],
        provenance: 'CLAIMED',
        note: 'Reported by 8004scan and may be months stale. Marque probe results are the measured source.',
      },
      probes: unwrap(probes),
      probeProvenance: 'MEASURED',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'agent_unavailable', detail: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    )
  }
}
