/**
 * Release-only, read-only verification of independent ERC-8004 services.
 *
 * This script never writes to Postgres. It emits immutable timestamped JSON
 * evidence under docs/evidence/third-party/candidate-discovery/ so the old
 * probe model cannot be mistaken for fresh protocol interoperability.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { probeA2A, probeMCP, probeX402, type ProbeOutcome } from '@marque/probe'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const requested = Number.parseInt(process.env.CANDIDATE_LIMIT ?? '30', 10)
const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 20), 100) : 30
const sql = postgres(databaseUrl, { max: 1, idle_timeout: 5 })

type Candidate = {
  agent_id: string
  token_id: string
  name: string | null
  owner_address: string | null
  service_id: number
  kind: 'a2a' | 'mcp' | 'x402'
  endpoint: string
  category: string | null
  previous_checked_at: Date | null
  previous_ok: boolean | null
  previous_detail: string | null
}

const candidates = await sql<Candidate[]>`
  WITH latest_probe AS (
    SELECT DISTINCT ON (service_id)
      service_id, checked_at, ok, detail
    FROM probe
    WHERE service_id IS NOT NULL
    ORDER BY service_id, checked_at DESC
  ), ranked AS (
    SELECT
      a.id AS agent_id,
      a.token_id,
      a.name,
      a.owner_address,
      s.id AS service_id,
      s.kind,
      COALESCE(s.resolved_endpoint, s.endpoint) AS endpoint,
      c.category,
      p.checked_at AS previous_checked_at,
      p.ok AS previous_ok,
      p.detail AS previous_detail,
      row_number() OVER (
        PARTITION BY lower(COALESCE(s.resolved_endpoint, s.endpoint))
        ORDER BY p.ok DESC NULLS LAST, p.checked_at DESC NULLS LAST, s.id
      ) AS endpoint_rank
    FROM agent a
    JOIN agent_service s ON s.agent_id = a.id
    LEFT JOIN latest_probe p ON p.service_id = s.id
    LEFT JOIN LATERAL (
      SELECT ac.category
      FROM agent_category ac
      WHERE ac.agent_id = a.id
      ORDER BY ac.confidence DESC, ac.category
      LIMIT 1
    ) c ON true
    WHERE a.chain_id = 56
      AND s.kind IN ('a2a', 'mcp', 'x402')
      AND COALESCE(s.resolved_endpoint, s.endpoint) ~ '^https://'
      AND lower(COALESCE(a.name, '')) NOT IN ('bound', 'lattice', 'sluicegate', 'keel', 'redcell')
      AND lower(COALESCE(s.resolved_endpoint, s.endpoint)) NOT LIKE '%usemarque.xyz%'
      AND lower(COALESCE(s.resolved_endpoint, s.endpoint)) NOT LIKE '%marque.trade%'
  )
  SELECT
    agent_id, token_id, name, owner_address, service_id, kind, endpoint,
    category, previous_checked_at, previous_ok, previous_detail
  FROM (
    SELECT ranked.*,
      row_number() OVER (
        PARTITION BY kind
        ORDER BY previous_ok DESC NULLS LAST, previous_checked_at DESC NULLS LAST, service_id
      ) AS kind_rank
    FROM ranked
    WHERE endpoint_rank = 1
  ) balanced
  WHERE kind_rank <= ${Math.ceil(limit / 3)}
  ORDER BY
    CASE kind WHEN 'a2a' THEN 0 WHEN 'mcp' THEN 1 ELSE 2 END,
    previous_ok DESC NULLS LAST,
    previous_checked_at DESC NULLS LAST,
    service_id
  LIMIT ${limit}
`
await sql.end()

async function probe(candidate: Candidate): Promise<ProbeOutcome> {
  if (candidate.kind === 'a2a') return probeA2A(candidate.endpoint)
  if (candidate.kind === 'mcp') return probeMCP(candidate.endpoint)
  return probeX402(candidate.endpoint)
}

// Keep concurrency deliberately low: these are unrelated external systems and
// verification must not become an accidental load test.
const measured: Array<Candidate & { measured_at: string; outcome: ProbeOutcome }> = []
for (let offset = 0; offset < candidates.length; offset += 3) {
  const batch = candidates.slice(offset, offset + 3)
  const results = await Promise.all(batch.map(async (candidate) => ({
    ...candidate,
    measured_at: new Date().toISOString(),
    outcome: await probe(candidate),
  })))
  measured.push(...results)
}

const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
const outputDir = resolve('docs/evidence/third-party/candidate-discovery')
await mkdir(outputDir, { recursive: true })
const output = resolve(outputDir, `${stamp}.json`)
await writeFile(output, `${JSON.stringify({
  evidence_type: 'fresh-read-only-service-probes',
  generated_at: new Date().toISOString(),
  source_chain_id: 56,
  production_database_mutated: false,
  candidate_count: measured.length,
  candidates: measured,
}, null, 2)}\n`, { flag: 'wx' })

const discoveryOk = measured.filter((row) => row.outcome.ok)
console.log(JSON.stringify({ output, attempted: measured.length, discovery_ok: discoveryOk.length,
  discovery_ok_candidates: discoveryOk.map((row) => ({
    agent_id: row.agent_id, service_id: row.service_id, kind: row.kind,
    endpoint: row.endpoint, task_kinds: row.outcome.taskKinds ?? [],
  })),
}, null, 2))
