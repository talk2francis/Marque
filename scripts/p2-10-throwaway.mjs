#!/usr/bin/env node
/**
 * P2-10 acceptance fixture: a throwaway builder on BSC TESTNET (97).
 *
 *   node scripts/p2-10-throwaway.mjs            dry run: wallet, balance, the record it would register
 *   node scripts/p2-10-throwaway.mjs --go       fund from the testnet operator if needed, then register
 *
 * The wallet is fresh (key in /root/.marque/test-wallets/p2-10-builder.json, 0600, outside
 * the repo) and goes on config/team-wallets.json, so nothing it does counts for the campaign.
 * Its ERC-8004 record says what it is: a fixture for the builder checklist, answering through
 * Keel's public A2A endpoint on testnet, not for hire. Testnet only, never mainnet.
 */
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { ERC8004Agent, AgentEndpoint, EVMWalletProvider } from '@bnbagent/sdk'

const GO = process.argv.includes('--go')
const FILE = '/root/.marque/test-wallets/p2-10-builder.json'
const RPC = 'https://bsc-testnet-rpc.publicnode.com'

function secret(name) {
  const env = readFileSync('/root/.marque/secrets.env', 'utf8')
  const m = env.match(new RegExp(`^${name}=(.+)$`, 'm'))
  if (!m) throw new Error(`${name} missing from secrets.env`)
  return m[1].trim()
}

if (!existsSync(FILE)) {
  const privateKey = generatePrivateKey()
  const address = privateKeyToAccount(privateKey).address
  writeFileSync(FILE, JSON.stringify({ address, privateKey, purpose: 'P2-10 builder checklist acceptance, BSC testnet only', createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
  console.log('new wallet', address)
}
const wallet = JSON.parse(readFileSync(FILE, 'utf8'))
const pub = createPublicClient({ chain: bscTestnet, transport: http(RPC) })
const bal = await pub.getBalance({ address: wallet.address })
console.log('wallet ', wallet.address, formatEther(bal), 'tBNB')

const record = {
  name: 'Marque builder check fixture (testnet)',
  description: 'Test fixture for the Marque builder checklist on BSC testnet. It answers Venus health factor questions (liquidation price and exact repay) through the public A2A endpoint of Keel, a Marque reference agent. Not for hire; its wallet is on Marque\'s published team list.',
}
if (!GO) { console.log('dry run; would register', record); process.exit(0) }

if (bal < parseEther('0.002')) {
  const operator = privateKeyToAccount(secret('MARQUE_TESTNET_PK'))
  const w = createWalletClient({ account: operator, chain: bscTestnet, transport: http(RPC) })
  const hash = await w.sendTransaction({ to: wallet.address, value: parseEther('0.004') })
  console.log('funding tx', hash)
  await pub.waitForTransactionReceipt({ hash })
}

const walletProvider = new EVMWalletProvider({ password: 'p2-10-throwaway', privateKey: wallet.privateKey, persist: false, walletsDir: mkdtempSync(join(tmpdir(), 'marque-ks-')) })
const agent = await ERC8004Agent.create({ walletProvider, network: 'bsc-testnet' })
const endpoint = AgentEndpoint.a2a('https://marque.trade/agents/keel', { capabilities: ['mcs'] })
const uri = agent.generateAgentUri({ ...record, endpoints: [endpoint] })
const res = await agent.registerAgent(uri)
const out = { chainId: 97, tokenId: String(res.agentId), tx: res.txHash ?? res.transactionHash ?? null, owner: wallet.address, registeredAt: new Date().toISOString() }
console.log(JSON.stringify(out, null, 2))
writeFileSync(FILE, JSON.stringify({ ...wallet, agent: out }, null, 2), { mode: 0o600 })
