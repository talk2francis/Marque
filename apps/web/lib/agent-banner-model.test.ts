import { describe, expect, it } from 'vitest'
import { BANNER_SIZE, bannerCrop, hostedBannerUrl } from './agent-banner-model'

describe('owner banner framing and source', () => {
  it('permits only the uploaded same-origin image path', () => {
    expect(hostedBannerUrl('/img/p/' + 'a'.repeat(32))).toBe('/img/p/' + 'a'.repeat(32))
    for (const source of [null, '', 'https://outside.invalid/banner.png', '//outside.invalid/a', '/img/p/../../x', '/img/p/' + 'a'.repeat(32) + '?x=1', 'url(javascript:x)']) expect(hostedBannerUrl(source)).toBeNull()
  })
  it('centres tall, wide and exact-ratio pictures in a filled frame', () => {
    expect(BANNER_SIZE.width / BANNER_SIZE.height).toBe(3)
    for (const image of [{ width: 800, height: 1200 }, { width: 2400, height: 400 }, { width: 960, height: 320 }]) {
      const c = bannerCrop(image, 300, 1)
      expect(c.drawnWidth).toBeGreaterThanOrEqual(c.width)
      expect(c.drawnHeight).toBeGreaterThanOrEqual(c.height)
      expect(c.x).toBeCloseTo((c.width - c.drawnWidth) / 2)
      expect(c.y).toBeCloseTo((c.height - c.drawnHeight) / 2)
    }
  })
  it('clamps mouse and keyboard panning at every zoom without revealing empty edges', () => {
    for (const width of [238, 390, 640]) for (const zoom of [1, 1.5, 3]) for (const p of [{ x: 9999, y: 9999 }, { x: -9999, y: -9999 }]) {
      const c = bannerCrop({ width: 1920, height: 1080 }, width, zoom, p)
      expect(c.x).toBeLessThanOrEqual(0); expect(c.y).toBeLessThanOrEqual(0)
      expect(c.x + c.drawnWidth).toBeGreaterThanOrEqual(c.width - 1e-8)
      expect(c.y + c.drawnHeight).toBeGreaterThanOrEqual(c.height - 1e-8)
    }
  })
})
