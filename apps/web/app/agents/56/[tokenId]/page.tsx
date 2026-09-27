import { notFound, permanentRedirect } from 'next/navigation'
import { SiteHeader, SiteFooter } from '../../../_components/SiteHeader'
import { Storefront } from '../../_storefront/Storefront'
import { storefrontByToken } from '../../../../lib/storefront'

export const dynamic = 'force-dynamic'

/**
 * Any agent's storefront by its ERC-8004 token on BSC mainnet (DESIGN-SYSTEM.md 8.4).
 * Marque's reference agents live at their readable address and redirect there.
 */
export async function generateMetadata({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params
  const d = /^\d{1,12}$/.test(tokenId) ? await storefrontByToken(tokenId).catch(() => null) : null
  return d
    ? { title: `${d.name}, agent #${tokenId}`, description: d.description ? d.description.slice(0, 180) : `ERC-8004 agent #${tokenId} on BNB Smart Chain: its price, record and Marque test result.` }
    : { title: 'Agent not found' }
}

export default async function AgentStorefront({ params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params
  const d = await storefrontByToken(tokenId)
  if (!d) notFound()
  if (d.slug) permanentRedirect(`/agents/${d.slug}`)
  return (
    <>
      <SiteHeader active="register" />
      <main><Storefront d={d} /></main>
      <SiteFooter />
    </>
  )
}
