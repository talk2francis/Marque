import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { db, closeDb } from '@marque/db'
import { serviceReconciliationQuery, statusCursorsQuery } from './status-cursors'

const fixture = process.env.MARQUE_INTEGRATION_DB
const enabled = !!fixture && /^marque_vnext_fixture_/.test(new URL(fixture).pathname.slice(1))
describe.skipIf(!enabled)('status projection against isolated PostgreSQL cursor growth', () => {
  beforeAll(() => { process.env.DATABASE_URL = fixture })
  afterAll(async () => { await closeDb() })
  it('keeps operational rows bounded while counting every service checkpoint and preserving history', async () => {
    await db().transaction(async tx => {
      await tx.execute(sql`create temporary table ingest_cursor (source text primary key, cursor bigint, updated_at timestamptz) on commit drop`)
      await tx.execute(sql`insert into ingest_cursor values ('scan:list:56',12,'2026-10-22T00:00:00Z'),('registry:services-walk',120,'2026-10-22T02:59:00Z')`)
      await tx.execute(sql`insert into ingest_cursor select 'registry:services:fixture:'||n,100, '2026-10-22T02:58:00Z'::timestamptz from generate_series(1,10000) n`)
      await tx.execute(sql`insert into ingest_cursor select 'registry:services-attempt:fixture:'||n,100,now() from generate_series(1,10000) n`)
      await tx.execute(sql`insert into ingest_cursor values ('registry:services-pending:fixture:active',100,now()),('registry:services-pending:fixture:done',0,now())`)
      const cursors = await tx.execute(statusCursorsQuery())
      expect(cursors.map(row => row.source)).toEqual(['registry:services-walk', 'scan:list:56'])
      expect(JSON.stringify(cursors)).not.toContain('fixture:')
      const [summary] = await tx.execute(serviceReconciliationQuery())
      expect(summary).toMatchObject({ snapshots: 10000, attempts: 10000, pending: 1 })
      const [retained] = await tx.execute(sql`select count(*)::int as n from ingest_cursor`)
      expect(retained?.n).toBe(20004)
    })
  })
})
