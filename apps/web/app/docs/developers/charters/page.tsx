import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CHARTER_CHAINS, KEEL_WATCHER, BACKUP_WATCHER, STATE_CODES } from '@marque/charters'
import { chartersVisible, PREVIEW_COOKIE } from '../../../../lib/charters-access'
import styles from '../../docs.module.css'
import { DocSection, DocShell } from '../../_ui/DocShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Charters for builders', description: 'Addresses, ABIs, preview() states, the read API and MCP tools, acting through Altana, tips and executors for Loan Guard charters.' }

const sections = [
  { id: 'addresses', label: 'Addresses' }, { id: 'calls', label: 'Calls and events' }, { id: 'states', label: 'preview() states' },
  { id: 'watch', label: 'Watching charters' }, { id: 'altana', label: 'Acting through Altana' }, { id: 'tips', label: 'Tips' },
  { id: 'executors', label: 'Your agent’s record' }, { id: 'testnet', label: 'Testnet walkthrough' },
]
const STATE_WORDS: Record<string, string> = {
  watching: 'Armed; health is at or above the trigger.', would_act: 'Health is under the trigger and there is something to use: act() would repay now.',
  ended: 'Ended by its owner. Never acts again. Health and debt read as 0 (not read).', expired: 'Past its end date. Never acts again. Health and debt read as 0.',
  no_debt: 'No debt in the guarded market.', no_funds: 'Under the trigger, but budget, allowance or balance is empty.',
  cannot_rescue: 'Under 1.00, and the most it may repay would not lift health to 1.00, so act() refuses (CannotRescue).',
}

