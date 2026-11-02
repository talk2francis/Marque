import { SiteHeader, SiteFooter } from '../../_components/SiteHeader'
import { agentEvidence } from '../../../lib/agent-evidence'
import { jobLens } from '../../../lib/lens'
import { originality } from '../../../lib/forge-signals'
import { outcomesForAgent } from '../../../lib/act'
import { standingEvidence } from '../../../lib/agent-standing'
import type { Storefront as Data } from '../../../lib/storefront'
import { Storefront, type SectionId } from './Storefront'

/** One agent page section, server-rendered, with only the data that section reads. */
export async function AgentSection({ d, section }: { d: Data; section: SectionId }) {
  const [evidence, lens, twins, acted, standing] = await Promise.all([
    section === 'evidence' ? agentEvidence(d.agentId) : Promise.resolve(null),
    section === 'overview' && d.sample
      ? jobLens(d.sample.chainId as 56 | 97, d.sample.jobId).then((p) => p.value).catch(() => null)
      : Promise.resolve(null),
    section === 'technical' ? originality(d.agentId) : Promise.resolve([]),
    section === 'record' ? outcomesForAgent(d.agentId) : Promise.resolve([]),
    section === 'overview' ? standingEvidence().then((s) => s[d.agentId] ?? null).catch(() => null) : Promise.resolve(null),
  ])
  return (
    <>
      <SiteHeader active="register" />
      <main><Storefront d={d} section={section} evidence={evidence} lens={lens} twins={twins} acted={acted} standing={standing} /></main>
      <SiteFooter />
    </>
  )
}

export const SECTION_TITLE: Record<Exclude<SectionId, 'overview'>, string> = {
  evidence: 'Evidence', record: 'Track record', terms: 'Terms', technical: 'Technical',
}
