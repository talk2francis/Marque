/**
 * charters-keys: the only process that loads agent admin keys (03_DECISIONS S11). One pass, then exit; PM2 runs
 * it again every minute. It grants each armed charter its agent's Altana session (scoped to act() on that charter,
 * expiring with it, registered on KeyStore) and revokes sessions of charters that ended or expired, verifying both
 * on chain. The long-running worker only ever holds session keys, derived from the master.
 *
 *   CHARTERS_CHAINS=56,97   CHARTERS_ALTANA_KINDS=loan,grid,range   --dry-run
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, fallback, http, type Hex, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { closeDb } from '@marque/db'
import { loadKeystore } from '@marque/commerce'
import { V2, isCharterChain, type CharterKind, type ReferenceAgent } from '@marque/charters'
import { signerFromPrivateKey } from '@altananetwork/sdk'
import { altanaFor, sessionsOnce } from './charters/sessions.js'
import { keysOnceV2, type AgentAdmin } from './charters/v2/keys.js'

const DIR = process.env['CHARTERS_DIR'] ?? '/root/.marque/charters'
const CHAINS = (process.env['CHARTERS_CHAINS'] ?? '97').split(',').map(Number).filter(isCharterChain)
const DRY = process.argv.includes('--dry-run')
const ALTANA_KINDS = new Set((process.env['CHARTERS_ALTANA_KINDS'] ?? 'loan,grid,range').split(',').filter(Boolean) as CharterKind[])
const RPC: Record<56 | 97, string[]> = {
  56: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io'],
  97: ['https://bsc-testnet-rpc.publicnode.com', 'https://data-seed-prebsc-1-s1.bnbchain.org:8545', 'https://data-seed-prebsc-2-s1.bnbchain.org:8545'],
}
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'charters-keys', event, ...data }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
const readEnv = (name: string) => { try { return readFileSync(`${DIR}/charters.env`, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() } catch { return undefined } }

async function main() {
  process.env['CHARTERS_DATABASE_URL'] ??= readEnv('CHARTERS_DATABASE_URL')
  const master = (process.env['CHARTERS_SESSION_MASTER'] ?? readEnv('CHARTERS_SESSION_MASTER')) as Hex | undefined
  if (!master) throw new Error('CHARTERS_SESSION_MASTER is not set')
  const keelKey = loadKeystore(`${DIR}/keel-watcher`)
  const keel = { key: keelKey, address: privateKeyToAccount(keelKey).address, master }
  const admins = new Map<ReferenceAgent, AgentAdmin>([['keel', { agent: 'keel', key: keelKey, address: keel.address }]])
  for (const [agent, dir] of [['lattice', 'lattice-executor'], ['bound', 'bound-executor'], ['sluicegate', 'sluicegate-executor']] as const) {
    const key = loadKeystore(`${DIR}/${dir}`)
    admins.set(agent, { agent, key, address: privateKeyToAccount(key).address })
  }
  const status: Record<string, unknown> = { at: new Date().toISOString() }
  for (const c of CHAINS) {
    const client = createPublicClient({ chain: c === 56 ? bsc : bscTestnet, transport: fallback(RPC[c].map((u) => http(u, { timeout: 20_000, retryCount: 1 }))) }) as PublicClient
    try {
      const altanaKeel = await altanaFor([c], keel)
      const v1 = await sessionsOnce(client, altanaKeel, c, keel, { dryRun: DRY, log })
      let v2: unknown = null
      if (V2[c].fromBlock !== null) {
        // Each agent account is registered with the chain's relay once (counterfactual, no transaction) before its
        // first grant; grantSession and revokeSession then take the wallet and its signer per call.
        for (const [agent, a] of admins) {
          if (agent === 'keel') continue
          const wallet = await altanaKeel.createWallet({ signer: signerFromPrivateKey(a.key) })
          if (wallet.address.toLowerCase() !== a.address.toLowerCase()) throw new Error(`Altana wallet for ${agent} is not its executor address`)
        }
        v2 = await keysOnceV2({ client, altana: altanaKeel, chainId: c, master, admins, altanaKinds: ALTANA_KINDS, dryRun: DRY, log })
      }
      status[c] = { v1, v2 }
    } catch (e) {
      status[c] = { error: e instanceof Error ? e.message.slice(0, 300) : String(e) }
      log('keys_error', { chainId: c, error: status[c] })
    }
  }
  try { writeFileSync(`${DIR}/keys-status.json`, JSON.stringify(status, null, 2)) } catch { /* best effort */ }
  await closeDb()
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
