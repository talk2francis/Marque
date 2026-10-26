import { BRAND } from '@marque/ui'
import { publicClient } from '@marque/chain'
import { cachedProjection } from '@marque/db'
import { priceInUsdt, BSC_ADDRESSES } from '@marque/positions'
import { SiteHeader, SiteFooter } from '../_components/SiteHeader'
import { gasCosts } from '../../lib/gas-costs'
import { proofProjection, weeklyOutside } from '../../lib/proof'
import { HONEST_LIMITS } from '../../lib/honest-limits'
import styles from './adopt.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: `Running Marque · ${BRAND.name}`,
  description: 'What it costs to run Marque, how to run it from zero, every key and what it can do, what happens when it breaks, the figure BNB Chain can report, and what is not true yet.',
}

const bnbUsd = () => cachedProjection('adopt:bnb', async () => {
  const c = publicClient()
  return priceInUsdt(c, BSC_ADDRESSES.wbnb as `0x${string}`, 18, await c.getBlockNumber())
}, { freshMs: 60_000, timeoutMs: 6_000 }).then((p) => p.value).catch(() => null)

const n = (v: number | null, dp = 0) => (v === null ? 'not measured' : v.toLocaleString('en-US', { maximumFractionDigits: dp }))

const KEYS: Array<[string, string, string, string]> = [
  ['Buyers’ keys', 'In the buyer’s own wallet, or made on the buyer’s device from a passkey (Marque Pass)', 'Sign the buyer’s own hires and ratings', 'Marque never receives, stores or uses one. No server route accepts a user key.'],
  ['Six reference seller keys (Bound, Lattice, Sluicegate, Keel, Redcell, Tidemark)', 'An encrypted BNB Agent Studio keystore per agent on the server, unlocked by a password in a 0600 file', 'Sign each agent’s own price quotes and submit its own deliveries; receive its own payments', 'Cannot touch buyers’ funds, approvals or escrowed payments; cannot act for any other agent.'],
  ['Keeper key', 'An encrypted keystore on the server', 'Settle jobs whose review window has ended (router settle), capped at 50 an hour', 'Cannot move escrowed funds anywhere but where the escrow sends them.'],
  ['Testnet operator key', 'The server’s secrets file (0600)', 'BSC testnet only: anchor receipts, the charter sandbox, fund team test wallets with test BNB', 'Holds no mainnet value.'],
  ['Mainnet deployer key', 'Kept by the operator, out of the running services', 'Signed the PancakeSwap proof run', 'Sign anything from the running services: none of them loads it.'],
  ['Server secrets', 'The secrets file: API keys for indexing, RPC and the claim and capability HMAC secrets', 'Read data; sign short-lived claim and capability tokens', 'None of them can sign a chain transaction.'],
]

const INCIDENTS: Array<[string, string]> = [
  ['7 Sep 2026', 'The server was compromised and reprovisioned. The database was restored from its dump; seller keystores were not in the recovery bundle, so the reference agents got fresh wallets and identities.'],
  ['20 Oct 2026', 'A builder-service safety repair left agents unable to renew their A2A callability. Repaired with an explicit, consented validator.'],
  ['22 Oct 2026', 'The status table grew to a 6.6 MB response and health checks timed out. Replaced with five explicit checkpoints, no data dropped.'],
  ['26 Oct 2026', 'Job 57066 showed "Not checked": its task lived only on the staging stack. Checks now read the task from the job on chain and keep decided results.'],
  ['26 Oct 2026', 'The whole-catalog read slowed past its 8 s limit as the registry grew, and two deploys refused to switch (the live site was never touched). The read now takes candidates first, with a longer background budget and a warm start.'],
]

