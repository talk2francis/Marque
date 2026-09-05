/**
 * Add pools to the watch list.
 *
 *   pnpm tsx scripts/watch-pools.mts                    seed the majors
 *   pnpm tsx scripts/watch-pools.mts 0xOWNER...         add that owner's pools
 *
 * The watcher can only tell you how long a position has been out of range for
 * the period it has been watching (docs/FINDINGS.md F-06), so a pool is worth
 * adding as early as possible — history does not exist retroactively.
 */
import { db, poolWatch } from '@marque/db'
import { pancakeV3Reader } from '@marque/positions'
import { closeDb } from '@marque/db'
import type { Address } from 'viem'

/** Deep BSC pools, so the Desk has real range history for a judge on day one. */
const MAJORS: Array<{ pool: Address; fee: number; t0: string; t1: string }> = [
  { pool: '0x36696169C63e42cd08ce11f5deeBbCeBae652050', fee: 500,  t0: 'WBNB', t1: 'USDT' },
  { pool: '0x172fcD41E0913e95784454622d1c3724f546f849', fee: 500,  t0: 'WBNB', t1: 'BUSD' },
  { pool: '0x92b7807bF19b7DDdf89b706143896d05228f3121', fee: 100,  t0: 'USDC', t1: 'USDT' },
  { pool: '0x6bbc40579ad1BBD243895cA0ACB086BB6300d636', fee: 2500, t0: 'BTCB', t1: 'WBNB' },
  { pool: '0x4f3126d5DE26413AbDCF6948943FB9D0847d9818', fee: 2500, t0: 'ETH',  t1: 'WBNB' },
]

async function addOwner(owner: Address): Promise<number> {
  const read = await pancakeV3Reader(owner)
  if (!read.ok) {
    console.error(`could not read ${owner}: ${read.detail ?? read.error}`)
    return 0
  }
  let added = 0
  for (const p of read.data.positions) {
    await db().insert(poolWatch).values({
      pool: p.pool.toLowerCase(),
      fee: p.fee,
      token0Symbol: p.token0.symbol,
      token1Symbol: p.token1.symbol,
      reason: `position ${p.tokenId} held by ${owner}`,
    }).onConflictDoNothing()
    added++
  }
  return added
}

async function main(): Promise<void> {
  const owner = process.argv[2] as Address | undefined

  if (owner) {
    const n = await addOwner(owner)
    console.log(`${owner}: ${n} pool(s) from live positions`)
  } else {
    for (const m of MAJORS) {
      await db().insert(poolWatch).values({
        pool: m.pool.toLowerCase(), fee: m.fee,
        token0Symbol: m.t0, token1Symbol: m.t1,
        reason: 'major BSC pool — watched so the Desk has real range history',
      }).onConflictDoNothing()
    }
    console.log(`seeded ${MAJORS.length} major pools`)
  }

  const all = await db().select().from(poolWatch)
  console.log(`watching ${all.length} pool(s):`)
  for (const w of all) {
    console.log(`  ${w.pool}  ${w.token0Symbol}/${w.token1Symbol} ${w.fee}  since ${w.watchingSince.toISOString()}`)
  }
  await closeDb()
}

void main()
