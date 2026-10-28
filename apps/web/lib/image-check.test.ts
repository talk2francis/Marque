import { describe, expect, it } from 'vitest'
import { inspectImage } from './image-check'

const png = (w: number, h: number) => {
  const b = new Uint8Array(64)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h)
  return b
}
const jpeg = (w: number, h: number) => {
  // SOI, an APP0 segment, then SOF0 with height and width.
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0)]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, ...Array(9).fill(0)]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0, 0, 0, 0])
}
const webpLossless = (w: number, h: number) => {
  const b = new Uint8Array(40)
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8); b.set([...'VP8L'].map((c) => c.charCodeAt(0)), 12)
  b[20] = 0x2f
  const bits = (w - 1) | ((h - 1) << 14)
  b[21] = bits & 255; b[22] = (bits >> 8) & 255; b[23] = (bits >> 16) & 255; b[24] = (bits >>> 24) & 255
  return b
}

describe('inspectImage', () => {
  it('reads PNG, JPEG and WebP sizes from their own headers', () => {
    expect(inspectImage(png(512, 512))).toEqual({ ok: true, facts: { mime: 'image/png', width: 512, height: 512 } })
    expect(inspectImage(jpeg(640, 480))).toEqual({ ok: true, facts: { mime: 'image/jpeg', width: 640, height: 480 } })
    expect(inspectImage(webpLossless(300, 200))).toEqual({ ok: true, facts: { mime: 'image/webp', width: 300, height: 200 } })
  })
  it('refuses anything that is not one of the three rasters, whatever it claims to be', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect(inspectImage(svg).ok).toBe(false)
    expect(inspectImage(new TextEncoder().encode('<html><body>hi</body></html>')).ok).toBe(false)
    expect(inspectImage(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])).ok).toBe(false)
  })
  it('refuses images too small, too large in pixels, or too heavy', () => {
    expect(inspectImage(png(32, 32))).toMatchObject({ ok: false })
    expect(inspectImage(png(4096, 4096))).toMatchObject({ ok: false })
    const heavy = new Uint8Array(1_600_000); heavy.set(png(512, 512))
    expect(inspectImage(heavy)).toMatchObject({ ok: false })
  })
})
