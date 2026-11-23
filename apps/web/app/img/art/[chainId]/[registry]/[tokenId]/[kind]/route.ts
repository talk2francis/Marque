import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { readImage } from '../../../../../../../lib/wallet-profile'

export const dynamic = 'force-dynamic'

/**
 * An agent's CURRENT portrait or banner at a stable address (23 Nov 2026). The pointer is read on each request, so a
 * page cached before a change still shows the new picture. Raster only (checked and rebuilt at upload), served with
 * its checked type, nosniff and a sandboxing policy. Browsers and the edge keep it a minute; a change purges the
 * edge copy, and the ETag lets a browser revalidate without downloading the image again.
 */
const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>
const NOT_FOUND = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30', 'X-Content-Type-Options': 'nosniff' } })

export async function GET(req: Request, { params }: { params: Promise<{ chainId: string; registry: string; tokenId: string; kind: string }> }) {
  const { chainId: chain, registry, tokenId: token, kind } = await params
  if (!/^(56|97)$/.test(chain) || !/^0x[0-9a-fA-F]{40}$/.test(registry) || !/^\d{1,78}$/.test(token) || (kind !== 'portrait' && kind !== 'banner')) return NOT_FOUND()
  const agentId = `${chain}:${registry.toLowerCase()}:${token}`
  let imageId: string | null = null
  try {
    const r = kind === 'portrait'
      ? rows(await db().execute(sql`select image_id from agent_portrait where agent_id = ${agentId} limit 1`))[0]
      : rows(await db().execute(sql`select image_id from agent_banner where agent_id = ${agentId} limit 1`))[0]
    imageId = r && /^[0-9a-f]{32}$/.test(String(r['image_id'])) ? String(r['image_id']) : null
  } catch { return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
  if (!imageId) return NOT_FOUND()
  const etag = `"${imageId}"`
  const common = {
    'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=86400',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'cross-origin',
  }
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: common })
  const img = await readImage(imageId).catch(() => null)
  if (!img) return NOT_FOUND()
  return new Response(new Uint8Array(img.bytes), { headers: { ...common, 'Content-Type': img.mime } })
}
