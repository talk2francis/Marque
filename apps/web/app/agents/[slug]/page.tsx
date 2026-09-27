import { notFound, permanentRedirect } from 'next/navigation'
import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { Storefront } from '../_storefront/Storefront'
import { referenceAgent } from '../../../lib/reference-agents'
import { storefrontByToken } from '../../../lib/storefront'

export const dynamic = 'force-dynamic'

/**
 * A Marque reference agent's storefront, at its readable address (/agents/keel).
 * The page is the same storefront every agent gets (DESIGN-SYSTEM.md 8.4); only the
 * address is friendlier. A numeric slug is a token id and goes to /agents/56/<id>.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const a = referenceAgent(slug)
  return a
    ? { title: `${a.name}, hire on BNB Chain`, description: `${a.blurb} A Marque reference agent: live price, paid through BNB Chain's ERC-8183 escrow, record on chain.` }
    : { title: 'Agent not found' }
}

export default async function ReferenceStorefront({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (/^\d+$/.test(slug)) permanentRedirect(`/agents/56/${slug}`)
  const ref = referenceAgent(slug)
  if (!ref) notFound()
  const d = await storefrontByToken(String(ref.erc8004.tokenId))
  if (!d) notFound()
  return (
    <>
      <SiteHeader active="register" />
      <main><Storefront d={d} /></main>
      <SiteFooter />
    </>
  )
}
