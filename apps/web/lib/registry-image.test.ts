import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { registryImageRaster } from './registry-image'

const bytes = (s: string) => new TextEncoder().encode(s)
const svg = (inside: string) => bytes(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">${inside}</svg>`)

describe('declared registry artwork', () => {
  it('rasterizes an inert declared SVG into WebP instead of returning XML', async () => {
    const result = await registryImageRaster(svg('<path fill="red" d="M0 0h64v64H0z"/>'), 'image/svg+xml')
    expect(result).not.toBeNull()
    expect(await sharp(result!).metadata()).toMatchObject({ format: 'webp', width: 64, height: 64 })
  })
  it.each([
    '<script>alert(1)</script>', '<foreignObject><div>HTML</div></foreignObject>',
    '<image href="file:///etc/passwd"/>', '<use href="https://example.org/a.svg#x"/>',
    '<path onload="alert(1)"/>', '<style>@import "https://example.org/a.css";</style>',
    '<path fill="url(https://example.org/a.svg#x)"/>', '<path fill="u&#114;l(file:///etc/passwd)"/>',
  ])('rejects active or external SVG content: %s', async content => {
    expect(await registryImageRaster(svg(content), 'image/svg+xml')).toBeNull()
  })
  it('rejects HTML, entity definitions, oversized input and a false content type', async () => {
    expect(await registryImageRaster(bytes('<html>not an image</html>'), 'image/png')).toBeNull()
    expect(await registryImageRaster(bytes('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>'), 'image/svg+xml')).toBeNull()
    expect(await registryImageRaster(new Uint8Array(1_500_001), 'image/webp')).toBeNull()
    expect(await registryImageRaster(svg('<path/>'), 'image/png')).toBeNull()
  })
  it('accepts checked raster input while enforcing image dimensions', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: 'white' } }).png().toBuffer()
    expect(await registryImageRaster(png, 'image/png')).not.toBeNull()
    const large = await sharp({ create: { width: 2048, height: 8, channels: 3, background: 'white' } }).png().toBuffer()
    expect(await registryImageRaster(large, 'image/png')).toBeNull()
  })
})
