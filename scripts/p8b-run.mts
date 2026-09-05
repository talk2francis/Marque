/**
 * P8b — run the agent arms and seal live recommendations.
 *
 *   pnpm tsx scripts/p8b-run.mts            agent arms + seals
 *   pnpm tsx scripts/p8b-run.mts --seals    seals only
 *   pnpm tsx scripts/p8b-run.mts --arms     agent arms only
 *
 * What this script CANNOT do, by design: run the manual arms. A human runs
 * those with a stopwatch and a screen recording, and pastes the output into
 * /ledger/intake, which hashes it into the manifest. Simulating them would be
 * trivial and would make every number on /ledger worthless.
 */
import {
  BENCHMARKS, registerBenchmark, runAgentArms, benchmarkStatus, seal, allSeals,
} from '@marque/ledger'
import { publicClient } from '@marque/chain'
import { ENGINES } from '@marque/agent-engines'
import { closeDb } from '@marque/db'

const BASE = process.env['MARQUE_PUBLIC_URL'] ?? 'https://marque.trade'
const only = process.argv.includes('--seals') ? 'seals'
  : process.argv.includes('--arms') ? 'arms'
  : 'both'

async function arms(): Promise<void> {
  const block = (await publicClient().getBlockNumber()).toString()
  console.log(`\n${'='.repeat(78)}\nBENCHMARK AGENT ARMS · block ${block}\n${'='.repeat(78)}`)

  for (const spec of BENCHMARKS) {
    const reg = await registerBenchmark(spec, block)
    console.log(`\n${spec.id}  ${spec.title}`)
    console.log(`  agent      ${spec.agentName} (${spec.agentId})`)
    console.log(`  task hash  ${reg.taskHash}`)
    console.log(`  rubric     v1.0  ${reg.rubricHash}   (registered BEFORE any arm ran)`)

    const results = await runAgentArms(spec, { baseUrl: BASE, reps: 2 })
    for (const r of results) {
      console.log(
        `  rep ${r.rep}      ${r.ok ? 'answered' : 'FAILED'}  ${String(r.elapsedMs).padStart(6)}ms  ` +
        `output ${r.outputHash.slice(0, 18)}…  manifest ${r.manifestHash.slice(0, 18)}…`,
      )
      if (r.detail) console.log(`             ${r.detail}`)
    }
    const status = await benchmarkStatus(spec.id)
    console.log(`  status     agent ${status.agentReps}/2 · manual ${status.manualReps}/2 · ${status.complete ? 'COMPLETE' : 'incomplete'}`)
    if (!status.complete) console.log(`             waiting on: ${status.missing.join('; ')}`)
  }
}

/**
 * Seal a live recommendation from each agent.
 *
 * These are REAL answers to REAL current chain state, hashed and written on
 * chain before anyone knows how they turn out. The resolution rule for each is
 * written at issue time, in the same transaction's payload, so it cannot be
 * softened later to make a call look right.
 */
