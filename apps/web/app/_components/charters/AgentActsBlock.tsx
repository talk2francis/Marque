import { ProvenanceChip } from '@marque/ui'
import { agentActs, keyStoreOf } from '../../../lib/guards'
import { chartersPublic } from '../../../lib/charters-access'

/**
 * "Acts for you" on an agent's profile (11_EXPERIENCE): only for an agent with declared executor addresses, only
 * once Charters is public. "Executed" chips are earned per kind and chain from the chain's own events, never
 * declared (AGENTS.md C8); they promise nothing about anything else.
 */
const KIND_NAME = { loan: 'Loan Guard', yield: 'Yield Sweep', grid: 'Grid Band', range: 'Range Keeper' } as const
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} days ago`
}

export async function AgentActsBlock({ agentId, chainId }: { agentId: string; chainId: 56 | 97 }) {
  if (!chartersPublic()) return null
  const r = await agentActs(agentId).catch(() => null)
  if (!r || !r.executors.length) return null
  // Per kind: v1 Loan Guard actions plus v2 actions of every kind, by this agent's declared executors.
  const per = new Map<string, { acts: number; charters: number; last: string | null }>()
  const add = (k: string, acts: number, charters: number, last: string | null) => {
    const x = per.get(k) ?? { acts: 0, charters: 0, last: null }
    per.set(k, { acts: x.acts + acts, charters: x.charters + charters, last: [x.last, last].filter((v): v is string => Boolean(v)).sort().at(-1) ?? null })
  }
  for (const c of r.chains) add('loan', c.acts, c.guards, c.lastAction)
  for (const k of r.kinds ?? []) add(k.kind, k.actions, k.charters, k.lastAction)
  const acts = [...per.values()].reduce((n, x) => n + x.acts, 0)
  const earned = [...per.entries()].filter(([, x]) => x.acts > 0)
  const explorer = chainId === 56 ? 'https://bscscan.com' : 'https://testnet.bscscan.com'
  return (
    <section aria-labelledby="acts-for-you" style={{ display: 'grid', gap: 10, padding: 18, margin: '0 0 20px', border: '1px solid var(--hair-2)', borderRadius: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <h2 id="acts-for-you" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Acts for you</h2>
        {earned.map(([k, x]) => <span key={k} style={{ fontSize: 12, padding: '2px 9px', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--moss) 50%, transparent)', color: 'var(--moss)' }}>Executed: {KIND_NAME[k as keyof typeof KIND_NAME]}, {x.acts} action{x.acts === 1 ? '' : 's'}</span>)}
        <ProvenanceChip provenance="ONCHAIN" />
      </div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
        {acts > 0
          ? earned.map(([k, x]) => `${KIND_NAME[k as keyof typeof KIND_NAME]}: ${x.acts} action${x.acts === 1 ? '' : 's'} for ${x.charters} charter${x.charters === 1 ? '' : 's'}${x.last ? `, last ${ago(x.last)}` : ''}.`).join(' ')
          : 'Watches charters it serves and acts when the chain shows the condition. No action yet.'}
        {' '}<a href="/charters" style={{ color: 'var(--ink)', textUnderlineOffset: 3 }}>About Charters</a>
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
        Acts from {r.executors.map((x, i) => <span key={x}>{i ? ', ' : ''}<a className="mono" href={`${explorer}/address/${x}`} style={{ color: 'var(--ink-2)' }}>{x.slice(0, 6)}…{x.slice(-4)}</a></span>)}
        , through keys anyone can check (where it acts through Altana) on <a href={`${explorer}/address/${keyStoreOf(chainId)}#readContract`} style={{ color: 'var(--ink-2)' }}>Altana KeyStore</a>.
      </p>
    </section>
  )
}
