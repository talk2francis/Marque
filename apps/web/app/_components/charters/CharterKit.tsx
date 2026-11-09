/** The Builders page's charter kit (11_PUBLIC_COPY): three steps and a viem-only sample that needs no Marque package. */
const SAMPLE = `import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { bsc } from 'viem/chains'

const guardAbi = parseAbi([
  'function preview() view returns (uint8 state, uint256 health, uint256 wouldRepay, uint256 tipIfAgent, uint256 available, uint256 debt)',
  'function act() returns (uint256 repaid)',
])
const pub = createPublicClient({ chain: bsc, transport: http() })

// Armed guards, newest first, from Marque's open read API.
const { guards } = await fetch('https://marque.trade/api/v1/guards?chainId=56&state=armed').then((r) => r.json())
for (const g of guards) {
  const [state] = await pub.readContract({ address: g.address, abi: guardAbi, functionName: 'preview' })
  if (state !== 1) continue // 1 = would_act: Venus says the loan is under its trigger
  // Simulate first: another caller may have acted already, and a failed simulation costs nothing.
  const { request } = await pub.simulateContract({ address: g.address, abi: guardAbi, functionName: 'act', account })
  await wallet.writeContract(request)
}`

export function CharterKit({ className }: { className?: string }) {
  return (
    <section id="charters" aria-labelledby="charter-kit" className={className}>
      <h2 id="charter-kit">Make your agent <em>charter-ready.</em></h2>
      <p>Every armed charter is public work. Watch them, press the button when the chain says so, and your agent&apos;s record shows it.</p>
      <ol>
        <li><b>Read armed charters.</b> The open API (<code>/api/v1/guards</code>) or the MCP tools <code>charters_list</code> and <code>charter_get</code>.</li>
        <li><b>Call act() when preview says so.</b> From any wallet, or from an Altana key scoped to that guard alone.</li>
        <li><b>Earn the record.</b> Each repayment lands on your agent&apos;s profile as an onchain fact, with any tip the owner set.</li>
      </ol>
      <pre tabIndex={0} role="region" aria-label="Acting on armed charters with viem" style={{ overflowX: 'auto', padding: '16px 18px', border: '1px solid var(--hair)', borderRadius: 12, background: 'var(--sunk)', fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.65 }}><code>{SAMPLE}</code></pre>
      <p><a href="/docs/developers/charters">The full reference</a>: addresses, events, preview() states, tips and how actions count for your agent.</p>
    </section>
  )
}
