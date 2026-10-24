import { cachedProjection } from '@marque/db'
import { venusReader } from '@marque/positions'
import { archiveClient, publicClient } from '@marque/chain'
import type { PublicClient } from 'viem'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { storefrontByToken } from '../../lib/storefront'
import { jobLens } from '../../lib/lens'
import { outcomesForJob } from '../../lib/act'
import { marketplaceAgents } from '../../lib/marketplace'
import { referenceAgent } from '../../lib/reference-agents'
import { RepayPlanButton } from './RepayPlanButton'
import styles from './judge.module.css'

// Rendered at request time (never at build: the build has no archive RPC); the reads are cached for a minute below.
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
  const load = async () => {
    const [pos, hf, keelPage, lens, acted] = await Promise.all([
      venusReader(DEMO as `0x${string}`, { client: (archiveClient() ?? publicClient()) as PublicClient }).catch(() => null),
      marketplaceAgents({ tab: 'ready', category: 'health_factor', limit: 1 }).then((r) => ({ total: r.total })).catch(() => null),
      keel ? storefrontByToken(String(keel.erc8004.tokenId)).catch(() => null) : Promise.resolve(null),
      jobLens(Number(JOB[0]) as 56 | 97, JOB[1]).then((p) => p.value).catch(() => null),
      outcomesForJob(`${JOB[0]}:${JOB[1]}`).catch(() => []),
    ])
    return {
      pos: pos ? { ok: pos.ok, blockNumber: pos.blockNumber.toString(), hf: pos.ok ? pos.data.healthFactor?.value ?? null : null } : null,
      hf, keelTest: keelPage?.tests.find((t) => t.testId === 'MCS-HF-1') ?? null,
      lens: lens ? { summary: lens.summary, matches: lens.manifest?.matches ?? null } : null, acted,
    }
  }
  const d = await cachedProjection('judge:v1', load, { freshMs: 60_000, timeoutMs: 20_000, staleWhileRevalidate: true }).then((p) => p.value).catch(load)
  const { hf, keelTest, acted } = d
  const pos = d.pos
  const lens = d.lens
  const hfVal = pos?.hf ?? null
  const o = acted[0] ?? null
  const blk = (n: string | number | bigint | null | undefined) => (n == null ? 'n/a' : Number(n).toLocaleString('en-US'))
  const hfAfter = (x: number | null) => (x === null ? 'no debt' : x > 100 ? 'over 100' : x.toFixed(3))
  const steps: Array<{ title: string; body: React.ReactNode; action: React.ReactNode }> = [
    {
      title: 'A position that needs work',
      body: <>Venus borrower <span className="mono">{short(DEMO)}</span>: health factor <b className="mono">{hfVal !== null ? hfVal.toFixed(3) : 'n/a'}</b>{hfVal !== null && hfVal < 1.2 ? ', needs attention' : ''} (block {blk(pos?.blockNumber)}).</>,
      action: <><RepayPlanButton address={DEMO} target={1.5} /><a className="btn btn--sm" href={`/positions?addr=${DEMO}`}>The position</a></>,
    },
    {
      title: 'Every agent quotes at once',
      body: <>{hf?.total ?? 'Several'} health factor agents are hireable on BSC mainnet. One task, every price, test results beside them.</>,
      action: <a className="btn btn--sm" href="/tender?category=health_factor">Run the tender</a>,
    },
    {
      title: 'The warrant behind the choice',
      body: keelTest ? <>Keel: {keelTest.pass ? 'Warranted' : 'failed'}, {keelTest.testId}, {keelTest.diffs.filter((d) => d.pass).length} of {keelTest.diffs.length} assertions at block {blk(keelTest.block)}.</> : <>Keel&apos;s latest MCS-HF-1 run and its published case.</>,
      action: <a className="btn btn--sm" href="/agents/keel/evidence">Keel&apos;s evidence</a>,
    },
    {
      title: 'A real paid job, read from chain',
      body: <>Job {JOB[1]}, {JOB[0] === '56' ? 'BSC mainnet' : 'BSC testnet'}: {lens?.summary.checked ? <>{lens.summary.agreed} of {lens.summary.checked} checks agree with the chain</> : 'its answer as a picture, with Marque\'s checks'}{lens?.matches ? '; the file matches its on-chain hash' : ''}.</>,
      action: <a className="btn btn--sm" href={`/jobs/${JOB[0]}/${JOB[1]}`}>Open the Job Room</a>,
    },
    {
      title: 'The action, without authority',
      body: o ? <>{o.action === 'repay' ? 'Repay' : 'Supply'} {o.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })} {o.symbol}: health factor {o.before.healthFactor?.toFixed(3) ?? 'n/a'} to {hfAfter(o.after.healthFactor)} (block {blk(o.after.block)}). Marque built and simulated it; the owner signed.</> : <>Marque builds and simulates the action; the owner signs it.</>,
      action: <a className="btn btn--sm" href={`/jobs/${JOB[0]}/${JOB[1]}/act`}>The plan screen</a>,
    },
    {
      title: 'Check it yourself',
      body: <>Any wallet&apos;s Set and Earn progress, and the same data over MCP. Every number links to the chain.</>,
      action: <><a className="btn btn--sm" href={`/quest/${QUEST}`}>A wallet&apos;s quest</a><a className="btn btn--sm" href="/docs/mcp">MCP</a></>,
    },
  ]
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className="t-label">Judge mode · 90 seconds · no wallet</p>
          <h1 className="t-display">Marque in six steps.</h1>
          <p className={styles.lede}>From a position that needs work to an action its owner signs.</p>
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
