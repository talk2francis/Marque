import 'server-only'
import { cachedProjection } from '@marque/db'
import { agentActivity } from './agent-activity'
import { jobLens } from './lens'

/**
 * "Terms met across its jobs": for an agent's latest delivered jobs, each acceptance criterion's result from the same
 * Result Lens the Job Room shows, counted by who paid. Outside buyers are the headline; Marque team tests and the
 * agent's own operator are shown apart and never added in. A criterion that could not be checked is counted as
 * unchecked, never as met.
 */
type Funder = 'outside' | 'team' | 'operator'
export interface TermsTally { met: number; of: number; unchecked: number }
export interface AgentTermsRecord {
  measuredAt: string
  jobs: Record<Funder, number>
  criteria: Array<{ text: string } & Record<Funder, TermsTally>>
}

const DELIVERED = new Set(['SUBMITTED', 'COMPLETED', 'PAID', 'DISPUTED', 'REJECTED'])
const empty = (): TermsTally => ({ met: 0, of: 0, unchecked: 0 })

async function build(agentId: string, provider: string | null, chainId: 56 | 97): Promise<AgentTermsRecord> {
  const a = await agentActivity(agentId, provider, chainId)
  const jobs = a.jobs.filter((j) => DELIVERED.has(j.state)).slice(0, 24)
  const counted: Record<Funder, number> = { outside: 0, team: 0, operator: 0 }
  const byText = new Map<string, Record<Funder, TermsTally>>()
  for (let i = 0; i < jobs.length; i += 4) {
    const batch = jobs.slice(i, i + 4)
    const lenses = await Promise.all(batch.map((j) => jobLens(chainId, j.id).then((p) => p.value).catch(() => null)))
    batch.forEach((j, k) => {
      const t = lenses[k]?.terms
      if (!t) return
      counted[j.funder] += 1
      for (const r of t.rows) {
        const row = byText.get(r.text) ?? { outside: empty(), team: empty(), operator: empty() }
        if (r.state === 'unchecked') row[j.funder].unchecked += 1
        else { row[j.funder].of += 1; if (r.state === 'met') row[j.funder].met += 1 }
        byText.set(r.text, row)
      }
    })
  }
  return { measuredAt: new Date().toISOString(), jobs: counted, criteria: [...byText.entries()].map(([text, v]) => ({ text, ...v })) }
}

export function agentTermsRecord(agentId: string, provider: string | null, chainId: 56 | 97 = 56) {
  return cachedProjection(`agent:terms:v1:${agentId}`, () => build(agentId, provider, chainId), { freshMs: 30 * 60_000, timeoutMs: 25_000 })
}
