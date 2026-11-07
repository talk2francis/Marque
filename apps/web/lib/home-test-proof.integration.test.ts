import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { network } from '@marque/commerce'
import { stableHash } from '@marque/conformance'
import { passFail } from './home-data'

const url = process.env.MARQUE_INTEGRATION_DB
const enabled = Boolean(url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1)))
const token = String(960000000000n + BigInt(`0x${randomBytes(5).toString('hex')}`))
const agent = `97:${network(97).identityRegistry.toLowerCase()}:${token}`
const name = `Home proof fixture ${token}`
const fields = ['currentTick', 'inRange', 'distanceToBound', 'proposedTickSpacing', 'tickOrdering', 'policyRange', 'amounts', 'slippageBound']
const diffs = fields.map(field => ({ field, pass: false, expected: '1', actual: '2', missing: false }))

async function record(pass: boolean, response: unknown, error: string | null = null, missing = false) {
  const failed = pass || error ? [] : fields
  const checked = pass ? fields.map(field => ({ field, pass: true, expected: '1', actual: '1' }))
    : missing ? fields.map(field => ({ field, pass: false, expected: '1', actual: '(not provided)', missing: true })) : diffs
  const request = { caseId: 'isolated-home-proof', prompt: 'fixture' }
  await db().execute(sql`
    insert into conformance_result(agent_id,test_id,test_version,tolerance_revision,category,case_id,chain_id,block_number,pass,diffs,failed_fields,request,response,request_hash,response_hash,error)
    values (${agent},'MCS-REB-1','1.0',1,'rebalancing','isolated-home-proof',56,'123',${pass},${JSON.stringify(checked)}::jsonb,${JSON.stringify(failed)}::jsonb,${JSON.stringify(request)}::jsonb,${JSON.stringify(response)}::jsonb,${stableHash(request)},${stableHash(response)},${error})
  `)
}

describe.skipIf(!enabled)('home test evidence follows the latest observation', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url
    await db().execute(sql`insert into agent(id,chain_id,token_id,contract_address,owner_address,name) values (${agent},97,${token},${network(97).identityRegistry},${`0x${randomBytes(20).toString('hex')}`},${name})`)
  })
  afterAll(async () => { await closeDb() })

  it('links a current stated-value failure, then stops highlighting it after a newer pass', async () => {
    await record(false, { currentTick: 2 })
    const failed = (await passFail()).fail
    expect(failed?.agent).toBe(name)
    expect(failed?.href).toBe(`/agents/97/${token}`)
    expect(Number.isFinite(Date.parse(failed!.at))).toBe(true)
    await record(true, { currentTick: 1 })
    expect((await passFail()).fail?.agent).not.toBe(name)
  })
  it('does not resurrect an older failure when the latest call is unavailable', async () => {
    await record(false, { currentTick: 2 })
    expect((await passFail()).fail?.agent).toBe(name)
    await record(false, null, 'unusable_response')
    expect((await passFail()).fail?.agent).not.toBe(name)
  })
  it('does not present absent fields on a protocol wrapper as stated wrong values', async () => {
    await record(false, { kind: 'data', data: { currentTick: 1 } }, null, true)
    expect((await passFail()).fail?.agent).not.toBe(name)
  })
})
