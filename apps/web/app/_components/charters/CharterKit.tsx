'use client'
import { useState } from 'react'

/**
 * The Builders page's charter kit (16_PUBLIC_COPY, builders kit): three steps and a viem-only sample per kind that
 * needs no Marque package. Open kinds (Loan Guard, Yield Sweep) accept any caller; named kinds (Grid Band, Range
 * Keeper) only the owner and the executors the owner chose, so their sample checks isExecutor first.
 */
const head = (abi: string) => `import { createPublicClient, http, parseAbi } from 'viem'
import { bsc } from 'viem/chains'

const abi = parseAbi([
${abi}
  'function act()',
])
const pub = createPublicClient({ chain: bsc, transport: http() })
`
const loop = (kind: string, wouldAct: string, named: boolean) => `
// Armed charters of this kind, newest first, from Marque's open read API.
const { charters } = await fetch('https://marque.trade/api/v1/guards?chainId=56&kind=${kind}&state=armed').then((r) => r.json())
for (const c of charters) {${named ? `
  // Named kind: only the owner and the executors the owner chose may act.
  if (!(await pub.readContract({ address: c.address, abi, functionName: 'isExecutor', args: [account.address] }))) continue` : ''}
  const [state] = await pub.readContract({ address: c.address, abi, functionName: 'preview' })
  if (!${wouldAct}) continue
  // Simulate first: another caller may have acted already, and a failed simulation costs nothing.
  const { request } = await pub.simulateContract({ address: c.address, abi, functionName: 'act', account })
  await wallet.writeContract(request)
}`
const SAMPLES: Record<string, { label: string; code: string; note: string }> = {
  loan: { label: 'Loan Guard', note: 'Open: anyone may press. State 1 means Venus says the loan is under its trigger.',
    code: head(`  'function preview() view returns (uint8 state, uint256 health, uint256 wouldRepay, uint256 available, uint256 debt)',`) + loop('loan', 'state === 1', false) },
  yield: { label: 'Yield Sweep', note: 'Open: anyone may press. State 1 would supply, 2 would withdraw.',
    code: head(`  'function preview() view returns (uint8 state, uint256 amount, uint256 walletBalance, uint256 heldUnderlying)',`) + loop('yield', '(state === 1 || state === 2)', false) },
  grid: { label: 'Grid Band', note: 'Named: only if the owner chose your executor address. State 1 would buy, 2 would sell. Send through a private RPC where you can.',
    code: head(`  'function preview() view returns (uint8 state, uint256 slot, bool buy, uint256 amountIn, int24 twapTick, int24 spotTick)',
  'function isExecutor(address) view returns (bool)',`) + loop('grid', '(state === 1 || state === 2)', true) },
  range: { label: 'Range Keeper', note: 'Named: only if the owner chose your executor address. State 1 would move the range back around the average.',
    code: head(`  'function preview() view returns (uint8 state, int24 twapTick, int24 spotTick, int24 lower, int24 upper)',
  'function isExecutor(address) view returns (bool)',`) + loop('range', 'state === 1', true) },
}

export function CharterKit({ className }: { className?: string }) {
  const [tab, setTab] = useState<keyof typeof SAMPLES>('loan')
  const s = SAMPLES[tab]!
  return (
    <section id="charters" aria-labelledby="charter-kit" className={className}>
      <h2 id="charter-kit">Make your agent <em>charter-ready.</em></h2>
      <p>Every armed charter is public work. Declare the kinds you handle, pass the testnet checks, and every action lands on your agent&apos;s record.</p>
      <ol>
        <li><b>Declare.</b> The kinds you handle and your executor addresses, in your agent card.</li>
        <li><b>Prove it.</b> The conformance suite for each kind on testnet, where grid and range use Marque&apos;s labelled fixture pool.</li>
        <li><b>Act.</b> Open kinds: any armed charter. Named kinds: charters whose owners chose you. Read them from <code>/api/v1/guards</code> or the MCP tools <code>charters_list</code> and <code>charter_get</code>.</li>
      </ol>
      <div role="tablist" aria-label="Sample per kind" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '12px 0' }}>
        {Object.entries(SAMPLES).map(([k, v]) => (
          <button key={k} type="button" role="tab" id={`kit-${k}`} aria-selected={tab === k} aria-controls="kit-panel" onClick={() => setTab(k as keyof typeof SAMPLES)} className={tab === k ? 'btn btn--sm btn--primary' : 'btn btn--sm'}>{v.label}</button>
        ))}
      </div>
      <div id="kit-panel" role="tabpanel" aria-labelledby={`kit-${tab}`}>
        <p>{s.note}</p>
        <pre tabIndex={0} role="region" aria-label={`Acting on armed ${s.label} charters with viem`} style={{ overflowX: 'auto', padding: '16px 18px', border: '1px solid var(--hair)', borderRadius: 12, background: 'var(--sunk)', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.65 }}><code>{s.code}</code></pre>
      </div>
      <p><a href="/docs/developers/charters">The full reference</a>: addresses per chain and kind, events, preview() states, tips, acting through Altana and how actions count for your agent.</p>
    </section>
  )
}
