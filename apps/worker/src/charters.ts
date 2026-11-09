/**
 * The Charters worker (AGENTS.md section 14). One process, both chains: index guards, keep Keel's Altana sessions,
 * watch every armed guard and, when the chain says so, ask it to act. Modelled on the keeper: status file, caps,
 * --once, --dry-run.
 *
 *   CHARTERS_CHAINS=97                     chains to run (56 only after "approved, mainnet")
 *   CHARTERS_TICK_MS_56 / _97              watch interval (20 s on 56, 30 s on 97)
 *   CHARTERS_GRACE_MS_56 / _97             wait for Keel's call before the backup acts (45 s / 30 s)
 *   CHARTERS_ALTANA=0                      turn the Altana path off (the backup path and owners still work)
 *   CHARTERS_BACKUP=0                      turn the backup path off
 *   CHARTERS_MAX_RELAY_BNB_DAY             Keel's relay spending per day before the Altana path pauses
 *   CHARTERS_MAX_GAS_BNB_DAY               the backup path's own gas per day before it pauses
 *   CHARTERS_V2=1                          also index and watch the v2 kinds (four factories)
 *   CHARTERS_V2_KINDS=loan,yield,grid,range which v2 kinds this worker acts on
 *   CHARTERS_ALTANA_KINDS=loan,grid,range  v2 kinds whose agent acts through an Altana session (Yield Sweep sends directly)
 *   CHARTERS_PRIVATE_RPC_56 / _97          private submission endpoint for grid and range sends
 *   CHARTERS_KEYS_IN_WORKER=0              grants and revokes run in the charters-keys process, never here (S11)
 * Keys load from their encrypted keystores in /root/.marque/charters and live only in memory. With the default
 * settings this process holds session keys (derived from the master), Sluicegate's executor and the backup watcher:
 * no agent admin key.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, fallback, formatEther, http, parseEther, type Hex, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { closeDb } from '@marque/db'
import { loadKeystore } from '@marque/commerce'
import { CHARTER_CHAINS, isCharterChain, type CharterChainId } from '@marque/charters'
import { indexOnce } from './charters/indexer.js'
import { altanaFor, sessionsOnce, type AltanaClient, type Keel } from './charters/sessions.js'
import { watchOnce } from './charters/watch.js'
import { indexOnceV2 } from './charters/v2/indexer.js'
import { watchOnceV2 } from './charters/v2/watch.js'
import { V2, type CharterKind } from '@marque/charters'

const DIR = process.env['CHARTERS_DIR'] ?? '/root/.marque/charters'
const CHAINS = (process.env['CHARTERS_CHAINS'] ?? '97').split(',').map(Number).filter(isCharterChain)
const ONCE = process.argv.includes('--once')
const DRY = process.argv.includes('--dry-run')
const env = (k: string, d: string) => process.env[k] ?? d
const TICK: Record<CharterChainId, number> = { 56: Number(env('CHARTERS_TICK_MS_56', '20000')), 97: Number(env('CHARTERS_TICK_MS_97', '30000')) }
const GRACE: Record<CharterChainId, number> = { 56: Number(env('CHARTERS_GRACE_MS_56', '45000')), 97: Number(env('CHARTERS_GRACE_MS_97', '30000')) }
const ALTANA_ON = env('CHARTERS_ALTANA', '1') === '1'
const BACKUP_ON = env('CHARTERS_BACKUP', '1') === '1'
const MAX_RELAY = parseEther(env('CHARTERS_MAX_RELAY_BNB_DAY', '0.02'))
const MAX_GAS = parseEther(env('CHARTERS_MAX_GAS_BNB_DAY', '0.01'))
const V2_ON = env('CHARTERS_V2', '0') === '1'
const V2_KINDS = new Set(env('CHARTERS_V2_KINDS', 'loan,yield,grid,range').split(',').filter(Boolean) as CharterKind[])
const ALTANA_KINDS = new Set(env('CHARTERS_ALTANA_KINDS', 'loan,grid,range').split(',').filter(Boolean) as CharterKind[])
const KEYS_IN_WORKER = env('CHARTERS_KEYS_IN_WORKER', '0') === '1'
const RPC_DEFAULT: Record<CharterChainId, string[]> = {
  56: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.defibit.io'],
  97: ['https://bsc-testnet-rpc.publicnode.com', 'https://data-seed-prebsc-1-s1.bnbchain.org:8545', 'https://data-seed-prebsc-2-s1.bnbchain.org:8545'],
}
// The operator's own endpoints first (BSC_RPC_URLS, BSC_TESTNET_RPC), then public nodes that serve eth_getLogs.
const fromEnv = (k: string) => (process.env[k] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
const RPC: Record<CharterChainId, string[]> = { 56: [...fromEnv('BSC_RPC_URLS'), ...RPC_DEFAULT[56]], 97: [...fromEnv('BSC_TESTNET_RPC'), ...RPC_DEFAULT[97]] }

const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'charters', event, ...data }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))
let stopping = false
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const clients = new Map<CharterChainId, PublicClient>()
const client = (c: CharterChainId) => {
  let x = clients.get(c)
  if (!x) { x = createPublicClient({ chain: c === 56 ? bsc : bscTestnet, transport: fallback(RPC[c].map((u) => http(u, { timeout: 20_000, retryCount: 1 }))) }) as PublicClient; clients.set(c, x) }
  return x
}

function readEnvFile(file: string, name: string): string | undefined {
  try { return readFileSync(file, 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1]?.trim() } catch { return undefined }
}

/** Per-day spending, per chain and path, so a fault or an attack on gas can cost only a capped amount. */
const day = () => new Date().toISOString().slice(0, 10)
const spend = { day: day(), relay: new Map<CharterChainId, bigint>(), gas: new Map<CharterChainId, bigint>(), direct: new Map<CharterChainId, bigint>(), keelStart: new Map<CharterChainId, bigint>() }
function rollDay() { if (spend.day !== day()) { spend.day = day(); spend.relay.clear(); spend.gas.clear(); spend.direct.clear(); spend.keelStart.clear() } }

