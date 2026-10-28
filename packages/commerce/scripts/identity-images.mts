/**
 * Put each reference agent's portrait in its ERC-8004 registration, so every marketplace that reads the registry
 * shows the agent's own image instead of its default avatar.
 *
 *   pnpm --filter @marque/commerce exec tsx scripts/identity-images.mts --chain=97 [--send] [--keys=/root/marque]
 *   pnpm --filter @marque/commerce exec tsx scripts/identity-images.mts --chain=56 --send --mainnet-approved
 *
 * Dry run by default: prints the current and the new `image` for each identity on the chosen network. With --send,
 * the agent's own wallet (its owner) calls setAgentURI, one transaction per identity, then reads tokenURI back.
 * The new registration keeps every field of the current one and changes only `image`. BSC mainnet (56) is refused
 * unless --mainnet-approved is passed, which needs Francis's written "approved, mainnet" (AGENTS gate G-M1).
 * The portrait must already be served at its URL (apps/web/public/brand/agents/<slug>/portrait.png, deployed).
 */
import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createPublicClient, createWalletClient, http, parseAbi, getAddress, type Chain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { loadKeystore } from '../src/keystore.js'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../../..')
const KEYS = resolve(process.argv.find((a) => a.startsWith('--keys='))?.split('=')[1] ?? ROOT)
const SEND = process.argv.includes('--send')
const CHAIN = Number(process.argv.find((a) => a.startsWith('--chain='))?.split('=')[1] ?? 97)
const BASE = process.env.MARQUE_PUBLIC_URL ?? 'https://marque.trade'
if (CHAIN !== 56 && CHAIN !== 97) throw new Error('refusing: --chain must be 56 or 97')
if (CHAIN === 56 && SEND && !process.argv.includes('--mainnet-approved')) throw new Error('refusing: mainnet writes need --mainnet-approved (Francis: "approved, mainnet")')

const fp = JSON.parse(readFileSync(join(ROOT, 'config/first-party.json'), 'utf8'))
const REGISTRY = getAddress(fp.identityRegistry[String(CHAIN)])
const abi = parseAbi(['function tokenURI(uint256) view returns (string)', 'function ownerOf(uint256) view returns (address)', 'function setAgentURI(uint256 agentId, string newURI)'])
const chain: Chain = CHAIN === 56 ? bsc : bscTestnet
const rpc = CHAIN === 56 ? (process.env.BSC_RPC_URLS?.split(',')[0] ?? 'https://bsc-rpc.publicnode.com') : (process.env.BSC_TESTNET_RPC_URL ?? 'https://bsc-testnet-rpc.publicnode.com')
const transport = http(rpc)
const pub = createPublicClient({ chain, transport })
if ((await pub.getChainId()) !== CHAIN) throw new Error(`refusing: RPC is not chain ${CHAIN}`)

const decode = (uri: string) => {
  const m = uri.match(/^data:application\/json;base64,(.+)$/)
  if (!m) throw new Error(`unsupported tokenURI ${uri.slice(0, 40)}`)
  return JSON.parse(Buffer.from(m[1]!, 'base64').toString('utf8')) as Record<string, unknown>
}
const encode = (j: Record<string, unknown>) => `data:application/json;base64,${Buffer.from(JSON.stringify(j)).toString('base64')}`

for (const a of fp.agents as Array<{ slug: string; chainId: number; tokenId: number; testnet?: { chainId: number; tokenId: number } }>) {
  const token = CHAIN === 56 ? (a.chainId === 56 ? a.tokenId : null) : a.testnet?.chainId === 97 ? a.testnet.tokenId : null
  if (token === null) continue
  const image = `${BASE}/brand/agents/${a.slug}/portrait.png`
  const res = await fetch(image, { method: 'HEAD' })
  if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/png')) throw new Error(`${a.slug}: ${image} is not served as a PNG yet (${res.status} ${res.headers.get('content-type')})`)
  const id = BigInt(token)
  const current = decode(await pub.readContract({ address: REGISTRY, abi, functionName: 'tokenURI', args: [id] }))
  const before = current['image']
  console.log(`${a.slug} ${CHAIN}#${id}: image ${JSON.stringify(before)} -> ${image}`)
  if (!SEND || before === image) continue
  const account = privateKeyToAccount(loadKeystore(join(KEYS, 'agents', a.slug, '.studio')))
  const owner = await pub.readContract({ address: REGISTRY, abi, functionName: 'ownerOf', args: [id] })
  if (getAddress(owner) !== account.address) throw new Error(`${a.slug}: wallet ${account.address} does not own #${id} (${owner})`)
  const wallet = createWalletClient({ account, chain, transport })
  const hash = await wallet.writeContract({ address: REGISTRY, abi, functionName: 'setAgentURI', args: [id, encode({ ...current, image })] })
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 })
  const after = decode(await pub.readContract({ address: REGISTRY, abi, functionName: 'tokenURI', args: [id] }))
  console.log(`  tx ${hash} status ${receipt.status} block ${receipt.blockNumber} gas ${receipt.gasUsed} verified ${after['image'] === image}`)
}
