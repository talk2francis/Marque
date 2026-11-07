/** Prepare additive indexes without blocking ordinary quote inserts; never edits observations. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { raw, closeDb } from '../packages/db/src/client.js'

const prepare = process.argv[2] === '--prepare'
assert(prepare || process.argv[2] === '--check', 'Use --check or --prepare')
const specs = [
  { name: 'commerce_quote_service_latest_idx', columns: ['service_id', 'created_at', 'id'], options: '0 3 3', predicate: 'service_id IS NOT NULL' },
  { name: 'commerce_quote_agent_read_idx', columns: ['agent_id', 'created_at', 'id', 'service_id'], options: '0 3 3 0', predicate: 'service_id IS NOT NULL' },
  { name: 'commerce_quote_agent_ok_idx', columns: ['agent_id', 'created_at', 'id'], options: '0 3 3', predicate: "ok AND chain_id::text = split_part(agent_id, ':', 1)" },
]
const normalize = (s: string) => s.toLowerCase().replace(/::text/g, '').replace(/[()\s"]/g, '')
const ddls = readFileSync(new URL('../packages/db/drizzle/0030_quote_read_indexes.sql', import.meta.url), 'utf8')
  .split('--> statement-breakpoint').map(s => s.replace(/^--.*$/gm, '').trim()).filter(s => s.startsWith('CREATE INDEX'))
assert.equal(ddls.length, specs.length)

const connection = await raw().reserve()
try {
  await connection.unsafe("set lock_timeout = '2s'")
  await connection.unsafe("set statement_timeout = '120s'")
  for (const spec of specs) {
    const inspect = async () => (await connection<{
      valid: boolean; ready: boolean; options: string; predicate: string; columns: string[]; bytes: string
    }[]>`
      select i.indisvalid as valid, i.indisready as ready, i.indoption::text as options,
        pg_get_expr(i.indpred, i.indrelid) as predicate, pg_relation_size(i.indexrelid)::text as bytes,
        array(select a.attname from unnest(i.indkey) with ordinality as k(attnum, ordinal)
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum order by k.ordinal) as columns
      from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = ${spec.name} and i.indrelid = 'public.commerce_quote'::regclass
    `)[0]
    const before = await inspect()
    const started = Date.now()
    if (!before && prepare) {
      const ddl = ddls.find(s => s.startsWith(`CREATE INDEX IF NOT EXISTS "${spec.name}" `))
      assert(ddl && ddl.includes(' ON "commerce_quote" USING btree '))
      await connection.unsafe(ddl.replace('CREATE INDEX IF NOT EXISTS', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS'))
    }
    const index = await inspect()
    assert(index, `Missing ${spec.name}; use --prepare before the regular migration`)
    assert(index.valid && index.ready, `${spec.name} is not valid and ready; preserve it and investigate`)
    assert.deepEqual(index.columns, spec.columns, `${spec.name} columns differ`)
    assert.equal(index.options, spec.options, `${spec.name} ordering differs`)
    assert.equal(normalize(index.predicate), normalize(spec.predicate), `${spec.name} predicate differs`)
    console.log(JSON.stringify({ index: spec.name, created: !before, valid: true, bytes: Number(index.bytes), elapsedMs: Date.now() - started }))
  }
} finally {
  connection.release()
  await closeDb()
}
