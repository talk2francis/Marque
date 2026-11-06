import 'server-only'
import sharp from 'sharp'
import { sql } from 'drizzle-orm'
import { db } from '@marque/db'
import { safeFetch } from '@marque/probe'
import { network } from '@marque/commerce'
import { inspectImage } from './image-check'

const MAX_BYTES = 1_500_000

/** SVG is never sent to a browser. Reject active/external resources before rasterizing. */
export async function registryImageRaster(bytes: Uint8Array, contentType: string): Promise<Uint8Array | null> {
  if (!bytes.length || bytes.length > MAX_BYTES) return null
  if (contentType.split(';')[0]?.trim().toLowerCase() === 'image/svg+xml') {
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return null }
    if (!/^(?:\s*<\?xml[^?]*\?>)?\s*<svg\b/i.test(text)
      || /<!DOCTYPE|<!ENTITY|<(?:script|foreignObject|iframe|object|embed|image|audio|video)\b|\bon[a-z]+\s*=|@import|&#|&[a-z]+;|\\/i.test(text)
      || /\b(?:href|src)\s*=\s*["'](?!#)/i.test(text)
      || /\burl\(\s*["']?(?!#)/i.test(text)) return null
  } else if (!inspectImage(bytes).ok) return null
  try {
    const image = await sharp(bytes, { limitInputPixels: 4_194_304, pages: 1 })
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .timeout({ seconds: 2 }).webp({ quality: 82 }).toBuffer()
    return image.length <= 512 * 1024 ? new Uint8Array(image) : null
  } catch { return null }
}

const cached = new Map<string, { until: number; bytes: Uint8Array | null }>()
const pending = new Map<string, Promise<Uint8Array | null>>()

/** Current declared artwork, with a bounded fallback when the indexer's image is missing. No registry row is edited. */
export async function registryPortrait(chainId: 56 | 97, tokenId: string): Promise<Uint8Array | null> {
  const key = `${chainId}:${tokenId}`, known = cached.get(key)
  if (known && known.until > Date.now()) return known.bytes
  const running = pending.get(key)
  if (running) return running
  if (pending.size >= 32) return null
  const work = (async () => {
    const rows = await db().transaction(async tx => {
      await tx.execute(sql`set transaction read only`)
      await tx.execute(sql`set local statement_timeout = '1500ms'`)
      return tx.execute(sql`select image_url, raw_metadata #>> '{offchain_content,image}' as declared_image
        from agent where id = ${`${chainId}:${network(chainId).identityRegistry.toLowerCase()}:${tokenId}`}
        and chain_id = ${chainId} and token_id = ${tokenId} limit 1`)
    }) as unknown as Array<{ image_url: string | null; declared_image: string | null }>
    const row = rows[0]
    let image: Uint8Array | null = null
    for (const url of [...new Set([row?.image_url, row?.declared_image])]) {
      if (!url || !/^https:\/\//i.test(url) || url.length > 2048) continue
      const result = await safeFetch(url, { responseType: 'bytes', maxBytes: MAX_BYTES, timeoutMs: 2000, maxRedirects: 2, headers: { accept: 'image/webp,image/png,image/jpeg,image/svg+xml' } })
      if (!result.ok || result.status !== 200 || !result.bodyBytes) continue
      image = await registryImageRaster(result.bodyBytes, result.headers['content-type'] ?? '')
      if (image) break
    }
    cached.set(key, { until: Date.now() + (image ? 600_000 : 60_000), bytes: image })
    if (cached.size > 64) cached.delete(cached.keys().next().value!)
    return image
  })().catch(() => null).finally(() => { pending.delete(key) })
  pending.set(key, work)
  return work
}
