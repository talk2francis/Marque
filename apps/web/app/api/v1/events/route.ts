import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { PRODUCT_EVENTS } from '@marque/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Anonymous product telemetry sink (P10.5J).
 *
 * Accepts one event at a time: { name, meta? }. `name` must be on the fixed
 * allowlist; `meta` is coerced to a shallow object of short string/number
 * values and capped. NOTHING identifying is read or stored — no IP, no
 * user-agent, no headers, no cookie. This exists so /status can state
 * real-world usage as a measured number, not to profile anyone.
 */
const ALLOWED = new Set<string>(PRODUCT_EVENTS)

function cleanMeta(input: unknown): Record<string, string | number> | null {
  if (!input || typeof input !== 'object') return null
  const out: Record<string, string | number> = {}
  let n = 0
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (n >= 6) break
    if (typeof k !== 'string' || k.length > 24) continue
    if (typeof v === 'number' && Number.isFinite(v)) { out[k] = v; n++ }
    else if (typeof v === 'string' && v.length <= 40) { out[k] = v; n++ }
  }
  return Object.keys(out).length ? out : null
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const { name, meta } = (body ?? {}) as { name?: unknown; meta?: unknown }
  if (typeof name !== 'string' || !ALLOWED.has(name)) {
    return NextResponse.json({ error: 'unknown event' }, { status: 422 })
  }
  try {
    const m = cleanMeta(meta)
    await db().execute(
      sql`insert into product_event (name, meta) values (${name}, ${m ? JSON.stringify(m) : null}::jsonb)`,
    )
  } catch {
    // Telemetry must never break a page. Swallow and 204.
  }
  return new NextResponse(null, { status: 204 })
}

/** A tiny public rollup, in case anyone wants the raw counts. */
export async function GET() {
  try {
    const rows = (await db().execute(sql`
      select name, count(*)::int as n, min(at) as since
      from product_event group by name order by n desc
    `)) as unknown as { rows?: Array<Record<string, unknown>> }
    const list = (rows.rows ?? []) as Array<Record<string, unknown>>
    return NextResponse.json({
      since: list.reduce<string | null>((a, r) => {
        const s = String(r['since'] ?? '')
        return !a || (s && s < a) ? s : a
      }, null),
      events: list.map((r) => ({ name: r['name'], count: Number(r['n']) })),
    })
  } catch {
    return NextResponse.json({ events: [] }, { status: 200 })
  }
}
