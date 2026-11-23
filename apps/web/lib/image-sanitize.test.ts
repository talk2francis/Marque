import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { sanitizeImage } from './image-sanitize'
import { inspectImage, type ImageMime } from './image-check'

/** Real images made by an image library, with EXIF (incl. GPS-style tags) attached, so the test sees real structure. */
async function make(format: 'png' | 'jpeg' | 'webp', opts: { alpha?: boolean; progressive?: boolean } = {}): Promise<Uint8Array> {
  const base = sharp({ create: { width: 96, height: 80, channels: opts.alpha ? 4 : 3, background: opts.alpha ? { r: 40, g: 90, b: 160, alpha: 0.6 } : '#2a5aa0' } })
    .composite([{ input: Buffer.from('<svg width="96" height="80"><rect x="10" y="10" width="40" height="30" fill="#e0b050"/></svg>'), top: 0, left: 0 }])
    .withExif({ IFD0: { Copyright: 'secret-owner-name', ImageDescription: 'GPS 6.5244N 3.3792E' } })
  const img = format === 'png' ? base.png() : format === 'jpeg' ? base.jpeg({ progressive: opts.progressive ?? false }) : base.webp({ lossless: true })
  return new Uint8Array(await img.toBuffer())
}

const MIME: Record<'png' | 'jpeg' | 'webp', ImageMime> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }
const PAYLOAD = Buffer.from('<html><script>alert(document.domain)</script></html>PK\u0003\u0004hidden-zip')
const includes = (hay: Uint8Array, needle: string) => Buffer.from(hay).includes(Buffer.from(needle))
const pixels = async (b: Uint8Array) => (await sharp(Buffer.from(b)).raw().toBuffer({ resolveWithObject: true }))

describe('sanitizeImage (23 Nov 2026 upload hardening)', () => {
  for (const [format, opts] of [['png', {}], ['png', { alpha: true }], ['jpeg', {}], ['jpeg', { progressive: true }], ['webp', {}], ['webp', { alpha: true }]] as const) {
    it(`${format}${'alpha' in opts ? ' with alpha' : ''}${'progressive' in opts ? ' progressive' : ''}: keeps the picture, drops metadata and a trailing payload`, async () => {
      const original = await make(format, opts)
      expect(includes(original, 'secret-owner-name')).toBe(true) // the fixture really carries EXIF
      const polyglot = new Uint8Array(Buffer.concat([Buffer.from(original), PAYLOAD]))
      expect(inspectImage(polyglot).ok).toBe(true) // the old check alone accepted this
      const clean = sanitizeImage(polyglot, MIME[format])!
      expect(clean).not.toBeNull()
      expect(includes(clean, '<script>')).toBe(false)
      expect(includes(clean, 'hidden-zip')).toBe(false)
      expect(includes(clean, 'secret-owner-name')).toBe(false)
      expect(includes(clean, 'GPS 6.5244N')).toBe(false)
      expect(clean.length).toBeLessThan(polyglot.length)
      // Same picture, pixel for pixel.
      const [a, b] = await Promise.all([pixels(original), pixels(clean)])
      expect(b.info.width).toBe(a.info.width)
      expect(b.info.height).toBe(a.info.height)
      expect(Buffer.compare(a.data, b.data)).toBe(0)
      expect(inspectImage(clean).ok).toBe(true)
    })
  }

  it('refuses truncated or structurally broken files', async () => {
    for (const format of ['png', 'jpeg', 'webp'] as const) {
      const good = await make(format)
      expect(sanitizeImage(good.subarray(0, Math.floor(good.length / 2)), MIME[format])).toBeNull()
    }
    expect(sanitizeImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBeNull()
    expect(sanitizeImage(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg')).toBeNull() // no frame
  })

  it('refuses animated WebP (a VP8X header with the animation flag, or ANIM/ANMF chunks)', () => {
    const vp8x = Buffer.alloc(30)
    vp8x.write('RIFF', 0); vp8x.writeUInt32LE(22, 4); vp8x.write('WEBP', 8); vp8x.write('VP8X', 12); vp8x.writeUInt32LE(10, 16); vp8x[20] = 0x02
    expect(sanitizeImage(new Uint8Array(vp8x), 'image/webp')).toBeNull()
    const anim = Buffer.alloc(26)
    anim.write('RIFF', 0); anim.writeUInt32LE(18, 4); anim.write('WEBP', 8); anim.write('ANIM', 12); anim.writeUInt32LE(6, 16)
    expect(sanitizeImage(new Uint8Array(anim), 'image/webp')).toBeNull()
  })
})
