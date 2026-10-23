import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { safeFetch } from '@marque/probe'
import { checkWindow, clientKey } from '../../../../../lib/limits'

export const dynamic = 'force-dynamic'
const H = { 'Cache-Control': 'no-store' }

/**
 * GET /api/v1/builders/registration-check?url=&sha256= (SPEC-BUILDERS 4.3): fetch a hosted registration
 * file back through safeFetch and confirm it is byte-identical to the one the Forge produced.
 */
export async function GET(req: Request) {
  const rate = checkWindow('registration-check', clientKey(req.headers), 20, 60_000, 'Limited to 20 checks a minute per connection.')
  if (!rate.ok) return NextResponse.json({ error: 'rate_limited', detail: rate.detail }, { status: 429, headers: H })
  const p = new URL(req.url).searchParams
  const url = (p.get('url') ?? '').trim()
  const want = (p.get('sha256') ?? '').toLowerCase()
  if (!/^https:\/\//i.test(url) || url.length > 500 || !/^[0-9a-f]{64}$/.test(want)) return NextResponse.json({ error: 'bad_request', detail: 'Send an https url and the sha256 of the file you expect.' }, { status: 400, headers: H })
  const r = await safeFetch(url, { timeoutMs: 5000, maxBytes: 64 * 1024 })
  if (!r.ok) return NextResponse.json({ match: false, detail: r.failure === 'timeout' ? 'No answer within 5 seconds.' : 'The file could not be fetched from a public https host.' }, { headers: H })
  if (r.status !== 200) return NextResponse.json({ match: false, detail: `The server answered HTTP ${r.status}. Put the file exactly at that path.` }, { headers: H })
  const got = createHash('sha256').update(r.body, 'utf8').digest('hex')
  return NextResponse.json(got === want
    ? { match: true, detail: `Byte-identical (${r.bytes} bytes).` }
    : { match: false, detail: 'The file is there but differs from the one shown here. Copy it again exactly, including the final newline, and check your host is not reformatting JSON.', got: got.slice(0, 12) }, { headers: H })
}
