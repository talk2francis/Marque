import postgres from 'postgres'
import { writeFileSync } from 'node:fs'
const sql = postgres(process.env.DATABASE_URL, { max: 1 })
try {
 const rows = await sql`select id, benchmark_id, arm, batch, rep, block_number, elapsed_ms, score_total, score_out_of, scored_blind, manifest, output, ran_at from benchmark_run order by benchmark_id, id`
 writeFileSync('/tmp/marque-global-audit/all-ledger-runs.json', JSON.stringify(rows, null, 2))
 for (const r of rows) console.log(JSON.stringify({id:r.id,b:r.benchmark_id,arm:r.arm,batch:r.batch,rep:r.rep,block:r.block_number,score:r.score_total,blind:r.scored_blind,task:r.manifest.task_hash,input:r.manifest.input_hash,at:r.ran_at}))
} finally { await sql.end() }
