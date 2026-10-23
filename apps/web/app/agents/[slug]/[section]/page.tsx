import { notFound, permanentRedirect } from 'next/navigation'
import { referenceAgent } from '../../../../lib/reference-agents'
import { storefrontByToken } from '../../../../lib/storefront'
import { isSection } from '../../_storefront/Storefront'
import { AgentSection, SECTION_TITLE } from '../../_storefront/render'

export const revalidate = 30
export async function generateStaticParams() { return [] }

/** A reference agent's page section at its readable address (/agents/keel/evidence). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string; section: string }> }) {
  const { slug, section } = await params
  const a = referenceAgent(slug)
  return a && isSection(section) ? { title: `${a.name}: ${SECTION_TITLE[section]}`, description: a.blurb } : { title: 'Agent not found' }
}

export default async function ReferenceSection({ params }: { params: Promise<{ slug: string; section: string }> }) {
  const { slug, section } = await params
  if (/^\d+$/.test(slug)) permanentRedirect(`/agents/56/${slug}/${section}`)
  if (!isSection(section)) notFound()
  const ref = referenceAgent(slug)
  if (!ref) notFound()
  const d = await storefrontByToken(String(ref.erc8004.tokenId))
  if (!d) notFound()
  return <AgentSection d={d} section={section} />
}
