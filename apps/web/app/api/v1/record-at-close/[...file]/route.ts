import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { CLOSE_FILES } from '../../../../../lib/close-record'

export const dynamic = 'force-dynamic'

/** Original, immutable snapshot bytes. Only the fixed public evidence files are addressable. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string[] }> }) {
  const file = (await params).file.join('/')
  if (!(CLOSE_FILES as readonly string[]).includes(file)) return new Response('Snapshot file not found.', { status: 404 })
  const roots = [resolve(process.cwd(), '../../docs/evidence/set-and-earn-close-2026-11-05'), resolve(process.cwd(), 'docs/evidence/set-and-earn-close-2026-11-05')]
  for (const root of roots) try {
    const bytes = await readFile(resolve(root, file))
    return new Response(bytes.toString('utf8'), { headers: {
      'Content-Type': file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch { /* Try the development root, then return an explicit unavailable state. */ }
  return new Response('The preserved snapshot file is unavailable.', { status: 503 })
}
