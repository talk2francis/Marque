/** Owner-uploaded profile art. Existing portraits retain their square crop and upload limits. */
export const BANNER_SIZE = { width: 960, height: 320 } as const
export interface AgentBanner { url: string; width: number; height: number; updatedAt: string }

export function hostedBannerUrl(value: string | null | undefined): string | null {
  return value && /^\/img\/p\/[0-9a-f]{32}$/.test(value) ? value : null
}

/** A filled frame: panning can reveal no pixels outside the source image. */
export function bannerCrop(image: { width: number; height: number }, frameWidth: number, zoom: number, position: { x: number; y: number } | null = null) {
  const width = Math.max(1, frameWidth), height = width / 3
  const scale = Math.max(width / image.width, height / image.height) * Math.max(1, zoom)
  const drawnWidth = image.width * scale, drawnHeight = image.height * scale
  const initial = position ?? { x: (width - drawnWidth) / 2, y: (height - drawnHeight) / 2 }
  const x = Math.min(0, Math.max(width - drawnWidth, initial.x)), y = Math.min(0, Math.max(height - drawnHeight, initial.y))
  return { width, height, scale, drawnWidth, drawnHeight, x, y }
}
