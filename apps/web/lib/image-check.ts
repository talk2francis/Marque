/**
 * What an uploaded image really is, read from its bytes, never from the name or the declared type.
 *
 * Only three raster formats are accepted (PNG, JPEG, WebP), so nothing that can carry script (SVG, HTML) is ever
 * stored or served. The dimensions come from the format's own header: PNG IHDR, the JPEG start-of-frame marker,
 * and the WebP VP8, VP8L or VP8X chunk.
 */
export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'
export interface ImageFacts { mime: ImageMime; width: number; height: number }

export const IMAGE_LIMITS = { maxBytes: 1_500_000, maxSide: 1024, minSide: 64 } as const

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))

function png(b: Uint8Array): ImageFacts | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length < 24 || sig.some((v, i) => b[i] !== v) || ascii(b, 12, 4) !== 'IHDR') return null
  return { mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20) }
}

function jpeg(b: Uint8Array): ImageFacts | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]!
    // Fill bytes, and markers with no length.
    if (marker === 0xff) { i++; continue }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
    const len = u16be(b, i + 2)
    if (len < 2) return null
    // Start of frame (baseline, progressive and the rest), excluding DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { mime: 'image/jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7) }
    }
    i += 2 + len
  }
  return null
}

function webp(b: Uint8Array): ImageFacts | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null
  const chunk = ascii(b, 12, 4)
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return { mime: 'image/webp', width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
    return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') return { mime: 'image/webp', width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
  return null
}

/** The image's real format and size, or a sentence saying why it is refused. */
export function inspectImage(bytes: Uint8Array): { ok: true; facts: ImageFacts } | { ok: false; detail: string } {
  if (bytes.length > IMAGE_LIMITS.maxBytes) return { ok: false, detail: `The image is ${(bytes.length / 1e6).toFixed(1)} MB; the limit is 1.5 MB.` }
  const facts = png(bytes) ?? jpeg(bytes) ?? webp(bytes)
  if (!facts) return { ok: false, detail: 'Only PNG, JPEG or WebP images are accepted.' }
  const { width, height } = facts
  if (width < IMAGE_LIMITS.minSide || height < IMAGE_LIMITS.minSide) return { ok: false, detail: `The image is ${width} by ${height} px; it needs to be at least 64 px on each side.` }
  if (width > IMAGE_LIMITS.maxSide || height > IMAGE_LIMITS.maxSide) return { ok: false, detail: `The image is ${width} by ${height} px; the limit is 1024 px on each side.` }
  return { ok: true, facts }
}
