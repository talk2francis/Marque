/**
 * charters-fixture-mm: Marque's labelled testnet market maker (runbook R6). BSC testnet only; refuses chain 56.
 * Every 10 to 20 minutes it moves the fixture pool (tUSDT/tWBNB, prices moved by Marque) to a new tick on a
 * bounded random walk around the live mainnet WBNB/USDT price, so testnet Grid Bands and Range Keepers meet real
 * conditions within an hour. Nothing it does reaches a mainnet figure (C11).
 *
 *   CHARTERS_FIXTURE_MM=0x...   the FixtureMarketMaker contract   --once   --dry-run
 */
import { createPublicClient, createWalletClient, http, parseAbi, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bsc, bscTestnet } from 'viem/chains'
import { loadKeystore } from '@marque/commerce'
import { V2 } from '@marque/charters'
import { nextOffset } from './charters/v2/walk.js'

const DIR = process.env['CHARTERS_DIR'] ?? '/root/.marque/charters'
const MM = process.env['CHARTERS_FIXTURE_MM'] as Address | undefined
const ONCE = process.argv.includes('--once')
const DRY = process.argv.includes('--dry-run')
/** Mainnet WBNB/USDT 0.05% (token0 USDT, token1 WBNB: the same order as the fixture pool, so ticks compare directly). */
const MAINNET_POOL: Address = '0x36696169C63e42cd08ce11f5deeBbCeBae652050'
const FIXTURE = V2[97].pools[0]!
const poolAbi = parseAbi(['function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint32, bool)', 'function token0() view returns (address)'])
const mmAbi = parseAbi(['function moveTo(int24 targetTick)', 'function pool() view returns (address)', 'function operator() view returns (address)'])
const log = (event: string, data: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), worker: 'charters-fixture-mm', event, ...data }))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  if (!MM) throw new Error('CHARTERS_FIXTURE_MM is not set')
  const test = createPublicClient({ chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com', { timeout: 20_000 }) })
  const main56 = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 20_000 }) })
  if ((await test.getChainId()) !== 97) throw new Error('the fixture market maker runs on BSC testnet only')
  if ((await test.readContract({ address: MM, abi: mmAbi, functionName: 'pool' })).toLowerCase() !== FIXTURE.address.toLowerCase()) throw new Error('market maker is not bound to the fixture pool')
  const account = privateKeyToAccount(loadKeystore(`${DIR}/fixture-mm-97`))
  const wallet = createWalletClient({ account, chain: bscTestnet, transport: http('https://bsc-testnet-rpc.publicnode.com', { timeout: 20_000 }) })
  let offset = 0
  for (;;) {
    try {
      const [, mainTick] = await main56.readContract({ address: MAINNET_POOL, abi: poolAbi, functionName: 'slot0' })
      offset = nextOffset(offset)
      const target = mainTick + offset
      const [, before] = await test.readContract({ address: FIXTURE.address, abi: poolAbi, functionName: 'slot0' })
      if (DRY) log('would_move', { mainTick, offset, target, before })
      else {
        const hash = await wallet.writeContract({ address: MM, abi: mmAbi, functionName: 'moveTo', args: [target], gasPrice: 1_000_000_000n })
        const r = await test.waitForTransactionReceipt({ hash, timeout: 120_000 })
        log('moved', { mainTick, offset, target, before, tx: hash, status: r.status })
      }
    } catch (e) {
      log('move_failed', { error: e instanceof Error ? e.message.slice(0, 200) : String(e) })
    }
    if (ONCE) break
    await sleep((10 + Math.random() * 10) * 60_000)
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
