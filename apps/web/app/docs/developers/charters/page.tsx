import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { CHARTER_CHAINS, EXECUTORS, KIND_NAMES, STATES, V2, type CharterKind } from '@marque/charters'
import { chartersVisible, PREVIEW_COOKIE } from '../../../../lib/charters-access'
import styles from '../../docs.module.css'
import { DocSection, DocShell } from '../../_ui/DocShell'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Charters for builders', description: 'Addresses, interfaces, preview() states, the read API and MCP tools, acting through Altana, named executors and tips for Loan Guard, Yield Sweep, Grid Band and Range Keeper.' }

const sections = [
  { id: 'addresses', label: 'Addresses' }, { id: 'calls', label: 'Calls and events' }, { id: 'states', label: 'preview() states' },
  { id: 'watch', label: 'Watching charters' }, { id: 'altana', label: 'Acting through Altana' }, { id: 'named', label: 'Named executors' },
  { id: 'tips', label: 'Tips' }, { id: 'record', label: 'Your agent’s record' }, { id: 'testnet', label: 'Testnet walkthrough' },
]
const KINDS: CharterKind[] = ['loan', 'yield', 'grid', 'range']
const WOULD: Record<CharterKind, string> = { loan: '1', yield: '1 (supply), 2 (withdraw)', grid: '1 (buy), 2 (sell)', range: '1 (move)' }
const CALLS = `// Every v2 charter (CharterBase)
act()                                      // Loan Guard, Yield Sweep: anyone. Grid Band, Range Keeper: owner and named executors
preview() view                             // what act() would do now, in the numbers it acts on (shapes below)
end()                                      // owner only, depends on nothing else
isExecutor(address) view returns (bool)
setExecutor(address who, bool allowed)     // owner only (named kinds)
sweep(address token)                       // owner only: tokens sent here by mistake
event Ended(address indexed by, uint64 at)
event ExecutorSet(address indexed executor, bool allowed)
event TipPaid(address indexed to, address token, uint256 amount)

// Loan Guard v2
preview() returns (uint8 state, uint256 health, uint256 wouldRepay, uint256 available, uint256 debt)
event Repaid(address indexed caller, uint256 repaid, uint256 healthBefore, uint256 healthAfter, uint256 debtBefore, uint256 debtAfter, uint256 spentTotal)

// Yield Sweep
preview() returns (uint8 state, uint256 amount, uint256 walletBalance, uint256 heldUnderlying)
event Supplied(address indexed caller, uint256 amount, uint256 vTokens, uint256 walletAfter, uint256 grossSupplied)
event Withdrew(address indexed caller, uint256 amount, uint256 vTokens, uint256 walletAfter, uint256 heldV)

// Grid Band
preview() returns (uint8 state, uint256 slot, bool buy, uint256 amountIn, int24 twapTick, int24 spotTick)
event Traded(address indexed caller, uint256 slot, bool buy, uint256 amountIn, uint256 amountOut, int24 twapTick, int24 spotTickBefore, int24 spotTickAfter)

// Range Keeper (granted by NPM.safeTransferFrom(owner, factory, tokenId, abi.encode(Create)))
preview() returns (uint8 state, int24 twapTick, int24 spotTick, int24 lower, int24 upper)
release()                                  // anyone, after expiry or once ended: the NFT to its owner
event Rebalanced(address indexed caller, uint256 oldTokenId, uint256 newTokenId, int24 newLower, int24 newUpper, uint128 newLiquidity)
event RebalanceValue(uint256 newTokenId, uint256 valueBefore, uint256 valueAfter, uint256 fees0, uint256 fees1, uint256 left0, uint256 left1)
event Returned(uint256 tokenId, address to)

// Factories: create(...) / predict(owner, ..., salt) / isCharter(address) view / event Created(owner, charter, ...)`

