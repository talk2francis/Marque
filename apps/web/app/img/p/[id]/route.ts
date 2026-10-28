import { readImage } from '../../../../lib/wallet-profile'

export const dynamic = 'force-dynamic'

/**
 * A portrait an owner uploaded, by the hash of its bytes (so the URL never changes meaning and caches forever).
 * Raster only, served with its checked type, nosniff and a sandboxing policy.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const img = await readImage(id.replace(/\.(png|jpe?g|webp)$/i, '')).catch(() => null)
  if (!img) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } })
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      'Content-Type': img.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  })
}