async function main() {
  if (!CHAINS.length) throw new Error('CHARTERS_CHAINS names no supported chain')
  for (const c of CHAINS) if (!CHARTER_CHAINS[c].factory) throw new Error(`no CharterFactory on chain ${c}`)
  mkdirSync(DIR, { recursive: true })
  // Before launch the worker writes to its own dark database (chartersDb); the URL lives beside the master.
  process.env['CHARTERS_DATABASE_URL'] ??= readEnvFile(`${DIR}/charters.env`, 'CHARTERS_DATABASE_URL')
  const master = (process.env['CHARTERS_SESSION_MASTER'] ?? readEnvFile(`${DIR}/charters.env`, 'CHARTERS_SESSION_MASTER')) as Hex | undefined
  let keel: Keel | null = null
  let altana: AltanaClient | null = null
  if (ALTANA_ON) {
    if (!master) throw new Error('CHARTERS_SESSION_MASTER is not set')
    // The watcher's address is public; its admin key is loaded here only when grants run in this process.
    const key = loadKeystore(`${DIR}/keel-watcher`)
    keel = KEYS_IN_WORKER ? { key, address: privateKeyToAccount(key).address, master } : { address: privateKeyToAccount(key).address, master }
    altana = await altanaFor(CHAINS, keel)
  }
  const backupAccount = BACKUP_ON ? privateKeyToAccount(loadKeystore(`${DIR}/backup-watcher`)) : null
  const backups = new Map<CharterChainId, WalletClient>()
  if (backupAccount) for (const c of CHAINS) backups.set(c, createWalletClient({ account: backupAccount, chain: c === 56 ? bsc : bscTestnet, transport: http(RPC[c][0], { timeout: 20_000 }) }))
  // Sluicegate sends Yield Sweep actions from its own executor account (open kind, frequent, low value: no relay fee).
  const sluice = V2_ON && V2_KINDS.has('yield') ? privateKeyToAccount(loadKeystore(`${DIR}/sluicegate-executor`)) : null
  const sluices = new Map<CharterChainId, WalletClient>()
  log('start', { chains: CHAINS, keelWatcher: keel?.address ?? null, backupWatcher: backupAccount?.address ?? null, altana: ALTANA_ON, backup: BACKUP_ON, dryRun: DRY, tick: TICK, grace: GRACE })

  const next = new Map<CharterChainId, number>(CHAINS.map((c) => [c, 0]))
  const status: Record<string, unknown> = { startedAt: new Date().toISOString(), keelWatcher: keel?.address ?? null, backupWatcher: backupAccount?.address ?? null, chains: {} }
  do {
    rollDay()
    for (const c of CHAINS) {
      if (Date.now() < (next.get(c) ?? 0)) continue
      next.set(c, Date.now() + TICK[c])
      const pub = client(c)
      const chainStatus: Record<string, unknown> = { at: new Date().toISOString() }
      try {
        // Behind (after a restart), a tick indexes up to ten chunks, so a new guard is seen within a tick or two.
        let idx = await indexOnce(pub, c)
        let events = idx.events
        for (let n = 1; n < 10 && idx.head - idx.to > 0n && !stopping; n++) {
          if (idx.reorgFrom !== null) log('reorg', { chainId: c, from: idx.reorgFrom })
          idx = await indexOnce(pub, c)
          events += idx.events
        }
        chainStatus['index'] = { head: idx.head, cursor: idx.to, behind: Number(idx.head - idx.to), events, reorgFrom: idx.reorgFrom }
        if (idx.reorgFrom !== null) log('reorg', { chainId: c, from: idx.reorgFrom })

        // Keel's relay spending today, measured from its balance; over the cap, the Altana path pauses.
        let altanaOk = ALTANA_ON && keel !== null
        if (keel) {
          const bal = await pub.getBalance({ address: keel.address })
          if (!spend.keelStart.has(c)) spend.keelStart.set(c, bal)
          const used = (spend.keelStart.get(c) ?? bal) > bal ? (spend.keelStart.get(c)! - bal) : 0n
          spend.relay.set(c, used)
          if (used >= MAX_RELAY) { altanaOk = false; log('altana_paused_cap', { chainId: c, usedBnb: formatEther(used), capBnb: formatEther(MAX_RELAY) }) }
          chainStatus['keel'] = { address: keel.address, balanceBnb: formatEther(bal), relaySpentTodayBnb: formatEther(used), path: altanaOk ? 'ok' : 'paused' }
        }
        if (altanaOk && altana && keel && KEYS_IN_WORKER) chainStatus['sessions'] = await sessionsOnce(pub, altana, c, keel, { dryRun: DRY, log })

        const gasUsed = spend.gas.get(c) ?? 0n
        const backupOk = BACKUP_ON && backups.has(c) && gasUsed < MAX_GAS // a zero cap means the path never sends
        if (backupAccount) {
          const bal = await pub.getBalance({ address: backupAccount.address })
          chainStatus['backup'] = { address: backupAccount.address, balanceBnb: formatEther(bal), gasSpentTodayBnb: formatEther(gasUsed), path: backupOk ? 'ok' : 'paused' }
        }
        const w = await watchOnce({
          chainId: c, client: pub, keel, altana, backup: backups.get(c) ?? null, graceMs: GRACE[c], dryRun: DRY,
          altanaEnabled: altanaOk, backupEnabled: backupOk, log,
          onBackupSpend: (wei) => spend.gas.set(c, (spend.gas.get(c) ?? 0n) + wei),
        })
        chainStatus['watch'] = w
        if (V2_ON && V2[c].fromBlock !== null) {
          let i2 = await indexOnceV2(pub, c)
          let ev2 = i2.events
          for (let n = 1; n < 10 && i2.head - i2.to > 0n && !stopping; n++) { i2 = await indexOnceV2(pub, c); ev2 += i2.events }
          if (i2.reorgFrom !== null) log('reorg_v2', { chainId: c, from: i2.reorgFrom })
          chainStatus['indexV2'] = { head: i2.head, cursor: i2.to, behind: Number(i2.head - i2.to), events: ev2 }
          if (sluice && !sluices.has(c)) sluices.set(c, createWalletClient({ account: sluice, chain: c === 56 ? bsc : bscTestnet, transport: http(RPC[c][0], { timeout: 20_000 }) }))
          const priv = process.env[`CHARTERS_PRIVATE_RPC_${c}`]
          chainStatus['watchV2'] = await watchOnceV2({
            chainId: c, client: pub, master: master ?? null, altana, altanaKinds: ALTANA_KINDS,
            direct: sluices.has(c) ? { yield: sluices.get(c)! } : {}, backup: backups.get(c) ?? null,
            privateSend: priv && backupAccount ? createWalletClient({ account: backupAccount, chain: c === 56 ? bsc : bscTestnet, transport: http(priv, { timeout: 20_000 }) }) : null,
            graceMs: GRACE[c], dryRun: DRY, enabled: { altana: altanaOk, direct: (spend.direct.get(c) ?? 0n) < MAX_GAS, backup: backupOk }, kinds: V2_KINDS, log,
            onSpend: (path, wei) => (path === 'backup' ? spend.gas : spend.direct).set(c, ((path === 'backup' ? spend.gas : spend.direct).get(c) ?? 0n) + wei),
          })
          if (sluice) chainStatus['sluicegate'] = { address: sluice.address, balanceBnb: formatEther(await pub.getBalance({ address: sluice.address })), gasSpentTodayBnb: formatEther(spend.direct.get(c) ?? 0n) }
        }
        chainStatus['ok'] = true
      } catch (e) {
        chainStatus['ok'] = false
        chainStatus['error'] = e instanceof Error ? e.message.slice(0, 300) : String(e)
        log('tick_error', { chainId: c, error: chainStatus['error'] })
      }
      ;(status['chains'] as Record<string, unknown>)[c] = chainStatus
      status['updatedAt'] = new Date().toISOString()
      try { writeFileSync(`${DIR}/status.json`, JSON.stringify(status, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)) } catch { /* best effort */ }
    }
    if (!ONCE && !stopping) await sleep(1000)
  } while (!ONCE && !stopping)
  await closeDb()
}

main().catch((e) => { console.error(e); process.exit(1) })
