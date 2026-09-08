#!/usr/bin/env node
/**
 * Register the five reference agents as ERC-8004 identities on BSC TESTNET,
 * calling the identity registry contract directly through @bnbagent/sdk.
 *
 * Why not scripts/register-agents.sh: that routes through `bag erc8004 register`
 * which brokers the call through the 8004scan API — and 8004scan has been
 * returning DATABASE_ERROR / timing out since 2026-09-05. The SDK's
 * ERC8004Agent.registerAgent() phase 1 is a plain on-chain `register` call and
 * phase 2 (`setAgentUri`) reads the agentId from the tx receipt, so neither
 * needs the indexer. This is the way around the outage.
 *
 * The wallets were regenerated in P10.5C (new keystores), so the pre-recovery
 * token ids are dead; this mints fresh ones.
 *
 *   node scripts/register-agents-direct.mjs [--go] [--only bound]
 *
 * Dry run (default) constructs the agent + URI and stops before any tx.
 */
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { scryptSync, createDecipheriv } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { keccak256, bytesToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ERC8004Agent, AgentEndpoint, EVMWalletProvider } from '@bnbagent/sdk'

/** Decrypt a Keystore V3 (scrypt + aes-128-ctr) to a 0x private key. */
function decryptKeystoreV3(keystore, password) {
  const c = keystore.crypto ?? keystore.Crypto
  const kp = c.kdfparams
  if (c.kdf !== 'scrypt') throw new Error(`unsupported kdf ${c.kdf}`)
  const dk = scryptSync(Buffer.from(password, 'utf8'), Buffer.from(kp.salt, 'hex'), kp.dklen, {
    N: kp.n, r: kp.r, p: kp.p, maxmem: 512 * 1024 * 1024,
  })
  const ciphertext = Buffer.from(c.ciphertext, 'hex')
  const mac = keccak256(Buffer.concat([dk.subarray(16, 32), ciphertext])).slice(2)
  if (mac !== c.mac.toLowerCase()) throw new Error('keystore MAC mismatch — wrong password')
  const d = createDecipheriv('aes-128-ctr', dk.subarray(0, 16), Buffer.from(c.cipherparams.iv, 'hex'))
  return bytesToHex(Buffer.concat([d.update(ciphertext), d.final()]))
}

function agentPrivateKey(id) {
  const dir = join(ROOT, 'agents', id, '.studio', 'wallets')
  const file = readdirSync(dir).find((f) => f.endsWith('.json'))
  if (!file) throw new Error(`no keystore in ${dir}`)
  const keystore = JSON.parse(readFileSync(join(dir, file), 'utf8'))
  const pk = decryptKeystoreV3(keystore, walletPassword(id))
  return { pk, address: privateKeyToAccount(pk).address }
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GO = process.argv.includes('--go')
const onlyIx = process.argv.indexOf('--only')
const ONLY = onlyIx > -1 ? process.argv[onlyIx + 1] : null
/**
 * `--mainnet` registers on BSC mainnet (chain 56). Requires Francis's written
 * "approved, mainnet" and each agent wallet funded with a little BNB for gas
 * (~$0.30). Default stays testnet — free, and the mechanism is identical.
 */
const NETWORK = process.argv.includes('--mainnet') ? 'bsc-mainnet' : 'bsc-testnet'

const AGENTS = [
  { id: 'bound', name: 'Bound', description: 'Marque reference agent: PancakeSwap V3 range health and bounded re-centre planning.' },
  { id: 'lattice', name: 'Lattice', description: 'Marque reference agent: constrained grid plans with fee-drag disclosed.' },
  { id: 'sluicegate', name: 'Sluicegate', description: 'Marque reference agent: net-APR-at-size yield routing across BNB Chain venues.' },
  { id: 'keel', name: 'Keel', description: 'Marque reference agent: Venus health factor, liquidation price and exact restore amount.' },
  { id: 'redcell', name: 'Redcell', description: 'Marque reference agent: BNB Chain approval and privileged-function risk triage.' },
]

function walletPassword(id) {
  const env = readFileSync(join(ROOT, 'agents', id, '.studio', '.env.local'), 'utf8')
  const m = env.match(/^WALLET_PASSWORD=(.+)$/m)
  if (!m) throw new Error(`no WALLET_PASSWORD in agents/${id}/.studio/.env.local`)
  return m[1].trim()
}

console.log(`network: ${NETWORK}${NETWORK === 'bsc-mainnet' ? '  ⚠  MAINNET — real BNB gas per agent' : ''}\n`)

const results = []
for (const a of AGENTS) {
  if (ONLY && a.id !== ONLY) continue
  process.stdout.write(`\n── ${a.id} (${a.name})\n`)
  try {
    const { pk, address } = agentPrivateKey(a.id)
    const walletProvider = new EVMWalletProvider({
      password: walletPassword(a.id),
      privateKey: pk,
      persist: false,
      walletsDir: mkdtempSync(join(tmpdir(), 'marque-ks-')),
    })
    console.log('   wallet     ', address)

    const agent = await ERC8004Agent.create({ walletProvider, network: NETWORK })
    const endpoint = AgentEndpoint.a2a(`https://marque.trade/agents/${a.id}`, { capabilities: ['mcs'] })
    const uri = agent.generateAgentUri({ name: a.name, description: a.description, endpoints: [endpoint] })
    console.log('   agent URI  ', uri.slice(0, 68) + '…')

    if (!GO) { console.log('   (dry run — pass --go to register on-chain)'); results.push({ id: a.id, ok: null }); continue }

    const res = await agent.registerAgent(uri)
    console.log(`   ✓ registered — agentId ${res.agentId}  tx ${res.txHash ?? res.transactionHash ?? '(see result)'}`)
    console.log('   result:', JSON.stringify(res, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
    results.push({ id: a.id, ok: true, agentId: String(res.agentId), tx: res.txHash })
  } catch (err) {
    console.error(`   ✗ ${err instanceof Error ? err.message.split('\n')[0] : err}`)
    results.push({ id: a.id, ok: false, error: err instanceof Error ? err.message.split('\n')[0] : String(err) })
  }
}

console.log('\n' + JSON.stringify(results, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
