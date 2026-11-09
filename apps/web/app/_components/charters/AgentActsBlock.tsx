import { ProvenanceChip } from '@marque/ui'
import { agentActs, keyStoreOf } from '../../../lib/guards'
import { chartersPublic } from '../../../lib/charters-access'

/**
 * "Acts for you" on an agent's profile (03_EXPERIENCE section 2): only for an agent with declared executor
 * addresses, only once Charters is public. The Charter-ready chip is earned by a first onchain act(), never
 * declared (AGENTS.md C6). Counts come from Acted events.
 */
const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000))
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} days ago`
}

export async function AgentActsBlock({ agentId, chainId }: { agentId: string; chainId: 56 | 97 }) {
  if (!chartersPublic()) return null
  const r = await agentActs(agentId).catch(() => null)
  if (!r || !r.executors.length) return null
  const acts = r.chains.reduce((n, c) => n + c.acts, 0)
  const guards = r.chains.reduce((n, c) => n + c.guards, 0)
  const last = r.chains.map((c) => c.lastAction).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null
  const explorer = chainId === 56 ? 'https://bscscan.com' : 'https://testnet.bscscan.com'
  return (
    <section aria-labelledby="acts-for-you" style={{ display: 'grid', gap: 10, padding: 18, margin: '0 0 20px', border: '1px solid var(--hair-2)', borderRadius: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <h2 id="acts-for-you" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Acts for you</h2>
        {acts > 0 ? <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--moss) 50%, transparent)', color: 'var(--moss)' }}>Charter-ready: Loan Guard</span> : null}
        <ProvenanceChip provenance="ONCHAIN" />
      </div>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink-2)' }}>
        {acts > 0
          ? `Repaid loans for ${guards} Loan Guard charter${guards === 1 ? '' : 's'} in ${acts} action${acts === 1 ? '' : 's'}${last ? `, last ${ago(last)}` : ''}.`
          : 'Watches Loan Guard charters and acts when the chain says a loan needs it. No action yet.'}
        {' '}<a href="/charters" style={{ color: 'var(--ink)', textUnderlineOffset: 3 }}>About Charters</a>
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>
        Acts from {r.executors.map((x, i) => <span key={x}>{i ? ', ' : ''}<a className="mono" href={`${explorer}/address/${x}`} style={{ color: 'var(--ink-2)' }}>{x.slice(0, 6)}…{x.slice(-4)}</a></span>)}
        , through keys anyone can check on <a href={`${explorer}/address/${keyStoreOf(chainId)}#readContract`} style={{ color: 'var(--ink-2)' }}>Altana KeyStore</a>.
      </p>
    </section>
  )
}
