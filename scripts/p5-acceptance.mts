/**
 * P5 acceptance.
 *
 *   pnpm tsx scripts/p5-acceptance.mts
 *
 * Three end-to-end runs against our own reference agent, one deliberately
 * failed run, and the SSRF guard blocking a malicious redirect. Nothing signs.
 */
import { createServer } from 'node:http'
import { A2AExecutor, runHire, preflight, structuredTask, type StructuredTask } from '@marque/execution'
import { captureCase, CASES } from '@marque/conformance'
import { safeFetch } from '@marque/probe'
import { publicClient } from '@marque/chain'
import { closeDb } from '@marque/db'

const KEEL_CARD = 'https://marque.trade/agents/keel/.well-known/agent-card.json'
const DEMO = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'

function line(t: string) { console.log(`\n${'='.repeat(76)}\n${t}\n${'='.repeat(76)}`) }

async function main(): Promise<void> {
  // Re-capture the HF case so ground truth is inside the 64-block state window.
  const spec = CASES.find((c) => c.testId === 'MCS-HF-1')!
  const cap = await captureCase({ id: spec.id, testId: spec.testId, subject: spec.subject, policy: spec.policy })
  console.log(`case ${spec.id} captured at block ${cap.testCase.blockNumber} · ground truth ${cap.groundTruthHash.slice(0, 20)}…`)

  const blockNumber = (await publicClient().getBlockNumber()).toString()
  const keel = new A2AExecutor('marque:reference:keel', KEEL_CARD, 'Keel (Marque Reference Agent)')

  const manifest = await keel.inspect()
  if ('ok' in manifest) { console.error('reference agent unreachable', manifest); process.exit(1) }
  console.log(`reference agent reached in ${manifest.latencyMs}ms at ${manifest.endpoint}`)

  // ---------------------------------------------------------------- (a) x3
  line('(a) THREE END-TO-END RUNS AGAINST THE REFERENCE AGENT')
  // All three use the published case's own policy, so all three are graded
  // against the standard. A run with a different policy is shown separately.
  const targets = [2.5, 2.5, 2.5]
  for (const target of targets) {
    const task: StructuredTask = structuredTask.parse({
      kind: 'health_factor', chainId: 56, blockNumber, subject: DEMO,
      maxSpendUsd: 1, policy: { targetHealthFactor: target },
    })

    const pre = await preflight(keel, task)
    const outcome = await runHire({ executor: keel, task, ctx: { buyer: DEMO, maxSpendUsd: 1, deadlineMs: 45_000 } })

    console.log(`\nrun ${outcome.runId}  target HF ${target}`)
    console.log(`  preflight  : ${pre.ok ? 'answered' : `${pre.reason}`} · ${pre.nothingSubmitted ? 'no transaction has been submitted' : ''}`)
    console.log(`  stage      : ${outcome.stage}  (${outcome.elapsedMs}ms)`)
    const q = outcome.receipt?.quality
    console.log(`  quality    : ${q?.testId === null ? 'not graded — this hire asks a different question than the published case' : `${q?.testId} ${q?.pass ? 'PASS' : `FAIL ${q?.failedFields.join(', ')}`}`}`)
    console.log(`  case       : ${outcome.receipt?.quality.caseId} @ ${outcome.receipt?.quality.groundTruthHash?.slice(0, 20)}…`)
    console.log(`  commercial : declared ${outcome.receipt?.commercial.declaredPrice ?? 'no price'} · settled=${outcome.receipt?.commercial.settled}`)
    console.log(`  authority  : cap ${outcome.receipt?.authority.spendCapUsd} USD · allowlist ${outcome.receipt?.authority.allowlist.length} contract(s)`)
    console.log(`  RECEIPT    : ${outcome.receiptHash}`)
    const ans = outcome.run?.result as Record<string, unknown> | null
    if (ans) console.log(`  answer     : HF ${ans['healthFactor']} · repay ${Number(ans['repayUsdToReachTarget']).toFixed(2)} USD`)
  }

  line('(a2) A HIRE THAT ASKS A DIFFERENT QUESTION IS NOT GRADED AGAINST THE CASE')
  const offCase: StructuredTask = structuredTask.parse({
    kind: 'health_factor', chainId: 56, blockNumber, subject: DEMO,
    maxSpendUsd: 1, policy: { targetHealthFactor: 1.6 },
  })
  const off = await runHire({ executor: keel, task: offCase, ctx: { buyer: DEMO, maxSpendUsd: 1 } })
  console.log(`  run ok     : ${off.ok} (stage ${off.stage})`)
  console.log(`  quality    : ${off.receipt?.quality.testId === null ? 'not graded — the published case fixes target 2.5, this hire asked for 1.6' : off.receipt?.quality.testId}`)
  console.log(`  answer     : repay ${Number((off.run?.result as Record<string, unknown>)?.['repayUsdToReachTarget']).toFixed(2)} USD for HF 1.6`)
  console.log(`  RECEIPT    : ${off.receiptHash}`)

  // ------------------------------------------------------- (c) clean failure
  line('(c) A DELIBERATELY FAILED RUN — STRUCTURED, UNDER 3 SECONDS')
  const dead = new A2AExecutor('test:dead', 'https://this-host-does-not-exist.marque.invalid/.well-known/agent-card.json', 'Nonexistent agent')
  const started = Date.now()
  const failTask: StructuredTask = structuredTask.parse({
    kind: 'health_factor', chainId: 56, blockNumber, subject: DEMO,
    maxSpendUsd: 1, policy: { targetHealthFactor: 2.5 },
  })
  const failed = await runHire({ executor: dead, task: failTask, ctx: { buyer: DEMO, maxSpendUsd: 1 } })
  console.log(`  ok        : ${failed.ok}`)
  console.log(`  stage     : ${failed.stage}`)
  console.log(`  failure   : ${failed.failure}`)
  console.log(`  elapsed   : ${Date.now() - started}ms  (must be under 3000)`)

  line('(c2) A RUN REFUSED BEFORE EXECUTION — AUTHORITY CHECKED FIRST')
  const overspend: StructuredTask = structuredTask.parse({
    kind: 'health_factor', chainId: 56, blockNumber, subject: DEMO,
    maxSpendUsd: 500, policy: { targetHealthFactor: 2.5 },
  })
  const refused = await runHire({ executor: keel, task: overspend, ctx: { buyer: DEMO, maxSpendUsd: 1 } })
  console.log(`  stage     : ${refused.stage}  (nothing was executed)`)
  console.log(`  failure   : ${refused.failure}`)

  // ------------------------------------------------- (d) SSRF redirect block
  line('(d) safeFetch BLOCKS A MALICIOUS REDIRECT TO 169.254.169.254')
  const attacker = createServer((_req, res) => {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/' })
    res.end()
  })
  await new Promise<void>((r) => attacker.listen(0, '127.0.0.1', () => r()))
  const addr = attacker.address()
  const attackPort = typeof addr === 'object' && addr ? addr.port : 0

  console.log(`  attacker server on 127.0.0.1:${attackPort} redirects every request to the cloud metadata endpoint`)
  const direct = await safeFetch('http://169.254.169.254/latest/meta-data/iam/security-credentials/', { timeoutMs: 5_000 })
  console.log(`  direct fetch of 169.254.169.254        → ${direct.ok ? 'ALLOWED (BAD)' : `${direct.failure}: ${direct.detail}`} in ${direct.latencyMs}ms`)
  const mapped = await safeFetch('http://[::ffff:169.254.169.254]/latest/meta-data/', { timeoutMs: 5_000 })
  console.log(`  same address as IPv4-mapped IPv6       → ${mapped.ok ? 'ALLOWED (BAD)' : `${mapped.failure}: ${mapped.detail}`} in ${mapped.latencyMs}ms`)
  const viaRedirect = await safeFetch(`http://127.0.0.1:${attackPort}/`, { timeoutMs: 5_000 })
  console.log(`  via the redirecting host               → ${viaRedirect.ok ? 'ALLOWED (BAD)' : `${viaRedirect.failure}: ${viaRedirect.detail}`} in ${viaRedirect.latencyMs}ms`)
  attacker.close()

  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
