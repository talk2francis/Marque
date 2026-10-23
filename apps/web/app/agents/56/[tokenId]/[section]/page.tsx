import { notFound, permanentRedirect } from 'next/navigation'
import { storefrontByToken } from '../../../../../lib/storefront'
import { isSection } from '../../../_storefront/Storefront'
import { AgentSection, SECTION_TITLE } from '../../../_storefront/render'

export const revalidate = 30
export async function generateStaticParams() { return [] }

/** One section of an agent page by its ERC-8004 token on BSC mainnet. */
export async function generateMetadata({ params }: { params: Promise<{ tokenId: string; section: string }> }) {
  const { tokenId, section } = await params
  const d = /^\d{1,12}$/.test(tokenId) && isSection(section) ? await storefrontByToken(tokenId, 56).catch(() => null) : null
  return d && isSection(section) ? { title: `${d.name}: ${SECTION_TITLE[section]}`, description: d.description ? d.description.slice(0, 180) : `ERC-8004 agent #${tokenId}.` } : { title: 'Agent not found' }
}

export default async function TokenSection({ params }: { params: Promise<{ tokenId: string; section: string }> }) {
  const { tokenId, section } = await params
  if (!/^\d{1,12}$/.test(tokenId) || !isSection(section)) notFound()
  const d = await storefrontByToken(tokenId, 56)
  if (!d) notFound()
  if (d.slug) permanentRedirect(`/agents/${d.slug}/${section}`)
  return <AgentSection d={d} section={section} />
}
