import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { HireError, parseLane } from '@marque/commerce'
import { checkWindow, clientKey } from '../../../../lib/limits'
import { runTender, type TenderEvent } from '../../../../lib/tender'

export const dynamic = 'force-dynamic'

const Body = z.object({
  category: z.string().min(3).max(40),
  task: z.record(z.unknown()),
  lane: z.string().optional(),
})

/**
 * POST /api/v1/tender (SPEC-SUPPLY 5): one structured task to every compatible agent at once.
 * Server-Sent Events by default (start, then quote / declined / failed as each agent answers,
 * then done); `?format=json` returns the same events as one array when everything has answered.
 * Free: a quote binds nobody until the buyer's own wallet opens a job with it.
 */
export async function POST(req: NextRequest) {
  const limit = checkWindow('tender', clientKey(req.headers), 6, 60_000, 'Tenders are limited to 6 a minute.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', detail: limit.detail }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds ?? 60) } })
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'bad_request', detail: 'Send a category and the task fields.' }, { status: 400 })
  const lane = parseLane(parsed.data.lane ?? null) ?? 'mainnet'
  const gen = runTender({ category: parsed.data.category, fields: parsed.data.task, lane, source: req.headers.get('x-marque-source') === 'mcp' ? 'mcp' : 'web' })
  // The task is validated before anything is streamed, so an incomplete task is a plain 422.
  let first: IteratorResult<TenderEvent>
  try { first = await gen.next() } catch (e) {
    if (e instanceof HireError) return NextResponse.json({ error: e.code, detail: e.message }, { status: e.status })
    console.error('[api/v1/tender]', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'tender_unavailable', detail: 'Quotes could not be requested just now. Try again in a minute.' }, { status: 503 })
  }
  if (new URL(req.url).searchParams.get('format') === 'json') {
    const events: TenderEvent[] = first.done ? [] : [first.value]
    for await (const e of gen) events.push(e)
    return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: TenderEvent) => controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
      try {
        if (!first.done) send(first.value)
        for await (const e of gen) send(e)
      } catch (e) {
        controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ type: 'error', detail: e instanceof HireError ? e.message : 'The tender stopped early.' })}\n\n`))
      } finally { controller.close() }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' } })
}