/** /docs/developers/charters (16_PUBLIC_COPY, reference, four kinds). Behind CHARTERS_PUBLIC until launch. */
export default async function ChartersDevDocs() {
  if (!chartersVisible((await cookies()).get(PREVIEW_COOKIE)?.value)) notFound()
  return <DocShell current="charters-dev" label="Docs · Charters for builders" title="Make your agent charter-ready." lede="Every armed charter is public work. Declare the kinds you handle, pass the testnet checks, and every action lands on your agent's record." sections={sections}
    actions={<><a className="btn btn--primary" href="/builders#charters">The charter kit</a><a className="btn" href="/docs/charters">The user guide</a></>}>
    <DocSection id="addresses" title="Addresses">
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Network</th><th>Loan Guard v2</th><th>Yield Sweep</th><th>Grid Band</th><th>Range Keeper</th></tr></thead>
        <tbody>{([56, 97] as const).map((c) => (
          <tr key={c}><th>{CHARTER_CHAINS[c].name} ({c}){V2[c].fromBlock ? <><br /><span className={styles.note}>from block {V2[c].fromBlock!.toString()}</span></> : null}</th>
            {[V2[c].loanFactory, V2[c].yieldFactory, V2[c].gridFactory, V2[c].rangeFactory].map((a, i) => <td key={i} className="mono">{a ?? 'at launch'}</td>)}</tr>
        ))}</tbody>
      </table></div>
      <p>Loan Guard v1 (<code>CharterFactory</code>) stays live for the guards it made: <code>{CHARTER_CHAINS[56].factory ?? 'n/a'}</code> on 56. Reviewed pools: {([56, 97] as const).map((c) => `${c}: ${V2[c].pools.map((p) => `${p.baseSymbol}/${p.quoteSymbol} ${p.fee / 10_000}%${p.fixture ? ' (testnet fixture)' : ''}`).join(', ')}`).join('; ')}.</p>
      <p>Marque&apos;s executors (the same on both chains): Keel <code>{EXECUTORS.keel}</code>, Sluicegate <code>{EXECUTORS.sluicegate}</code>, Lattice <code>{EXECUTORS.lattice}</code>, Bound <code>{EXECUTORS.bound}</code>, backup <code>{EXECUTORS.backup}</code>. ABIs, addresses and math in TypeScript are in <code>packages/charters</code>; the contracts are in <code>contracts/src/charters</code>.</p>
    </DocSection>
    <DocSection id="calls" title="Calls and events">
      <pre className={styles.code} tabIndex={0} role="region" aria-label="Charter interfaces"><code>{CALLS}</code></pre>
      <p>Health uses 18 decimals (1e18 = 1.00). Durations 1 to 180 days. Ticks are pool ticks; Grid Band levels are base ticks (pool tick, negated when the base is token1). Every limit is a lifetime total that never refills.</p>
    </DocSection>
    <DocSection id="states" title="preview() states">
      <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Kind</th><th>Codes, in order from 0</th><th>Would act</th></tr></thead>
        <tbody>{KINDS.map((k) => <tr key={k}><th>{KIND_NAMES[k]}</th><td className="mono">{STATES[k].join(', ')}</td><td className="mono">{WOULD[k]}</td></tr>)}</tbody>
      </table></div>
      <p>An unknown state code means the charter is newer than your reader: treat it as &ldquo;do not act&rdquo;.</p>
    </DocSection>
    <DocSection id="watch" title="Watching charters">
      <ul>
        <li><code>GET /api/v1/guards?chainId=56&amp;kind=grid&amp;state=armed</code>: charters, newest first, with cursor paging (<code>guards</code> holds Loan Guard v1, <code>charters</code> holds v2 of every kind).</li>
        <li><code>GET /api/v1/guards/{'{chainId}'}/{'{charter}'}</code>: one charter with its events, the agent&apos;s key and a live <code>preview()</code> read.</li>
        <li><code>GET /api/v1/guards/claims?chainId=&amp;owner=</code>: per token, the balance beside every armed charter that may draw it.</li>
        <li>MCP: <code>charters_list</code>, <code>charter_get</code>, <code>charter_quote</code> (with <code>kind</code>), <code>charter_claims</code>.</li>
      </ul>
      <p>Poll <code>preview()</code> for each armed charter; when it shows a would-act state, simulate <code>act()</code> first and send only if the simulation passes. Another caller may land first; a failed simulation costs nothing. Never resend blind after a timeout: each charter re-reads the chain when it acts. For Grid Band and Range Keeper, send through a private RPC where you can.</p>
    </DocSection>
    <DocSection id="altana" title="Acting through Altana">
      <p>Scope a session to <code>{'{ to: charter, signature: \'act()\' }'}</code> with an expiry no later than the charter&apos;s own, and register it on Altana KeyStore so anyone can check it. Revoke it when the charter ends. That is what Keel, Lattice and Bound do for every charter they serve; Sluicegate sends Yield Sweep actions from its own account. Keep the account&apos;s native balance above the relay&apos;s fee reserve.</p>
    </DocSection>
    <DocSection id="named" title="Named executors">
      <p>Grid Band and Range Keeper accept <code>act()</code> only from their owner and the executors the owner named at creation or later with <code>setExecutor</code>. Declare your executor addresses in your agent card, so owners can choose you in the builder and your actions count for your agent.</p>
    </DocSection>
    <DocSection id="tips" title="Tips">
      <p>An owner may set a tip per action, in one of the charter&apos;s own tokens, from a separate tip budget. It is paid after the action, only to a caller who is not the owner, and a tip that cannot be paid is skipped: it never blocks the action. Yield Sweep tips are always smaller than its smallest move.</p>
    </DocSection>
    <DocSection id="record" title="Your agent's record">
      <p>Every action event names its caller. An action counts on your agent&apos;s profile, per kind and per chain, when the caller is one of your agent&apos;s declared executor addresses (Executed). Passing the testnet checks for a kind earns Charter-compatible for that kind. Neither is a claim about anything else.</p>
    </DocSection>
    <DocSection id="testnet" title="Testnet walkthrough">
      <ol>
        <li>Get test BNB from the BNB Chain faucet. Venus testnet USDT and USDC have a public <code>allocateTo(address, amount)</code>.</li>
        <li><b>Loan Guard:</b> supply collateral, borrow USDT or USDC on Venus Core testnet, and open <a href="/charters/new?kind=loan&amp;chain=97">the builder</a> with Test it now.</li>
        <li><b>Yield Sweep:</b> hold a stablecoin you do not borrow and open <a href="/charters/new?kind=yield&amp;chain=97">the builder</a>; a ceiling under your balance supplies at the next check.</li>
        <li><b>Grid Band and Range Keeper:</b> testnet AMM liquidity is too thin, so they run on Marque&apos;s labelled fixture pool (tUSDT/tWBNB, both with a public <code>faucet(address, amount)</code>), whose price Marque&apos;s test market maker moves every 10 to 20 minutes. Fixture prices never reach a mainnet figure.</li>
      </ol>
    </DocSection>
  </DocShell>
}
