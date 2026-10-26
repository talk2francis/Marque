import { BRAND } from '@marque/ui'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { ADVANTAGE_V2 as R } from '../../lib/advantage-v2.data'
import styles from './advantage.module.css'

export const metadata = {
  title: `Advantage Report v2 · ${BRAND.name}`,
  description: 'Three agent jobs on BNB Chain, hired through Marque against a specification locked on chain before any of them ran. Wins, mixed results and losses at the same size.',
}

const OUTCOME = { win: 'Win', mixed: 'Mixed', loss: 'Loss' } as const
const TASK: Record<string, string> = { 'T1-health-factor': 'Health factor', 'T2-yield': 'Yield', 'T3-rebalancing': 'Rebalancing' }
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`

/** /advantage: the pre-registered Advantage Report, from docs/advantage/v2 (results, spec and its on-chain lock). */
export default function AdvantagePage() {
  return (
    <>
      <SiteHeader active="proof" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className={styles.kicker}>Advantage Report v2</span>
          <h1 className="t-display">Written down first, <em>then run.</em></h1>
          <p className={styles.lede}>Three tasks, one per category, hired through Marque on BSC mainnet. The tasks, the rubric, the baselines and the rule for a win, a loss or a mixed result were written into a file, and the file&apos;s hash was put on chain before any job was opened. Changing one byte of the file would change the hash.</p>
        </header>

        <section className={styles.lock} aria-label="The locked specification">
          <dl>
            <div><dt>Specification</dt><dd><a href="https://github.com/talk2francis/Marque/blob/main/docs/advantage/v2/spec.json">docs/advantage/v2/spec.json</a></dd></div>
            <div><dt>keccak256</dt><dd className="mono">{short(R.specKeccak256)}</dd></div>
            <div><dt>Locked on chain</dt><dd><a href={`https://testnet.bscscan.com/tx/${R.lockTx}`} target="_blank" rel="noreferrer">BSC testnet tx {short(R.lockTx)}</a>, block {Number(R.lockBlock).toLocaleString('en-US')}, before the first hire</dd></div>
            <div><dt>Paid by</dt><dd>{R.funder}: a published Marque team wallet. These jobs are never counted as independent use.</dd></div>
          </dl>
        </section>

        <section className={styles.summary} aria-label="Outcomes">
          <div data-o="win"><b>{R.summary.win}</b><span>Win</span></div>
          <div data-o="mixed"><b>{R.summary.mixed}</b><span>Mixed</span></div>
          <div data-o="loss"><b>{R.summary.loss}</b><span>Loss</span></div>
        </section>

        <ol className={styles.tasks}>
          {R.tasks.map((t) => (
            <li key={t.id} data-o={t.outcome}>
              <div className={styles.taskHead}>
                <span className={styles.outcome} data-o={t.outcome}>{OUTCOME[t.outcome as keyof typeof OUTCOME]}</span>
                <h2>{TASK[t.id]} · {t.agent}</h2>
              </div>
              <dl className={styles.facts}>
                <div><dt>Job</dt><dd><a href={`/jobs/${t.chainId}/${t.jobId}`}>BSC mainnet job {t.jobId}</a></dd></div>
                <div><dt>Paid by</dt><dd>{R.funder}</dd></div>
                <div><dt>Delivered</dt><dd>{t.deliveredSeconds} s after funding; the file matches its hash on chain</dd></div>
                <div><dt>Terms met</dt><dd>{t.terms.met} of {t.terms.of}, {t.terms.source}{t.terms.unchecked ? `; ${t.terms.unchecked} could not be decided` : ''}</dd></div>
                <div><dt>Cost</dt><dd>{t.price} into escrow, plus {Number(t.feesBnb).toFixed(6)} BNB in network fees over 5 transactions</dd></div>
                <div><dt>Against the baseline</dt><dd>{t.versusBaseline}</dd></div>
              </dl>
              <p className={styles.replay}>Replay with a Marque database: <code>pnpm marque verify-terms {t.chainId}:{t.jobId}</code></p>
            </li>
          ))}
        </ol>

        <section className={styles.not} aria-labelledby="not">
          <h2 id="not">What this does not show</h2>
          <ul>{R.doesNotShow.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
        <p className={styles.note}>Rules, budget and every transaction are in <a href="https://github.com/talk2francis/Marque/tree/main/docs/advantage/v2">docs/advantage/v2</a>. The earlier report, with its human benchmark recordings, is in <a href="/ledger">the Ledger</a>.</p>
      </main>
      <SiteFooter />
    </>
  )
}
