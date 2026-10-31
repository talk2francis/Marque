import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeDb, db } from '@marque/db'
import { network } from '@marque/commerce'
import { builderIdentityPage } from './builder'
const url = process.env['MARQUE_INTEGRATION_DB']
const enabled = Boolean(url && /^marque_vnext_fixture_/.test(new URL(url).pathname.slice(1)))
const owner = `0x${Date.now().toString(16).padStart(40, '0')}`
const prefix = String(930000000000 + (Date.now() % 100000000))
describe.skipIf(!enabled)(
  'builder identities are counted and paged without losing the ninth agent',
  () => {
    beforeAll(async () => {
      process.env['DATABASE_URL'] = url
      for (let i = 0; i < 11; i++) {
        const chainId = i % 2 === 0 ? 56 : 97
        const tokenId = String(BigInt(prefix) + BigInt(i))
        const registry = network(chainId).identityRegistry
        const id = `${chainId}:${registry.toLowerCase()}:${tokenId}`
        await db().execute(
          sql`insert into agent(id,chain_id,token_id,contract_address,owner_address) values (${id},${chainId},${tokenId},${registry},${owner})`,
        )
      }
    })
    afterAll(async () => {
      await closeDb()
    })
    it('returns a real total and every remaining identity on the next page', async () => {
      const first = await builderIdentityPage(owner, 0)
      const second = await builderIdentityPage(owner, 8)
      expect(first.total).toBe(11)
      expect(first.targets).toHaveLength(8)
      expect(second.total).toBe(11)
      expect(second.targets).toHaveLength(3)
      expect(
        new Set([...first.targets, ...second.targets].map((t) => `${t.chainId}:${t.tokenId}`)).size,
      ).toBe(11)
    })
    it('keeps the real total for an empty page and returns zero for an unknown wallet', async () => {
      expect(await builderIdentityPage(owner, 16)).toEqual({ targets: [], total: 11 })
      expect(await builderIdentityPage('0x0000000000000000000000000000000000000000', 0)).toEqual({
        targets: [],
        total: 0,
      })
    })
  },
)
