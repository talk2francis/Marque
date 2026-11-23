import { createHash } from 'node:crypto'
import type { ImageMime } from './image-check'

/**
 * Rebuild an uploaded image from only the parts a picture needs (23 Nov 2026).
 *
 * The bytes are never decoded into pixels here (no image library, so no decoder attack surface on the server). The
 * file's own structure is walked and re-emitted, keeping the chunks/segments that carry the picture and dropping
 * everything else:
 *  - anything after the image's end (IEND / EOI / the RIFF length): a "valid image plus a hidden file" polyglot
 *    becomes just the image, so marque.trade cannot be used to host arbitrary payloads;
 *  - metadata (EXIF with GPS, XMP, comments, text chunks) and embedded ICC profiles, a historical exploit vector;
 *  - animation (APNG frames are dropped; animated WebP is refused).
 * A file whose structure does not hold together is refused.
 */

// ------------------------------------------------------------------ PNG

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
/** Chunks needed to show the picture correctly; everything else is dropped. */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'gAMA', 'sRGB', 'cHRM', 'sBIT', 'pHYs'])

function sanitizePng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 || PNG_SIG.some((v, i) => b[i] !== v)) return null
  const out: Uint8Array[] = [b.subarray(0, 8)]
  let i = 8
  let first = true
  while (i + 12 <= b.length) {
    const len = ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!
    const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!)
    if (!/^[A-Za-z]{4}$/.test(type)) return null
    const end = i + 12 + len
    if (end > b.length) return null
    if (first && type !== 'IHDR') return null
    first = false
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, end))
    i = end
    if (type === 'IEND') return concat(out)
  }
  return null // no IEND: truncated or not a PNG
}

// ------------------------------------------------------------------ JPEG

/** Segments kept: tables, frame, scan, restart interval, JFIF (APP0) and Adobe (APP14, needed for CMYK colours). */
function keepJpegMarker(m: number): boolean {
  if (m === 0xe0 || m === 0xee) return true // APP0 JFIF, APP14 Adobe
  if (m >= 0xe1 && m <= 0xef) return false // APP1..APP15: EXIF, XMP, ICC and the rest
  if (m === 0xfe) return false // COM
  return true
}

function sanitizeJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  const out: Uint8Array[] = [b.subarray(0, 2)]
  let i = 2
  let sawFrame = false
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null
    let m = b[i + 1]!
    while (m === 0xff && i + 2 < b.length) { i++; m = b[i + 1]! } // fill bytes
    if (m === 0xd9) { // EOI: stop here, dropping any trailing bytes
      out.push(b.subarray(i, i + 2))
      return sawFrame ? concat(out) : null
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { out.push(b.subarray(i, i + 2)); i += 2; continue }
    if (i + 4 > b.length) return null
    const len = (b[i + 2]! << 8) | b[i + 3]!
    if (len < 2 || i + 2 + len > b.length) return null
    const seg = b.subarray(i, i + 2 + len)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) sawFrame = true
    if (keepJpegMarker(m)) out.push(seg)
    i += 2 + len
    if (m === 0xda) { // SOS: entropy-coded data runs to the next marker that is not stuffing or a restart
      const start = i
      while (i + 1 < b.length) {
        if (b[i] === 0xff) {
          const n = b[i + 1]!
          if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7) && n !== 0xff) break
        }
        i++
      }
      if (i + 1 >= b.length) return null // scan never ended: no EOI
      out.push(b.subarray(start, i))
    }
  }
  return null
}

// ------------------------------------------------------------------ WebP

const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH'])

function sanitizeWebp(b: Uint8Array): Uint8Array | null {
  const ascii = (i: number) => String.fromCharCode(b[i]!, b[i + 1]!, b[i + 2]!, b[i + 3]!)
  const u32le = (i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0
  if (b.length < 20 || ascii(0) !== 'RIFF' || ascii(8) !== 'WEBP') return null
  const riffEnd = 8 + u32le(4)
  if (riffEnd > b.length || riffEnd < 20) return null
  const chunks: Uint8Array[] = []
  let i = 12
  let hasImage = false
  while (i + 8 <= riffEnd) {
    const type = ascii(i)
    const len = u32le(i + 4)
    const end = i + 8 + len + (len & 1)
    if (i + 8 + len > riffEnd) return null
    if (type === 'ANIM' || type === 'ANMF') return null // animated WebP is not accepted
    if (WEBP_KEEP.has(type)) {
      const chunk = new Uint8Array(b.subarray(i, Math.min(end, riffEnd)))
      if (type === 'VP8X') {
        if (len < 10) return null
        if (chunk[8]! & 0x02) return null // animation flag
        chunk[8] = chunk[8]! & 0x10 // keep only the alpha flag: ICC, EXIF and XMP chunks are dropped
      }
      if (type === 'VP8 ' || type === 'VP8L') hasImage = true
      chunks.push(chunk)
    }
    i = end
  }
  if (!hasImage) return null
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  const size = body.length + 4
  header.set([size & 0xff, (size >>> 8) & 0xff, (size >>> 16) & 0xff, (size >>> 24) & 0xff], 4)
  header.set([0x57, 0x45, 0x42, 0x50], 8) // WEBP
  return concat([header, body])
}

// ------------------------------------------------------------------

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

/** The rebuilt image, or null when its structure does not hold together. */
export function sanitizeImage(bytes: Uint8Array, mime: ImageMime): Uint8Array | null {
  if (mime === 'image/png') return sanitizePng(bytes)
  if (mime === 'image/jpeg') return sanitizeJpeg(bytes)
  if (mime === 'image/webp') return sanitizeWebp(bytes)
  return null
}

export const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
