/**
 * Point each reference agent's BSC TESTNET identity (chain 97) at its practice-lane seller.
 *
 *   pnpm --filter @marque/commerce exec tsx scripts/testnet-identity-uris.mts [--send] [--keys=/root/marque]
 *
 * Dry run by default: prints the current and the new A2A endpoint for each twin. With --send,
 * the agent's own wallet (its owner) calls setAgentURI on the testnet registry, one transaction
 * per twin, then reads tokenURI back. Testnet only: it refuses any other chain. The new
 * registration keeps every field of the current one and changes only the A2A endpoint.
 */
import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createPublicClient, createWalletClient, http, parseAbi, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { loadKeystore } from '../src/keystore.js'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..')
const KEYS = resolve(process.argv.find((a) => a.startsWith('--keys='))?.split('=')[1] ?? ROOT)
const SEND = process.argv.includes('--send')
const BASE = process.env.MARQUE_PUBLIC_URL ?? 'https://marque.trade'
const fp = JSON.parse(readFileSync(join(ROOT, 'config/first-party.json'), 'utf8'))
const REGISTRY = getAddress(fp.identityRegistry['97'])
const abi = parseAbi(['function tokenURI(uint256) view returns (string)', 'function ownerOf(uint256) view returns (address)', 'function setAgentURI(uint256 agentId, string newURI)'])
const transport = http(process.env.BSC_TESTNET_RPC_URL ?? 'https://bsc-testnet-rpc.publicnode.com')
const pub = createPublicClient({ chain: bscTestnet, transport })
if ((await pub.getChainId()) !== 97) throw new Error('refusing: RPC is not BSC testnet')

const decode = (uri: string) => {
  const m = uri.match(/^data:application\/json;base64,(.+)$/)
  if (!m) throw new Error(`unsupported tokenURI ${uri.slice(0, 40)}`)
  return JSON.parse(Buffer.from(m[1]!, 'base64').toString('utf8')) as Record<string, unknown>
}
const encode = (j: Record<string, unknown>) => `data:application/json;base64,${Buffer.from(JSON.stringify(j)).toString('base64')}`

for (const a of fp.agents as Array<{ slug: string; testnet?: { chainId: number; tokenId: number } }>) {
  if (!a.testnet || a.slug === 'tidemark') continue
  if (a.testnet.chainId !== 97) throw new Error(`refusing: ${a.slug} testnet chain is ${a.testnet.chainId}`)
  const id = BigInt(a.testnet.tokenId)
  const current = decode(await pub.readContract({ address: REGISTRY, abi, functionName: 'tokenURI', args: [id] }))
  const services = Array.isArray(current['services']) ? (current['services'] as Array<Record<string, unknown>>) : []
  const endpoint = `${BASE}/agents/${a.slug}/testnet/.well-known/agent-card.json`
  const nextServices = services.map((s) => (String(s['name']).toUpperCase() === 'A2A' ? { ...s, endpoint } : s))
  if (!nextServices.some((s) => s['endpoint'] === endpoint)) nextServices.push({ name: 'A2A', endpoint })
  const next = { ...current, services: nextServices }
  const before = services.find((s) => String(s['name']).toUpperCase() === 'A2A')?.['endpoint']
  console.log(`${a.slug} #${id}: ${before ?? '(none)'} -> ${endpoint}`)
  if (!SEND || before === endpoint) continue
  const account = privateKeyToAccount(loadKeystore(join(KEYS, 'agents', a.slug, '.studio')))
  const owner = await pub.readContract({ address: REGISTRY, abi, functionName: 'ownerOf', args: [id] })
  if (getAddress(owner) !== account.address) throw new Error(`${a.slug}: wallet ${account.address} does not own #${id} (${owner})`)
  const wallet = createWalletClient({ account, chain: bscTestnet, transport })
  const hash = await wallet.writeContract({ address: REGISTRY, abi, functionName: 'setAgentURI', args: [id, encode(next)] })
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 })
  const after = decode(await pub.readContract({ address: REGISTRY, abi, functionName: 'tokenURI', args: [id] }))
  const ok = (after['services'] as Array<Record<string, unknown>>).some((s) => s['endpoint'] === endpoint)
  console.log(`  tx ${hash} status ${receipt.status} block ${receipt.blockNumber} verified ${ok}`)
}
