/**
 * P2-05 part 1, step 4: what each Marque wallet needs on BSC mainnet. Gas per call is
 * MEASURED from real testnet receipts (a seller submit, a router settle); the gas price is
 * read from mainnet now; sponsorship is asked of MegaFuel with pm_isSponsorable (a query,
 * nothing is sent). Writes docs/phase2/evidence/mainnet-funding-table.json.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { encodeFunctionData, formatEther, type Hex, type Address } from 'viem'
import { chainClient } from '../src/chain.js'
import { NETWORKS } from '../src/config.js'
import { evaluatorRouterAbi } from '../src/generated.js'

const SUBMIT_TX = '0x024bc968bade5d0808844a9a2d452a3a4a5b39664d4c9dae47feaf5e41d86124' as Hex // Keel, testnet job 1346
const SETTLE_TX = '0xbfea5732e1c732a2bd2a181beec4857aba5df37ee5ea3079291466d982afeec8' as Hex // router.settle, testnet
const WALLETS: Array<[string, Address, 'submit' | 'settle']> = [
  ['Bound', '0x5B1c9fBc684a1722Bb5C66C0B22F149dA69768d6', 'submit'],
  ['Lattice', '0x5aAF7b5B2170986C59279682Bd714c475ae8C718', 'submit'],
  ['Sluicegate', '0x253F7Ad5D52099C4a2293418a661e9974DfB5e84', 'submit'],
  ['Keel', '0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00', 'submit'],
  ['Redcell', '0x1F0D0eF5a279888E3b86c8a99A8A99F19fCEc587', 'submit'],
  ['Tidemark', '0x8122991297DC98Dc5c735fDE90a501528922aFdC', 'submit'],
  ['Keeper', '0x781ee69bf9f9C14E2BC496181714f4DF5348556a', 'settle'],
]
const t97 = chainClient(97), m = chainClient(56)
const [sub, subR, set] = await Promise.all([t97.getTransaction({ hash: SUBMIT_TX }), t97.getTransactionReceipt({ hash: SUBMIT_TX }), t97.getTransactionReceipt({ hash: SETTLE_TX })])
const gas = { submit: subR.gasUsed, settle: set.gasUsed }
const gasPrice = await m.getGasPrice()
const n = NETWORKS[56]

async function sponsorable(from: Address, to: Address, data: Hex, g: bigint): Promise<unknown> {
  const body = { jsonrpc: '2.0', id: 1, method: 'pm_isSponsorable', params: [{ from, to, value: '0x0', data, gas: `0x${(g * 13n / 10n).toString(16)}` }] }
  const r = await fetch('https://bsc-megafuel.nodereal.io/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch((e) => ({ error: String(e) }))
  return (r as { result?: unknown; error?: unknown }).result ?? (r as { error?: unknown }).error
}
const settleData = encodeFunctionData({ abi: evaluatorRouterAbi, functionName: 'settle', args: [1n, '0x'] })
const rows = []
for (const [name, addr, kind] of WALLETS) {
  const bal = await m.getBalance({ address: addr })
  const perCall = gas[kind] * gasPrice
  const need100 = perCall * 100n
  const sp = kind === 'submit' ? await sponsorable(addr, n.commerce, sub.input, gas.submit) : await sponsorable(addr, n.router, settleData, gas.settle)
  rows.push({ name, address: addr, call: kind === 'submit' ? 'AgenticCommerce submit (seller delivers)' : 'EvaluatorRouter.settle', balanceBnb: formatEther(bal), gasPerCall: gas[kind].toString(), bnbFor100: formatEther(need100), sponsorable: sp })
}
const out = { measuredAt: new Date().toISOString(), mainnetGasPriceGwei: Number(gasPrice) / 1e9, gasMeasuredFrom: { submit: SUBMIT_TX, settle: SETTLE_TX }, rows }
writeFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/phase2/evidence/mainnet-funding-table.json'), JSON.stringify(out, null, 2) + '\n')
console.log('gas price', out.mainnetGasPriceGwei, 'gwei')
for (const r of rows) console.log(`${r.name.padEnd(11)} ${r.address} bal ${r.balanceBnb.padEnd(10)} ${r.call.padEnd(42)} gas ${r.gasPerCall} x100 = ${r.bnbFor100} BNB  sponsor=${JSON.stringify(r.sponsorable)}`)
