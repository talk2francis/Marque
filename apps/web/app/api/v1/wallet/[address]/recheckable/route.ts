import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db, cachedProjection } from '@marque/db'
import { checkWindow, clientKey } from '../../../../../../lib/limits'
import { RecheckIndex } from '../../../../../../lib/recheck-schema'

export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const address = (await params).address.toLowerCase(), cursor = new URL(request.url).searchParams.get('cursor') ?? '0'
  if (!/^0x[0-9a-f]{40}$/.test(address) || !/^(0|[1-9]\d{0,4})$/.test(cursor)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const limit = checkWindow('recheck-index', clientKey(request.headers), 60, 60_000, 'Wait before reading this index again.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 60) } })
  try {
    const offset = Number(cursor)
    const p = await cachedProjection(`recheck-index:v1:${address}:${offset}`, () => db().transaction(async tx => {
      await tx.execute(sql`set transaction read only`)
      await tx.execute(sql`set local statement_timeout = '1500ms'`)
      const cohort = sql`from lens_result l join commerce_job j on j.chain_id = l.chain_id and j.job_id = l.job_id
        where j.client = ${address} and j.chain_id in (56,97) and j.state in ('SUBMITTED','COMPLETED','PAID')
        and l.block ~ '^[1-9][0-9]*$' and case when jsonb_typeof(l.checks) = 'array' then jsonb_array_length(l.checks) > 0 else false end`
      const raw = await tx.execute(sql`select count(*)::int as total ${cohort}`)
      const totals = ((raw as unknown as { rows?: Array<{ total: number }> }).rows ?? raw as unknown as Array<{ total: number }>)
      const rows = await tx.execute(sql`select j.chain_id as "chainId", j.job_id::text as "jobId", l.block as "answerBlock",
        (select min(e.block_time) from commerce_event e where e.chain_id = j.chain_id and e.job_id = j.job_id and e.name = 'JobSubmitted') as "answeredAt"
        ${cohort} order by l.computed_at desc, j.chain_id, j.job_id desc limit 20 offset ${offset}`)
      const list = ((rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? rows as unknown as Array<Record<string, unknown>>).map(r => ({ ...r, answeredAt: r.answeredAt ? new Date(String(r.answeredAt)).toISOString() : null }))
      const total = totals[0]?.total ?? 0
      return RecheckIndex.parse({ address, total, observedAt: new Date().toISOString(), rows: list, nextCursor: offset + list.length < total ? String(offset + list.length) : null })
    }), { freshMs: 60_000, timeoutMs: 2000 })
    return NextResponse.json(p.value, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'unavailable', detail: 'The recorded-answer index could not be read.' }, { status: 503 }) }
}
