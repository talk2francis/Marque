import { registryPortrait } from '../../../../../lib/registry-image'
import { withDeadline } from '../../../../../lib/deadline'

export const dynamic = 'force-dynamic'

/** Same-origin checked raster only. Missing artwork has no content; the avatar keeps its labelled platform fallback. */
export async function GET(_request: Request, { params }: { params: Promise<{ chainId: string; tokenId: string }> }) {
  const { chainId, tokenId } = await params
  if (!['56', '97'].includes(chainId) || !/^[1-9]\d{0,19}$/.test(tokenId)) return new Response('Not found', { status: 404 })
  const bytes = await withDeadline(registryPortrait(Number(chainId) as 56 | 97, tokenId), 5000).catch(() => null)
  const headers = { 'Cache-Control': `public, max-age=${bytes ? 600 : 60}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" }
  return bytes ? new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': 'image/webp' } }) : new Response(null, { status: 204, headers })
}
