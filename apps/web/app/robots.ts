import type { MetadataRoute } from 'next'
import { BRAND } from '@marque/ui/brand'

/**
 * Marque's whole thesis is agent data legible to other software — we ship
 * /api/v1 and an MCP server. A marketplace for agents that blocks crawlers is
 * an embarrassing headline (P10.5A item 5). Everything public is open; only the
 * internal API write paths and the kitchen route are held back from indexing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/_ui'],
      },
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
    host: BRAND.url,
  }
}
