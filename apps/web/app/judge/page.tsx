import { venusReader } from '@marque/positions'
import { archiveClient, publicClient } from '@marque/chain'
import type { PublicClient } from 'viem'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { storefrontByToken } from '../../lib/storefront'
import { jobLens } from '../../lib/lens'
import { outcomesForJob } from '../../lib/act'
import { marketplaceAgents } from '../../lib/marketplace'
import { referenceAgent } from '../../lib/reference-agents'
import { WarrantCard } from '../agents/_storefront/WarrantCard'
import { RepayPlanButton } from './RepayPlanButton'
import styles from './judge.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Judge mode: Marque in six steps',
  description: 'A position that needs work, every agent quoting at once, the warrant behind the choice, a paid job read from chain, the action without authority, and how to check it yourself. No wallet needed.',
}

const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
// The job and address the walkthrough opens; set at release to an outside wallet's settled mainnet job.
const JOB = (process.env['JUDGE_JOB'] ?? '56:57066').split(':') as [string, string]
const QUEST = process.env['JUDGE_QUEST_ADDRESS'] ?? DEMO
const SHA = (process.env['MARQUE_RELEASE_SHA'] ?? '').slice(0, 7) || 'unreleased'
const BUILT = process.env['MARQUE_BUILT_AT'] ?? null

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** /judge (LAUNCH-AND-JUDGE 4): six steps, one click each, every number linked to its source. Nothing needs a wallet. */
export default async function JudgePage() {
  const keel = referenceAgent('keel')
  const [pos, hf, keelPage, lens, acted] = await Promise.all([
    venusReader(DEMO as `0x${string}`, { client: (archiveClient() ?? publicClient()) as PublicClient }).catch(() => null),
    marketplaceAgents({ tab: 'ready', category: 'health_factor', limit: 1 }).catch(() => null),
    keel ? storefrontByToken(String(keel.erc8004.tokenId)).catch(() => null) : Promise.resolve(null),
    jobLens(Number(JOB[0]) as 56 | 97, JOB[1]).then((p) => p.value).catch(() => null),
    outcomesForJob(`${JOB[0]}:${JOB[1]}`).catch(() => []),
  ])
  const v = pos?.ok ? pos.data : null
  const hfVal = v?.healthFactor?.value ?? null
  const keelTest = keelPage?.tests.find((t) => t.testId === 'MCS-HF-1') ?? null
  const o = acted[0] ?? null
  const steps: Array<{ title: string; body: React.ReactNode; action: React.ReactNode }> = [
    {
      title: 'A position that needs work',
      body: <>Venus borrower <span className="mono">{short(DEMO)}</span>: health factor <b className="mono">{hfVal !== null ? hfVal.toFixed(3) : 'unreadable now'}</b>{hfVal !== null && hfVal < 1.2 ? ', needs attention' : ''}, read at block {pos ? Number(pos.blockNumber).toLocaleString('en-US') : 'n/a'}.</>,
      action: <><a className="btn btn--sm" href={`/positions?addr=${DEMO}`}>Open the position</a><RepayPlanButton address={DEMO} target={1.5} /></>,
    },
    {
      title: 'Every agent quotes at once',
      body: <>{hf?.total ?? 'Several'} health factor agents can be hired on BSC mainnet now. One task goes to all of them; each signed price arrives as it comes, with its test result beside it.</>,
      action: <a className="btn btn--sm" href="/tender?category=health_factor">Run the tender</a>,
    },
    {
      title: 'The warrant behind the choice',
      body: <WarrantCard test={keelTest} category="health_factor" />,
      action: <><a className="btn btn--sm" href="/agents/keel/evidence">Keel&apos;s evidence</a><a className="btn btn--sm" href="/standard/MCS-HF-1">The published case</a></>,
    },
    {
      title: 'A real paid job, read from chain',
      body: <>Job {JOB[1]} on {JOB[0] === '56' ? 'BSC mainnet' : 'BSC testnet'}: {lens?.summary.checked ? <>Marque checked the delivered answer against the chain, <b>{lens.summary.agreed} of {lens.summary.checked}</b> agree</> : 'its answer is shown as a picture with Marque\'s checks'}{lens?.manifest?.matches ? ', and the file matches the hash recorded on chain' : ''}.</>,
      action: <a className="btn btn--sm" href={`/jobs/${JOB[0]}/${JOB[1]}`}>Open the Job Room</a>,
    },
    {
      title: 'The action, without authority',
      body: o ? <>A buyer acted on this answer: {o.action === 'repay' ? `repay ${o.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${o.symbol}` : `supply ${o.amount} ${o.symbol}`}, health factor {o.before.healthFactor?.toFixed(3) ?? 'n/a'} → {o.after.healthFactor === null ? 'no debt' : o.after.healthFactor > 100 ? 'over 100' : o.after.healthFactor.toFixed(3)} at block {Number(o.after.block).toLocaleString('en-US')}. Marque rebuilt it from its allowlist and simulated it; the buyer signed.</> : <>Marque rebuilds the agent&apos;s decision from its own allowlist, re-reads the position and simulates it. The owner signs; the outcome is read back from chain.</>,
      action: <a className="btn btn--sm" href={`/jobs/${JOB[0]}/${JOB[1]}/act`}>See the plan screen</a>,
    },
    {
      title: 'Check it yourself',
      body: <>Set and Earn progress for any wallet, from chain events; the same data for assistants over MCP. Every number above has a link to the chain.</>,
      action: <><a className="btn btn--sm" href={`/quest/${QUEST}`}>Quest for {short(QUEST)}</a><a className="btn btn--sm" href="/docs/mcp">Marque for agents</a></>,
    },
  ]
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label">Judge mode · 90 seconds · no wallet</p>
          <h1 className="t-display">Marque in six steps.</h1>
          <p className={styles.lede}>From a position that needs work to an action its owner signs, with the evidence at every step.</p>
        </header>
        <ol className={styles.steps}>
          {steps.map((s, i) => (
            <li key={s.title} className={styles.step}>
              <span className={styles.stepIndex}>{i + 1}</span>
              <div className={styles.stepBody}>
                <span className={styles.stepTitle}>{s.title}</span>
                <div className={styles.stepWhy}>{s.body}</div>
                <div className={styles.stepActions}>{s.action}</div>
              </div>
            </li>
          ))}
        </ol>
        <p className={styles.note}>Release {SHA}{BUILT ? `, built ${BUILT}` : ''}. Nothing on this page needs a wallet.</p>
      </main>
      <SiteFooter />
    </>
  )
}
