import type { MetadataRoute } from 'next'
import { BRAND } from '@marque/ui/brand'

/**
 * The public surface, for crawlers (P10.5A item 5). Detail routes that need a
 * real id (/agents/56/:id, /runs/:id, /receipts/:id) are reached from these and
 * are not enumerated here — there is no honest static list of them.
 */
const ROUTES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/register', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/register/rebalancing', priority: 0.6, changeFrequency: 'daily' },
  { path: '/register/grid', priority: 0.6, changeFrequency: 'daily' },
  { path: '/register/yield', priority: 0.6, changeFrequency: 'daily' },
  { path: '/register/health-factor', priority: 0.6, changeFrequency: 'daily' },
  { path: '/register/security', priority: 0.6, changeFrequency: 'daily' },
  { path: '/standard', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/standard/MCS-REB-1', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/standard/MCS-GRID-1', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/standard/MCS-YIELD-1', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/standard/MCS-HF-1', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/ledger', priority: 0.7, changeFrequency: 'daily' },
  { path: '/ledger/methodology', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/pancakeswap', priority: 0.7, changeFrequency: 'daily' },
  { path: '/builders/test', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/builders/claim', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/app/charter', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/status', priority: 0.4, changeFrequency: 'hourly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return ROUTES.map((r) => ({
    url: `${BRAND.url}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))
}
