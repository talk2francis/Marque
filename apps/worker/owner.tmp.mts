// Testnet owner actions for the worker tests (W2 to W5). The test owner is a testnet-only key.
//   npx tsx owner.tmp.mts create <trigger> <target> <budgetUsdc> [hours]
//   npx tsx owner.tmp.mts borrow <usdc>
//   npx tsx owner.tmp.mts end <guard> [clear]
//   npx tsx owner.tmp.mts health
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, keccak256, parseAbi, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { loadKeystore } from '@marque/commerce'
import { charterFactoryAbi, CHARTER_CHAINS, loanGuardAbi } from '../../packages/charters/src/index.ts'

const RPC = 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
const chain = CHARTER_CHAINS[97]
const vUSDC = chain.markets[1]!
const pub = createPublicClient({ chain: bscTestnet, transport: http(RPC, { timeout: 30_000 }) })
const owner = privateKeyToAccount(loadKeystore('/root/.marque/charters/test-owner-97'))
const w = createWalletClient({ account: owner, chain: bscTestnet, transport: http(RPC, { timeout: 30_000 }) })
async function send(to: Address, data: Hex) {
  const hash = await w.sendTransaction({ to, data, gasPrice: 100_000_000n })
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 })
  if (r.status !== 'success') throw new Error(`reverted ${hash}`)
  return { hash, block: r.blockNumber.toString() }
}
const health = async () => Number((await pub.readContract({ address: chain.factory!, abi: charterFactoryAbi, functionName: 'healthOf', args: [owner.address] }))[0]) / 1e18
const h = (n: string) => BigInt(Math.round(Number(n) * 100)) * 10n ** 16n
const [cmd, ...a] = process.argv.slice(2)

if (cmd === 'health') console.log(JSON.stringify({ owner: owner.address, health: await health(), usdc: (await pub.readContract({ address: vUSDC.token, abi: erc20Abi, functionName: 'balanceOf', args: [owner.address] })).toString() }))
else if (cmd === 'create') {
  const params = { vDebt: vUSDC.vToken, trigger: h(a[0]!), target: h(a[1]!), budget: BigInt(Math.round(Number(a[2]) * 1e6)), tip: 0n, expiresAt: BigInt(Math.floor(Date.now() / 1000) + Number(a[3] ?? 48) * 3600) }
  const salt = keccak256(`0x${Buffer.from(`w-${Date.now()}`).toString('hex')}`)
  const guard = await pub.readContract({ address: chain.factory!, abi: charterFactoryAbi, functionName: 'predict', args: [owner.address, params, salt] }) as Address
  const ap = await send(vUSDC.token, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [guard, params.budget] }))
  const cr = await send(chain.factory!, encodeFunctionData({ abi: charterFactoryAbi, functionName: 'create', args: [params, salt] }))
  console.log(JSON.stringify({ guard, approve: ap, create: cr, health: await health() }))
} else if (cmd === 'borrow') {
  const r = await send(vUSDC.vToken, encodeFunctionData({ abi: parseAbi(['function borrow(uint256) returns (uint256)']), functionName: 'borrow', args: [BigInt(Math.round(Number(a[0]) * 1e6))] }))
  console.log(JSON.stringify({ borrow: r, health: await health() }))
} else if (cmd === 'end') {
  const guard = a[0] as Address
  const e = await send(guard, encodeFunctionData({ abi: loanGuardAbi, functionName: 'end' }))
  const c = a[1] === 'clear' ? await send(vUSDC.token, encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [guard, 0n] })) : null
  console.log(JSON.stringify({ end: e, clear: c }))
} else console.log('usage: create | borrow | end | health')
