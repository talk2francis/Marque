import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkWindow, clientKey } from '../../../../lib/limits'
import { recheckJob } from '../../../../lib/recheck'
import { withDeadline } from '../../../../lib/deadline'

export const dynamic = 'force-dynamic'
const Body = z.object({ chainId: z.union([z.literal(56), z.literal(97)]), jobId: z.string().regex(/^[1-9]\d{0,11}$/) }).strict()
const headers = { 'Cache-Control': 'no-store' }

/** Read-only POST. No agent task, transaction, original-grade update or first-party observation insert. */
export async function POST(request: Request) {
  const limit = checkWindow('recheck', clientKey(request.headers), 20, 60_000, 'Limited to twenty read-only comparisons a minute per client.')
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited', detail: limit.detail }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds ?? 60) } })
  const reader = request.body?.getReader()
  try {
    return await withDeadline((async () => {
      let text = '', size = 0
      if (!reader) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers })
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 512) return NextResponse.json({ error: 'body_too_large' }, { status: 413, headers }); text += new TextDecoder().decode(part.value) } } finally { await reader.cancel().catch(() => {}) }
      const input = Body.safeParse(JSON.parse(text))
      if (!input.success) return NextResponse.json({ error: 'bad_request', detail: 'Send { chainId: 56 or 97, jobId: a job number as text }.' }, { status: 400, headers })
      const p = await recheckJob(input.data.chainId, input.data.jobId)
      return NextResponse.json(p.value, { headers: { ...headers, 'X-Marque-Recheck-Computed-At': p.computedAt, 'X-Marque-Recheck-Age-Ms': String(p.ageMs) } })
    })(), 4000)
  } catch (e) {
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'bad_request', detail: 'Send valid JSON.' }, { status: 400, headers })
    return NextResponse.json({ error: 'unavailable', detail: 'The current comparison could not be read within four seconds. The original answer and checks are unchanged.' }, { status: 503, headers })
  } finally { await reader?.cancel().catch(() => {}) }
}
