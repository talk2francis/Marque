import { agentTermsRecord, type TermsTally } from '../../../lib/agent-terms'
import { utcStamp } from '../../../lib/time'
import styles from './activity.module.css'

const tally = (t: TermsTally) => (t.of ? `${t.met} of ${t.of}` : '·')

/** Terms met across the agent's delivered jobs, outside buyers first; team and operator jobs shown, never added in. */
export async function AgentTerms({ agentId, provider, chainId = 56 }: { agentId: string; provider: string | null; chainId?: 56 | 97 }) {
  const p = await agentTermsRecord(agentId, provider, chainId).catch(() => null)
  const d = p?.value
  if (!d || !d.criteria.length) return null
  return (
    <section className={styles.activity} aria-label="Terms met across its jobs">
      <header>
        <h2>Terms met across its jobs.</h2>
        <p className={styles.note}>Each criterion checked by Marque at the answer&apos;s block, over the latest delivered jobs ({d.jobs.outside} from outside buyers, {d.jobs.team} Marque team tests, {d.jobs.operator} from its own operator). Read {utcStamp(d.measuredAt)}.</p>
      </header>
      <div className={styles.termsWrap}>
        <table className={styles.termsTable}>
          <thead><tr><th>Criterion</th><th>Outside buyers</th><th>Marque team (test)</th><th>Its own operator</th></tr></thead>
          <tbody>
            {d.criteria.map((c) => (
              <tr key={c.text}>
                <td>{c.text}</td>
                <td data-label="Outside buyers"><b>{tally(c.outside)}</b>{c.outside.unchecked ? <span className={styles.unchecked}> · {c.outside.unchecked} not checked</span> : null}</td>
                <td data-label="Marque team (test)">{tally(c.team)}</td>
                <td data-label="Its own operator">{tally(c.operator)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>Outside means not in Marque&apos;s published team list; it does not prove the buyer is unrelated. Jobs hired without written criteria are measured against the Standard&apos;s criteria for the category.</p>
    </section>
  )
}
