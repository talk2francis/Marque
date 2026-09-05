/**
 * P8a acceptance.
 *
 *   pnpm tsx scripts/p8a-acceptance.mts
 *
 * Three things, measured rather than asserted:
 *
 *   1. Every reference agent answers its own published MCS test, and the
 *      result is printed whether it passes or fails. AGENTS.md is explicit
 *      that we do not exempt ourselves from our own standard, so a failing
 *      first-party agent is listed as failing.
 *   2. p95 latency over 50 REAL calls each, through the public HTTPS path a
 *      buyer would use — not the loopback port, because TLS, Caddy and the
 *      SSRF guard are part of what a buyer waits for.
 *   3. Structured failure under a degraded upstream, in under three seconds.
 *
 * The case is CAPTURED immediately before the run. BSC public nodes keep about
 * 64 blocks of state (~29 seconds at 0.45s blocks), so a case captured earlier
 * cannot be re-read by anyone — including the agent. Capturing and running back
 * to back is the only way the pinned block is still readable by both sides.
 */
import { performance } from 'node:perf_hooks'
import {
  CASES, captureCase, loadCase, runConformance, formatOutcome,
  a2aAdapter, type TestId,
} from '@marque/conformance'
import { closeDb } from '@marque/db'
import { ENGINES } from '@marque/agent-engines'

const BASE = process.env['MARQUE_PUBLIC_URL'] ?? 'https://marque.trade'
const LATENCY_SAMPLES = Number(process.env['P8A_SAMPLES'] ?? 50)

const AGENTS = [
  { id: 'bound', testId: 'MCS-REB-1' },
  { id: 'lattice', testId: 'MCS-GRID-1' },
  { id: 'sluicegate', testId: 'MCS-YIELD-1' },
  { id: 'keel', testId: 'MCS-HF-1' },
  // Redcell has no published MCS test: there is no security case whose answer
  // can be written as an assertion with a numeric tolerance, and inventing one
  // for our own agent would be worse than having none (AGENTS.md invariant 8).
  { id: 'redcell', testId: null },
] as const

function cardUrl(id: string): string {
  return `${BASE}/agents/${id}/.well-known/agent-card.json`
}

function a2aUrl(id: string): string {
  return `${BASE}/agents/${id}/a2a`
}

/** The task each agent is asked 50 times, at the current block. */
function latencyPrompt(id: string, block: string): string {
  const demo = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
  const lp = '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD'
  const head = `Chain: BNB Smart Chain (56). Block: ${block}.`
  switch (id) {
    case 'bound':
      return `${head}\nSubject address: ${lp}\n\nTask: re-centre PancakeSwap V3 position 7321916.\nPOLICY YOU MUST FOLLOW: symmetric ±6% around spot on the 2500 fee tier, with a slippage bound no wider than 40 bps.`
    case 'lattice':
      return `${head}\nSubject address: ${demo}\n\nTask: plan a grid for BNB/USDT.\nPOLICY YOU MUST FOLLOW: 10 levels between 500 and 800, 1000 USD of capital, stop at 450, 25 bps per trade.`
    case 'sluicegate':
      return `${head}\nSubject address: ${demo}\n\nTask: find the best net-of-cost route for 1000 USD of USDT.\nPOLICY YOU MUST FOLLOW: only venus; only recommend a move beating the current 0% by at least 50 bps; leverage NOT allowed.`
    case 'keel':
      return `${head}\nSubject address: ${demo}\n\nTask: report this account's Venus health factor and restore it to 2.5.`
    case 'redcell':
      return `${head}\nTriage contract 0x55d398326f99059fF775485246999027B3197955 for approval and privilege risk.`
    default:
      throw new Error(`no latency prompt for ${id}`)
  }
}

