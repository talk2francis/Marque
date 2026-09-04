/**
 * Generates docs/standard/MCS-v1.0.md and MCS-v1.0.json.
 *
 * The published standard is emitted FROM the same constants the harness
 * enforces, so it cannot drift from what is actually checked. A standard
 * maintained by hand becomes a lie the first time someone changes a tolerance
 * and forgets the document.
 *
 *   pnpm standard
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ALL_TOLERANCES, EXCLUDED_CHECKS, MCS_VERSION, MCS_TOLERANCE_REVISION,
  CASES, type TestId, type Tolerance,
} from '@marque/conformance'
import { db, closeDb, conformanceCase } from '@marque/db'
import { eq } from 'drizzle-orm'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'docs', 'standard')

const TEST_META: Record<TestId, { name: string; category: string; reader: string }> = {
  'MCS-REB-1': { name: 'Rebalancing', category: 'rebalancing', reader: 'PancakeSwap V3 NonfungiblePositionManager + pool slot0' },
  'MCS-GRID-1': { name: 'Grid Trading', category: 'grid', reader: 'spot balances + pair price' },
  'MCS-YIELD-1': { name: 'Yield Optimisation', category: 'yield', reader: 'Venus Core markets' },
  'MCS-HF-1': { name: 'Health Factor', category: 'health_factor', reader: 'Venus Comptroller' },
}

function bound(t: Tolerance): string {
  return t.value === null ? 'must hold (boolean)' : `±${t.value} ${t.unit}`
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString()

  // Attach the live case for each test, so the published standard names the
  // exact subject and block every agent was graded against.
  const cases = await db().select().from(conformanceCase).where(eq(conformanceCase.active, true))
  const caseByTest = new Map(cases.map((c) => [c.testId, c]))

  const L: string[] = []
  L.push(`# Marque Conformance Standard — MCS v${MCS_VERSION}`)
  L.push('')
  L.push(`> Generated ${generatedAt} from \`packages/conformance/src/tolerances.ts\`.`)
  L.push('> Do not edit by hand — regenerate with `pnpm standard`.')
  L.push(`> Tolerance revision ${MCS_TOLERANCE_REVISION}.`)
  L.push('')
  L.push('## What this standard is, and what it refuses to be')
  L.push('')
  L.push('MCS tests **facts and compliance**. It does not test judgement.')
  L.push('')
  L.push('A conformance check may only assert something with exactly one right answer:')
  L.push('arithmetic, on-chain state, legality against a pool’s own parameters, or compliance')
  L.push('with a policy **that the test case itself supplies**. If a check cannot be written as')
  L.push('an assertion with a numeric tolerance, it is not a conformance check.')
  L.push('')
  L.push('This matters most where it is least convenient. There is no objectively correct')
  L.push('PancakeSwap V3 range in the abstract, so MCS-REB-1 does not pretend to know one:')
  L.push('the case supplies a policy — *"re-centre symmetrically at ±6% around spot"* — and the')
  L.push('test checks whether the agent’s answer is arithmetically correct, legal for the pool,')
  L.push('and compliant with the instruction it was given. Whether ±6% was a *wise* policy is')
  L.push('a question about judgement, and it is measured in the Ledger against a pre-registered')
  L.push('rubric, never as a pass/fail certificate.')
  L.push('')
  L.push('**No LLM grades a conformance test.** Every check in this document is executed by')
  L.push('deterministic code against numbers we computed ourselves from chain state.')
  L.push('')
  L.push('A pass is dated and can go stale. Results are re-run nightly.')
  L.push('')

  L.push('## How a test is run')
  L.push('')
  L.push('1. A **case** is materialised: a real BNB Smart Chain position at a fixed block, plus')
  L.push('   the policy the agent must comply with.')
  L.push('2. **We compute the ground truth ourselves** from chain state, using the same readers')
  L.push('   that power the rest of the product.')
  L.push('3. The agent is asked the same question, and its structured answer is diffed field by')
  L.push('   field against our ground truth using the tolerances below.')
  L.push('4. The result — pass or fail, with every field diff, the raw request and the raw')
  L.push('   response, both hashed — is written to the public record.')
  L.push('')
  L.push('Ground truth is **frozen at capture**. BNB Smart Chain public RPC nodes retain only')
  L.push('about 64 blocks of state (roughly 30 seconds at 0.45s blocks), so a case cannot be')
  L.push('re-derived from a pinned block later without an archive node. Freezing is also')
  L.push('stronger than re-reading: every agent is graded against byte-identical inputs. The')
  L.push('block number and a hash of the frozen snapshot are published with every result, so')
  L.push('anyone with archive access can verify the snapshot against the chain itself.')
  L.push('')
  L.push('An agent that cannot be reached **fails**. "We asked and it did not answer" is a')
  L.push('conformance outcome and belongs in the public record.')
  L.push('')

  for (const [testId, tolerances] of Object.entries(ALL_TOLERANCES) as Array<[TestId, Record<string, Tolerance>]>) {
    const meta = TEST_META[testId]
    const spec = CASES.find((c) => c.testId === testId)
    const live = caseByTest.get(testId)

    L.push(`## ${testId} — ${meta.name}`)
    L.push('')
    L.push(`**Reader:** ${meta.reader}`)
    L.push(`**Category:** \`${meta.category}\``)
    L.push('')
    if (spec) {
      L.push(`**Live case:** \`${spec.id}\``)
      L.push('')
      L.push(`*Subject:* ${Object.entries(spec.subject).map(([k, v]) => `${k} \`${v}\``).join(' · ')}`)
      L.push('')
      L.push(`*Why this subject:* ${spec.why}`)
      L.push('')
      L.push(`*Policy supplied to the agent:* "${(spec.policy as { statement: string }).statement}"`)
      L.push('')
      if (live) {
        L.push(`*Captured at block* \`${live.blockNumber}\` · *ground-truth hash* \`${live.groundTruthHash}\``)
        L.push('')
      }
    }
    L.push('| Check | Bound | What is asserted |')
    L.push('|---|---|---|')
    for (const t of Object.values(tolerances)) {
      L.push(`| \`${t.id}\` | ${bound(t)} | ${t.description} |`)
    }
    L.push('')
    L.push('**Why these bounds**')
    L.push('')
    for (const t of Object.values(tolerances)) {
      L.push(`- **\`${t.id}\`** — ${t.rationale}`)
    }
    L.push('')
  }

  L.push('## Deliberately not tested')
  L.push('')
  L.push('A standard is defined as much by what it refuses to grade as by what it grades.')
  L.push('Each of these was considered and excluded, because grading it would make the')
  L.push('standard quietly non-deterministic.')
  L.push('')
  L.push('| Excluded check | Test | Why it is excluded |')
  L.push('|---|---|---|')
  for (const e of EXCLUDED_CHECKS) {
    L.push(`| ${e.check} | ${e.test} | ${e.reason} |`)
  }
  L.push('')
  L.push('These are not ignored — they are measured in the Ledger, against a rubric that is')
  L.push('version-hashed and published before any run, and reported as a score rather than as')
  L.push('a certificate.')
  L.push('')
  L.push('## Versioning')
  L.push('')
  L.push(`This is MCS v${MCS_VERSION}, tolerance revision ${MCS_TOLERANCE_REVISION}. Every result row records the`)
  L.push('version and revision it was graded under, so a tightened tolerance never silently')
  L.push('invalidates or flatters an older result.')
  L.push('')

  const json = {
    version: MCS_VERSION,
    toleranceRevision: MCS_TOLERANCE_REVISION,
    generatedAt,
    generatedFrom: 'packages/conformance/src/tolerances.ts',
    tests: Object.fromEntries(
      (Object.entries(ALL_TOLERANCES) as Array<[TestId, Record<string, Tolerance>]>).map(([testId, tolerances]) => {
        const spec = CASES.find((c) => c.testId === testId)
        const live = caseByTest.get(testId)
        return [testId, {
          name: TEST_META[testId].name,
          category: TEST_META[testId].category,
          reader: TEST_META[testId].reader,
          case: spec ? {
            id: spec.id,
            subject: spec.subject,
            policy: spec.policy,
            why: spec.why,
            blockNumber: live?.blockNumber ?? null,
            groundTruthHash: live?.groundTruthHash ?? null,
          } : null,
          checks: Object.values(tolerances).map((t) => ({
            id: t.id, description: t.description, bound: t.value, unit: t.unit, rationale: t.rationale,
          })),
        }]
      }),
    ),
    excluded: EXCLUDED_CHECKS,
  }

  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, `MCS-v${MCS_VERSION.split('.').slice(0, 2).join('.')}.md`), L.join('\n'))
  writeFileSync(join(OUT, `MCS-v${MCS_VERSION.split('.').slice(0, 2).join('.')}.json`), JSON.stringify(json, null, 2))
  console.log(`wrote docs/standard/MCS-v1.0.md and .json (v${MCS_VERSION}, revision ${MCS_TOLERANCE_REVISION})`)
  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
