import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeDb, db } from '@marque/db'
import { network, questJob, walletQuest } from './index'

const url = process.env.MARQUE_INTEGRATION_DB
const enabled = Boolean(url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1)))
const address = () => `0x${randomBytes(20).toString('hex')}`
const buyer = address(), earlyBuyer = address(), unratedBuyer = address(), provider = address()
const first = String(950000000000n + BigInt(Date.now() % 100000000))
const second = String(BigInt(first) + 1n), early = String(BigInt(first) + 2n), unrated = String(BigInt(first) + 3n)
const hash = () => `0x${randomBytes(32).toString('hex')}`

describe.skipIf(!enabled)('batched submission blocks retain canonical feedback attribution', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    for (const chain of [56, 97] as const) {
      await db().execute(sql`insert into agent(id,chain_id,token_id,contract_address,owner_address,agent_wallet)
        values (${`${chain}:${network(chain).identityRegistry.toLowerCase()}:${first}`},${chain},${first},${network(chain).identityRegistry},${provider},${provider})`)
    }
    const jobs = [
      { chain: 56, id: first, client: buyer, block: 100 },
      { chain: 56, id: second, client: buyer, block: 200 },
      { chain: 97, id: first, client: buyer, block: 150 },
      { chain: 56, id: early, client: earlyBuyer, block: 300 },
      { chain: 56, id: unrated, client: unratedBuyer, block: 400 },
    ]
    for (const j of jobs) {
      await db().execute(sql`insert into commerce_job(chain_id,job_id,client,provider,funded_raw,state,created_block,updated_block)
        values (${j.chain},${j.id},${j.client},${provider},'1','SUBMITTED',${j.block - 1},${j.block})`)
      await db().execute(sql`insert into commerce_event(chain_id,tx_hash,log_index,block_number,contract,name,job_id,args)
        values (${j.chain},${hash()},0,${j.block},'commerce','JobSubmitted',${j.id},'{}'::jsonb)`)
    }
    for (const r of [
      { chain: 56, client: buyer, index: '0', block: 180, value: '95', decimals: 0, revoked: false },
      { chain: 56, client: buyer, index: '1', block: 250, value: '8500', decimals: 2, revoked: true },
      { chain: 97, client: buyer, index: '0', block: 170, value: '60', decimals: 0, revoked: false },
      { chain: 56, client: earlyBuyer, index: '0', block: 290, value: '100', decimals: 0, revoked: false },
    ]) await db().execute(sql`insert into rating(chain_id,agent_token_id,client,feedback_index,value,value_decimals,tx_hash,block_number,revoked)
      values (${r.chain},${first},${r.client},${r.index},${r.value},${r.decimals},${hash()},${r.block},${r.revoked})`)
  })
  afterAll(async () => { await closeDb() })

  it('assigns each rating to the latest eligible earlier delivery and preserves revoked/decimal feedback', async () => {
    const view = await walletQuest(buyer, 56)
    expect(view.hires.find(h => h.jobId === first)?.rating).toMatchObject({ value: 95, stars: 5, revoked: false })
    expect(view.hires.find(h => h.jobId === second)?.rating).toMatchObject({ value: 85, stars: 4, revoked: true })
    expect(view.hires.every(h => !h.reasons.includes('rating_unbound'))).toBe(true)
  })
  it('keeps the same numeric job and token identifiers separate across mainnet and practice', async () => {
    const view = await walletQuest(buyer, 97)
    expect(view.hires).toHaveLength(1)
    expect(view.hires[0]).toMatchObject({ chainId: 97, jobId: first, rating: { value: 60, stars: 3, revoked: false } })
  })
  it('keeps early feedback visible and unbound and excludes it from the Job Room rating', async () => {
    const view = await walletQuest(earlyBuyer, 56)
    expect(view.hires[0]?.reasons).toContain('rating_unbound')
    expect(view.hires[0]?.rating?.value).toBe(100)
    expect((await questJob(56, early))?.rating).toBeNull()
  })
  it('keeps delivered jobs without feedback readable without inventing a rating', async () => {
    const view = await questJob(56, unrated)
    expect(view).toMatchObject({ state: 'SUBMITTED', rating: null })
    expect(view?.events.map(e => e.name)).toEqual(['JobSubmitted'])
  })
})
