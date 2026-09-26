/**
 * P2-05 part 1: the buyer rail against the REAL mainnet contracts on an anvil fork
 * (anvil --fork-url <archive> --port 8546 --chain-id 56). Nothing touches mainnet.
 * For USDT (createJobWithToken) and U (createJob): createJob -> registerJob -> setBudget
 * -> approve exact -> fund, from a fresh client funded by impersonating a large holder.
 */
import { createPublicClient, createTestClient, createWalletClient, http, erc20Abi, parseEther, decodeEventLog, type Hex, type Address } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { bsc } from 'viem/chains'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { NETWORKS } from '../src/config.js'
import { createJobCall, paymentCalls, type Call, type HireTerms } from '../src/calls.js'
import { agenticCommerceAbi } from '../src/generated.js'

const RPC = 'http://127.0.0.1:8546'
const transport = http(RPC, { timeout: 120_000 })
const pub = createPublicClient({ chain: bsc, transport })
const test = createTestClient({ chain: bsc, mode: 'anvil', transport })
const net = NETWORKS[56]
const HOLDER = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3' as Address
const PROVIDER = '0xdF1074a272C53A1a10b96Fa0201Eb58bbbaaFe00' as Address // Keel's mainnet wallet
const STATUS = ['OPEN', 'FUNDED', 'SUBMITTED', 'COMPLETED', 'REJECTED', 'EXPIRED']
const out: Record<string, unknown> = { forkBlock: (await pub.getBlockNumber()).toString(), contracts: { commerce: net.commerce, router: net.router, policy: net.policy } }

for (const symbol of ['USDT', 'U']) {
  const asset = net.assets.find((a) => a.symbol === symbol)!
  const client = privateKeyToAccount(generatePrivateKey())
  const w = createWalletClient({ account: client, chain: bsc, transport })
  await test.setBalance({ address: client.address, value: parseEther('1') })
  await test.impersonateAccount({ address: HOLDER })
  await test.setBalance({ address: HOLDER, value: parseEther('1') })
  const price = parseEther('0.05')
  const hw = createWalletClient({ account: HOLDER, chain: bsc, transport })
  await pub.waitForTransactionReceipt({ hash: await hw.writeContract({ address: asset.address, abi: erc20Abi, functionName: 'transfer', args: [client.address, price] }) })
  await test.stopImpersonatingAccount({ address: HOLDER })

  const terms: HireTerms = { chainId: 56, provider: PROVIDER, token: asset, price, priceLabel: `0.05 ${symbol}`, agentName: 'Keel', expiredAt: BigInt(Math.floor(Date.now() / 1000) + 7 * 86400 + 3600), description: `P2-05 fork test, ${symbol}` }
  const steps: Record<string, string> = {}
  const send = async (c: Call): Promise<Hex> => {
    const h = await w.writeContract({ address: c.to, abi: c.abi, functionName: c.functionName, args: c.args as unknown[] } as never)
    const r = await pub.waitForTransactionReceipt({ hash: h })
    steps[`${c.step}:${c.functionName}`] = r.status
    if (r.status !== 'success') throw new Error(`${symbol} ${c.step} (${c.functionName}) reverted`)
    return h
  }
  try {
    const create = createJobCall(terms)
    const h = await send(create)
    const r = await pub.getTransactionReceipt({ hash: h })
    let jobId: bigint | null = null
    for (const l of r.logs) { try { const d = decodeEventLog({ abi: agenticCommerceAbi, data: l.data, topics: l.topics }); if (d.eventName === 'JobCreated') jobId = (d.args as { jobId: bigint }).jobId } catch { /* other */ } }
    for (const c of paymentCalls(terms, jobId!, 0n)) await send(c)
    const job = await pub.readContract({ address: net.commerce, abi: agenticCommerceAbi, functionName: 'getJob', args: [jobId!] }) as { status: number; budget: bigint }
    const bound = await pub.readContract({ address: net.commerce, abi: agenticCommerceAbi, functionName: 'jobPaymentToken', args: [jobId!] }) as Address
    const escrowed = await pub.readContract({ address: asset.address, abi: erc20Abi, functionName: 'balanceOf', args: [client.address] })
    out[symbol] = { ok: job.status === 1 && bound.toLowerCase() === asset.address.toLowerCase(), createFunction: create.functionName, jobId: jobId!.toString(), status: STATUS[job.status], budget: job.budget.toString(), boundToken: bound, clientBalanceAfter: escrowed.toString(), steps }
  } catch (e) {
    out[symbol] = { ok: false, error: (e as Error).message.split('\n')[0], steps }
  }
  console.log(symbol, JSON.stringify(out[symbol]))
}
writeFileSync(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../docs/phase2/evidence/mainnet-fork-test.json'), JSON.stringify(out, null, 2) + '\n')
