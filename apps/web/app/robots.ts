import type { MetadataRoute } from 'next'
import { BRAND } from '@marque/ui/brand'

/**
 * Marque's whole thesis is agent data legible to other software, and the README
 * advertises /api/v1 as keyless and machine-readable. A blanket `Disallow: /api/`
 * told compliant agents and crawlers not to touch the very thing we advertise
 * (P10.5A item 5). The public read API is now explicitly allowed; only the
 * anonymous telemetry write path and the kitchen route stay out of the index.
 * `Allow: /api/v1/` is more specific than `Disallow: /api/`, so it wins for
 * those paths under standard longest-match resolution.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/v1/'],
        disallow: ['/api/v1/events', '/_ui'],
      },
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
    host: BRAND.url,
  }
}