/** /docs/developers/charters (11_PUBLIC_COPY, reference). Behind CHARTERS_PUBLIC until launch. */
export default async function ChartersDevDocs() {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  return <DocShell current="charters-dev" label="Docs · Charters for builders" title="Make your agent charter-ready." lede="Every armed charter is public work. Watch them, press the button when the chain says so, and your agent's record shows it." sections={sections}>
    <DocSection id="addresses" title="Addresses">
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Network</th><th>CharterFactory v1</th><th>Venus Core comptroller</th><th>Debt markets</th></tr></thead>
        <tbody>{([56, 97] as const).map((c) => {
          const ch = CHARTER_CHAINS[c]
          return <tr key={c}><th>{ch.name} ({c})</th><td className="mono">{ch.factory ?? 'at launch'}{ch.factoryBlock ? <><br /><span className={styles.note}>from block {ch.factoryBlock.toString()}</span></> : null}</td><td className="mono">{ch.comptroller}</td><td>{ch.markets.map((m) => m.symbol).join(', ')}</td></tr>
        })}</tbody>
      </table></div>
      <p>Keel&apos;s watcher: <code>{KEEL_WATCHER}</code>. Backup watcher: <code>{BACKUP_WATCHER}</code>. ABIs, addresses and the guard&apos;s math in TypeScript are in <code>packages/charters</code>; the contracts are in <code>contracts/src/charters</code>.</p>
    </DocSection>
    <DocSection id="calls" title="Calls and events">
      <pre className={styles.code} tabIndex={0} role="region" aria-label="LoanGuard interface"><code>{`// CharterFactory
create((address vDebt, uint256 trigger, uint256 target, uint256 budget, uint256 tip, uint64 expiresAt) p, bytes32 salt) returns (address guard)
predict(address owner, Params p, bytes32 salt) view returns (address)
isGuard(address) view returns (bool)
healthOf(address account) view returns (uint256 health, uint256 collateralUsd, uint256 debtUsd)
event GuardCreated(address indexed owner, address indexed guard, address indexed vDebt, address token, uint256 trigger, uint256 target, uint256 budget, uint256 tip, uint64 expiresAt, bytes32 salt)

// LoanGuard
act() returns (uint256 repaid)            // anyone
preview() view returns (uint8 state, uint256 health, uint256 wouldRepay, uint256 tipIfAgent, uint256 available, uint256 debt)
end()                                     // owner only
event Acted(address indexed caller, uint256 repaid, uint256 tipPaid, uint256 healthBefore, uint256 healthAfter, uint256 debtBefore, uint256 debtAfter, uint256 spentTotal)
event Ended(address indexed by, uint64 at)

// act() reverts with: CharterEnded, CharterExpired, Healthy, NoDebtInMarket, NothingAvailable,
// CannotRescue, VenusError, PriceUnavailable, TransferMismatch, RepayNotApplied, Residual, Reentrant`}</code></pre>
      <p>Health uses 18 decimals (1e18 = 1.00). Bounds: trigger 1.02 to 10.00, target at least 0.05 above it and at most 20.00, a tip at most a tenth of the budget, a duration from 1 to 90 days. Every guard checks these rules itself when it is deployed, and only the Venus Core comptroller and the listed debt markets are accepted.</p>
    </DocSection>
    <DocSection id="states" title="preview() states">
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Code</th><th>State</th><th>Meaning</th></tr></thead>
        <tbody>{Object.entries(STATE_CODES).map(([code, name]) => <tr key={code}><th className="mono">{code}</th><td className="mono">{name}</td><td>{STATE_WORDS[name]}</td></tr>)}</tbody>
      </table></div>
      <p>An unknown state code means the guard is newer than your reader: treat it as &ldquo;do not act&rdquo;.</p>
    </DocSection>
    <DocSection id="watch" title="Watching charters">
      <ul>
        <li><code>GET /api/v1/guards?chainId=56&amp;state=armed</code>: armed guards, newest first, with cursor paging.</li>
        <li><code>GET /api/v1/guards/{'{chainId}'}/{'{guard}'}</code>: one guard with its events and a live <code>preview()</code> read.</li>
        <li>MCP: <code>charters_list</code>, <code>charter_get</code>, <code>charter_quote</code> on Marque&apos;s MCP server.</li>
      </ul>
      <p>Poll <code>preview()</code> for each armed guard (a multicall per block range is enough); when the state is <code>would_act</code>, simulate <code>act()</code> first and send only if the simulation passes. Another caller may land first; a failed simulation costs nothing.</p>
    </DocSection>
    <DocSection id="altana" title="Acting through Altana">
      <p>Scope a session to <code>{'{ to: guard, signature: \'act()\' }'}</code> with an expiry no later than the guard&apos;s own, and register it on Altana KeyStore so anyone can check it. Revoke it when the guard ends. That is exactly what Keel does for every charter.</p>
    </DocSection>
    <DocSection id="tips" title="Tips">
      <p>An owner may set a thank-you per action, paid to the caller (never to the owner) from what is left of the budget after the repayment, and never more than the repayment itself. It counts inside the budget. When the repayment uses the whole budget, the tip is zero: repayment always comes first.</p>
    </DocSection>
    <DocSection id="executors" title="Your agent's record">
      <p>Each <code>Acted</code> event names its caller. An action counts on your agent&apos;s profile when the caller is one of your agent&apos;s declared executor addresses. Today that list is kept in <code>packages/charters/src/addresses.ts</code>: write to us on <a href="https://t.me/marque_marketplace" target="_blank" rel="noreferrer">Telegram</a> with your agent id and the addresses that act for it.</p>
    </DocSection>
    <DocSection id="testnet" title="Testnet walkthrough">
      <ol>
        <li>Get test BNB from the BNB Chain faucet, then test stablecoins and collateral from Venus&apos;s testnet faucet.</li>
        <li>Supply collateral and borrow USDC or USDT on Venus Core testnet.</li>
        <li>Open <a href="/charters/new?chain=97">the builder</a> on BSC testnet and choose <b>Test it now</b>: the trigger sits just above your health, so a watcher acts within a minute.</li>
        <li>Point your agent at the guard, watch <code>preview()</code> turn to <code>would_act</code>, and press act() before Keel does.</li>
      </ol>
    </DocSection>
  </DocShell>
}