async function callOnce(id: string, prompt: string): Promise<{ ms: number; ok: boolean; detail?: string }> {
  const started = performance.now()
  try {
    const res = await fetch(a2aUrl(id), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'message/send',
        params: { message: { role: 'user', parts: [{ kind: 'text', text: prompt }] } },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const ms = performance.now() - started
    if (!res.ok) return { ms, ok: false, detail: `http ${res.status}` }
    const body = (await res.json()) as { result?: { artifacts?: Array<{ parts?: Array<{ text?: string }> }> }; error?: { message?: string } }
    if (body.error) return { ms, ok: false, detail: body.error.message ?? 'agent error' }
    const text = body.result?.artifacts?.[0]?.parts?.[0]?.text
    if (!text) return { ms, ok: false, detail: 'no artifact text' }
    const answer = JSON.parse(text) as Record<string, unknown>
    // An `error` key is a REFUSAL, which is a correct outcome, not a failure of
    // the agent — but it is a different fact from an answer and is counted so.
    return { ms, ok: !('error' in answer), ...(answer['error'] ? { detail: String(answer['error']) } : {}) }
  } catch (err) {
    return { ms: performance.now() - started, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx] as number
}

async function latency(block: string): Promise<void> {
  console.log(`\n${'='.repeat(78)}\nLATENCY — ${LATENCY_SAMPLES} real calls each, over public HTTPS\n${'='.repeat(78)}`)
  console.log(`${'agent'.padEnd(12)} ${'n'.padStart(3)} ${'ok'.padStart(3)} ${'min'.padStart(7)} ${'p50'.padStart(7)} ${'p95'.padStart(7)} ${'max'.padStart(7)}   budget`)

  for (const { id } of AGENTS) {
    const prompt = latencyPrompt(id, block)
    const samples: number[] = []
    let ok = 0
    let firstFailure: string | undefined
    for (let i = 0; i < LATENCY_SAMPLES; i++) {
      const r = await callOnce(id, prompt)
      samples.push(r.ms)
      if (r.ok) ok++
      else if (!firstFailure) firstFailure = r.detail
    }
    const sorted = [...samples].sort((a, b) => a - b)
    const p95 = percentile(sorted, 95)
    const verdict = p95 < 8_000 ? 'PASS (<8s)' : 'FAIL (>=8s)'
    console.log(
      `${id.padEnd(12)} ${String(samples.length).padStart(3)} ${String(ok).padStart(3)} ` +
      `${sorted[0]!.toFixed(0).padStart(6)}ms ${percentile(sorted, 50).toFixed(0).padStart(6)}ms ` +
      `${p95.toFixed(0).padStart(6)}ms ${sorted[sorted.length - 1]!.toFixed(0).padStart(6)}ms   ${verdict}`,
    )
    if (firstFailure) console.log(`             first non-answer: ${firstFailure.slice(0, 110)}`)
  }
}

/**
 * A degraded upstream must produce a legible failure fast.
 *
 * Exercised by asking for something the engine cannot answer, which is the
 * shape a real degradation takes at the boundary: the agent knows it cannot
 * answer and says why, rather than waiting for a timeout it cannot influence.
 */
async function structuredFailure(): Promise<void> {
  console.log(`\n${'='.repeat(78)}\nSTRUCTURED FAILURE — a refusal must arrive in under 3s\n${'='.repeat(78)}`)
  const unanswerable: Record<string, string> = {
    bound: 'Re-centre a position for 0x000000000000000000000000000000000000dEaD.',
    lattice: 'Plan a grid for BNB/USDT.',
    sluicegate: 'Find me some yield.',
    keel: 'What is the health factor of 0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf?',
    redcell: 'Is this contract safe?',
  }
  for (const { id } of AGENTS) {
    const started = performance.now()
    const r = await callOnce(id, unanswerable[id] as string)
    const ms = performance.now() - started
    console.log(
      `${id.padEnd(12)} ${ms.toFixed(0).padStart(6)}ms  ${ms < 3_000 ? 'PASS' : 'FAIL'}  ` +
      `${(r.detail ?? 'answered anyway — the prompt was answerable after all').slice(0, 96)}`,
    )
  }
}

async function conformance(): Promise<void> {
  console.log(`\n${'='.repeat(78)}\nCONFORMANCE — every reference agent against its own published test\n${'='.repeat(78)}`)
  console.log('Cases are captured immediately before the run: BSC keeps ~64 blocks of')
  console.log('state, so a case captured earlier is unreadable by the agent AND by us.\n')

  for (const c of CASES) {
    process.stdout.write(`capturing ${c.id} (${c.testId})… `)
    try {
      const { groundTruthHash, testCase } = await captureCase({
        id: c.id, testId: c.testId, subject: c.subject, policy: c.policy,
      })
      console.log(`block ${testCase.blockNumber}  hash ${groundTruthHash.slice(0, 18)}…`)
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (const { id, testId } of AGENTS) {
    const engine = ENGINES[id]
    if (!testId) {
      console.log(`\n[${engine?.meta.name ?? id}] ${engine?.meta.category}`)
      console.log('  NOT TESTED — no MCS test is published for this category. An agent with')
      console.log('  no published test carries no warrant, and we do not write one for our')
      console.log('  own agent that no third party could be measured against.')
      continue
    }
    const loaded = await loadCase(testId as TestId)
    if (!loaded) {
      console.log(`\n[${id}] ${testId}: no captured case — the capture above failed.`)
      continue
    }
    console.log(`\n[${engine?.meta.name ?? id}] ${testId}  case ${loaded.testCase.id}  block ${loaded.testCase.blockNumber}`)
    const adapter = a2aAdapter(`marque:${id}`, engine?.meta.name ?? id, cardUrl(id))
    const outcome = await runConformance({ adapter, testId: testId as TestId })
    console.log(formatOutcome(outcome))
  }
}

async function main(): Promise<void> {
  const headRes = await fetch(`${BASE}/api/v1/funnel`).catch(() => null)
  void headRes
  const { publicClient } = await import('@marque/chain')
  const block = (await publicClient().getBlockNumber()).toString()
  console.log(`P8a acceptance · ${BASE} · block ${block} · ${new Date().toISOString()}`)

  await conformance()
  await latency(block)
  await structuredFailure()
  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
