import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkWindow, clientKey } from '../../../../../../lib/limits'
import { withDeadline } from '../../../../../../lib/deadline'
import { replaySuppliedAnswer } from '../../../../../../lib/bench-replay'

export const dynamic = 'force-dynamic'
const Body = z.object({ consent: z.boolean(), target: z.union([z.object({ caseId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_.:-]+$/) }).strict(), z.object({ chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string().regex(/^[1-9]\d{0,11}$/) }).strict()]), answer: z.unknown() }).strict()
const Row = z.object({ field: z.string().max(100), label: z.string().max(300), actual: z.string().max(1500).nullable(), expected: z.string().max(1500).nullable(), pass: z.boolean().nullable(), detail: z.string().max(1500) })
const Result = z.object({ kind: z.enum(['case', 'job']), at: z.string().datetime(), block: z.string().regex(/^\d+$/), source: z.string().max(200), rows: z.array(Row).max(100) })
let inFlight = 0

export async function POST(request: Request) {
  const rate = checkWindow('bench-replay', clientKey(request.headers), 6, 60_000, 'Limited to six supplied-answer replays a minute.')
  if (!rate.ok || inFlight >= 2) return NextResponse.json({ error: 'busy', detail: 'Wait before replaying another answer.' }, { status: 429, headers: { 'Retry-After': '60' } })
  const reader = request.body?.getReader()
  try {
    return await withDeadline((async () => {
      if (!reader) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
      let bytes = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true })
      while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 32 * 1024) return NextResponse.json({ error: 'too_large' }, { status: 413 }); text += decoder.decode(part.value, { stream: true }) }
      text += decoder.decode()
      const input = Body.safeParse(JSON.parse(text))
      if (!input.success || input.data.answer === undefined) return NextResponse.json({ error: 'bad_request', detail: 'Supply a recorded case or job, consent and the answer JSON.' }, { status: 400 })
      if (!input.data.consent) return NextResponse.json({ error: 'consent_required' }, { status: 428 })
      if (inFlight >= 2) return NextResponse.json({ error: 'busy' }, { status: 429 })
      inFlight++
      try { return NextResponse.json(Result.parse(await replaySuppliedAnswer(input.data.target, input.data.answer)), { headers: { 'Cache-Control': 'no-store' } }) }
      finally { inFlight-- }
    })(), 8000)
  } catch (e) {
    const code = e instanceof Error ? e.message : ''
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'bad_json' }, { status: 400 })
    if (code === 'block_mismatch') return NextResponse.json({ error: 'block_mismatch', detail: 'The supplied answer names a different block. Use the original recorded block.' }, { status: 422 })
    return NextResponse.json({ error: 'unavailable', detail: 'The recorded case or its archive read is unavailable. No original result was changed and no endpoint was called.' }, { status: 503 })
  } finally { await reader?.cancel().catch(() => {}) }
}