export default async function AdoptPage() {
  const [gas, usd, proof] = await Promise.all([gasCosts().then((p) => p.value).catch(() => null), bnbUsd(), proofProjection().then((p) => p.value).catch(() => null)])
  const weeks = proof ? weeklyOutside(proof.rows) : []
  return (
    <>
      <SiteHeader active="proof" />
      <main className={styles.page}>
        <header className={styles.head}>
          <span className={styles.kicker}>For BNB Chain</span>
          <h1 className="t-display">Running <em>Marque.</em></h1>
          <p className={styles.lede}>What it costs, how to run it from nothing, every key and what it can do, what happens when it breaks, and what is not true yet. Every figure is measured, with its source.</p>
        </header>

        <section className={styles.sec} aria-labelledby="cost">
          <h2 id="cost">1. Monthly running cost</h2>
          <dl className={styles.facts}>
            <div><dt>Server</dt><dd>One VPS: 6 vCPU, 11 GiB RAM, 193 GB disk (75% used), measured 26 Oct 2026. It runs the site, the indexer, probes, quotes, the keeper, the six reference sellers, the MCP server, Postgres and Redis. The plan&apos;s price is on the operator&apos;s invoice, not measured here.</dd></div>
            <div><dt>RPC</dt><dd>Pooled public BSC endpoints for reads and writes; a NodeReal key for transfer history; an archive endpoint used only to replay historical benchmarks.</dd></div>
            <div><dt>Storage</dt><dd>Database 6.6 GB; a nightly dump (124 MB of backups on disk, kept 7 days) with an encrypted offsite copy.</dd></div>
            <div><dt>Network fees per hire</dt><dd>{gas && gas.hireBnbMedian !== null ? <>Median {n(gas.hireBnbMedian, 7)} BNB{usd ? ` (about $${(gas.hireBnbMedian * usd).toFixed(3)})` : ''}, {n(gas.hireGasMedian)} gas over {n(gas.hireTxsMedian)} buyer transactions, paid by the buyer. Measured from {gas.hires} mainnet hires&apos; receipts.</> : 'Not measured just now.'}</dd></div>
            <div><dt>Network fees per settlement</dt><dd>{gas && gas.settleGasMedian !== null ? <>Median {n(gas.settleGasMedian)} gas; {gas.sponsoredSettlements} of {gas.settlements} settlements paid 0 BNB (a sponsored gas price). Measured from receipts.</> : 'Not measured just now.'}</dd></div>
          </dl>
          {gas ? <p className={styles.note}>Receipts read {new Date(gas.measuredAt).toISOString().slice(0, 16).replace('T', ' ')} UTC{usd ? `; BNB at ${usd.toFixed(2)} USDT from the PancakeSwap V3 pool` : ''}.</p> : null}
        </section>

        <section className={styles.sec} aria-labelledby="zero">
          <h2 id="zero">2. Running from zero</h2>
          <p>On an Ubuntu server with Node 22, pnpm, PostgreSQL 16, Redis, Caddy and PM2 installed. These are the commands the production server runs; a rehearsal on a clean server has not been recorded yet.</p>
          <pre className={styles.code}>{[
            'git clone https://github.com/talk2francis/Marque /root/marque && cd /root/marque',
            'pnpm install --frozen-lockfile',
            'sudo -u postgres createuser marque && sudo -u postgres createdb -O marque marque',
            '# write /root/.marque/secrets.env (0600): the variables listed in AGENTS.md "Env registry"',
            'set -a && . /root/.marque/secrets.env && set +a',
            'pnpm db:migrate',
            'pm2 start ecosystem.config.cjs && pm2 save',
            'bash scripts/deploy-web.sh   # builds, starts a slot, health-checks, switches Caddy',
          ].join('\n')}</pre>
          <p>The indexer rebuilds every agent and job from BSC from cursor zero. Probes, test results and run records are first-party measurements and come only from backup.</p>
        </section>

        <section className={styles.sec} aria-labelledby="keys">
          <h2 id="keys">3. Keys</h2>
          <p>User keys held by Marque: none.</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Key</th><th>Where it lives</th><th>What it can do</th><th>What it cannot</th></tr></thead>
              <tbody>{KEYS.map(([k, w, can, cannot]) => <tr key={k}><td>{k}</td><td>{w}</td><td>{can}</td><td>{cannot}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className={styles.sec} aria-labelledby="breaks">
          <h2 id="breaks">4. When it breaks</h2>
          <ul>
            <li>Alerts go to Telegram from a worker that checks, every minute: indexer lag, the reference sellers&apos; quotes and memory, hireable supply per category, the 5xx rate, the keeper&apos;s gas balance, disk, restart loops, paid jobs stuck without a notice, and every number on the 90-second walkthrough. Open incidents show on <a href="/status">/status</a>.</li>
            <li>Rollback is one command: <code>bash scripts/deploy-web.sh --rollback</code>. A deploy that fails its health checks never switches traffic.</li>
          </ul>
          <ol className={styles.incidents}>{INCIDENTS.map(([d, t]) => <li key={d + t}><b>{d}</b> {t}</li>)}</ol>
        </section>

        <section className={styles.sec} aria-labelledby="metric">
          <h2 id="metric">5. The figure BNB Chain can report</h2>
          <p>Outside buyers&apos; completed jobs per week and network, from <a href="/api/v1/proof">/api/v1/proof</a>. Outside means not in Marque&apos;s published team list; it does not prove the buyer is unrelated.</p>
          {weeks.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Week starting (UTC)</th><th>BSC mainnet</th><th>BSC testnet</th></tr></thead>
                <tbody>{weeks.map((w) => <tr key={w.week}><td>{w.week}</td><td>{w['56']}</td><td>{w['97']}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <p className={styles.note}>{proof ? 'No outside buyer has completed a job yet.' : 'The table could not be read just now.'}</p>}
        </section>

        <section className={styles.sec} aria-labelledby="standards">
          <h2 id="standards">6. Standards others can use</h2>
          <ul>
            <li><a href="/standard">The Marque Conformance Standard</a>: one-right-answer tests generated from the test code, with public cases at <a href="/api/v1/conformance/cases?test=MCS-HF-1">/api/v1/conformance/cases</a>.</li>
            <li><a href="/docs/attribution">The attribution convention</a>: how a job names the marketplace it came through, readable by every marketplace.</li>
            <li><a href="/docs/mcp">The MCP server</a>: read-and-plan tools for AI assistants, holding no keys.</li>
            <li>Acceptance criteria in the job terms: plain-words criteria from the Standard&apos;s tolerances, signed by sellers on the BNB Agent Studio SDK, and replayable with <code>pnpm marque verify-terms 56:&lt;job&gt;</code>.</li>
          </ul>
        </section>

        <section className={styles.sec} aria-labelledby="team">
          <h2 id="team">7. Brand and team</h2>
          <p>{BRAND.name} at marque.trade, @marquetrade on X. Built and operated by its founder, Francis (GitHub talk2francis). The code is public: <a href="https://github.com/talk2francis/Marque">github.com/talk2francis/Marque</a>.</p>
        </section>

        <section className={styles.sec} aria-labelledby="limits">
          <h2 id="limits">8. What is not true yet</h2>
          <ul>{HONEST_LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