async function seals(): Promise<void> {
  const block = (await publicClient().getBlockNumber()).toString()
  const demo = process.env['DEMO_ADDRESS'] ?? '0x60AA3AEE06E2345A17E4d4B12c53E046F4F63CAf'
  const lp = '0x2e07E0145C0CFdF6D200B0aFAeD36953ef00d0cD'
  const bscUsd = '0x55d398326f99059fF775485246999027B3197955'

  const asks: Array<{
    id: string; subject: string; prompt: string; rule: string; afterSeconds: number
  }> = [
    {
      id: 'keel',
      subject: demo,
      prompt: `Chain: BNB Smart Chain (56). Block: ${block}.\nSubject address: ${demo}\n\nTask: report this account's Venus health factor and restore it to 1.35.`,
      rule: 'CORRECT if, at resolution, applying the stated repayUsdToReachTarget to the account’s borrow balance would produce a health factor within 0.005 of 1.35 at the health factor and collateral prices read at seal time. INCORRECT otherwise. VOID if the account closes its position before resolution.',
      afterSeconds: 24 * 3600,
    },
    {
      id: 'bound',
      subject: lp,
      prompt: `Chain: BNB Smart Chain (56). Block: ${block}.\n\nTask: re-centre PancakeSwap V3 position 7321916.\nPOLICY YOU MUST FOLLOW: symmetric ±6% around spot on the 2500 fee tier, with a slippage bound no wider than 40 bps.`,
      rule: 'CORRECT if, at resolution, the pool’s current tick still lies inside the proposed tick range — the range this agent proposed would still have been earning fees. INCORRECT if price has left it. VOID if the position is burned.',
      afterSeconds: 24 * 3600,
    },
    {
      id: 'sluicegate',
      subject: demo,
      prompt: `Chain: BNB Smart Chain (56). Block: ${block}.\nSubject address: ${demo}\n\nTask: find the best net-of-cost route for 1000 USD of USDT.\nPOLICY YOU MUST FOLLOW: only venus; only recommend a move beating the current 0% by at least 50 bps; leverage NOT allowed.`,
      rule: 'CORRECT if, at resolution, the recommended venue’s net APR at 1,000 USD is still within 50 bps of the figure sealed here, or still the best available among the allowed protocols. INCORRECT if another allowed venue now beats it by more than 50 bps.',
      afterSeconds: 24 * 3600,
    },
    {
      id: 'lattice',
      subject: demo,
      prompt: `Chain: BNB Smart Chain (56). Block: ${block}.\n\nTask: plan a grid for BNB/USDT.\nPOLICY YOU MUST FOLLOW: 10 levels between 500 and 800, 1000 USD of capital, stop at 450, 25 bps per trade.`,
      rule: 'CORRECT if, at resolution, the BNB/USDT price has stayed inside the sealed band [lowest level, highest level] — the grid would have been trading rather than stranded. INCORRECT if price left the band in either direction.',
      afterSeconds: 24 * 3600,
    },
    {
      id: 'redcell',
      subject: bscUsd,
      prompt: `Chain: BNB Smart Chain (56). Block: ${block}.\nTriage contract ${bscUsd} for approval and privilege risk.`,
      rule: 'CORRECT if, at resolution, the contract’s owner and the privileged functions named here are unchanged — the triage still describes the contract. INCORRECT if ownership moved or the implementation changed, which is exactly the risk the finding warned about.',
      afterSeconds: 24 * 3600,
    },
  ]

  console.log(`\n${'='.repeat(78)}\nSEALED CALLS · block ${block} · BSC testnet MarqueRegistry\n${'='.repeat(78)}`)
  for (const ask of asks) {
    const engine = ENGINES[ask.id]
    if (!engine) { console.log(`${ask.id}: no engine`); continue }
    const recommendation = await engine.run(ask.prompt)
    if ('error' in recommendation) {
      console.log(`${ask.id.padEnd(12)} skipped — the agent refused: ${String(recommendation['error']).slice(0, 70)}`)
      continue
    }
    const result = await seal({
      agentId: `marque:${ask.id}`,
      category: engine.meta.category,
      recommendation,
      subject: ask.subject,
      blockNumber: block,
      resolutionRule: ask.rule,
      resolveAfterSeconds: ask.afterSeconds,
    })
    console.log(
      `${ask.id.padEnd(12)} ${result.ok ? 'SEALED  ' : 'FAILED  '} ${result.hash.slice(0, 20)}…  ` +
      `${result.txHash ? `tx ${result.txHash}` : (result.detail ?? '')}`,
    )
  }

  const rows = await allSeals()
  const anchored = rows.filter((r) => r.sealTxHash)
  console.log(`\n${anchored.length} of ${rows.length} sealed call(s) anchored on chain.`)
  for (const r of anchored.slice(0, 10)) {
    console.log(`  ${r.agentId.padEnd(18)} ${r.hash.slice(0, 18)}…  block ${r.sealBlock}  https://testnet.bscscan.com/tx/${r.sealTxHash}`)
  }
}

async function main(): Promise<void> {
  if (only !== 'seals') await arms()
  if (only !== 'arms') await seals()
  await closeDb()
}

main().catch((err) => { console.error(err); process.exit(1) })
