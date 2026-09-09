#!/usr/bin/env node
/**
 * Blind-grade the Ledger's benchmark arms.
 *
 *   node scripts/ledger-grade.mjs            dry run — shows the anonymised pairs
 *   node scripts/ledger-grade.mjs --go       grade and write score_* columns
 *   node scripts/ledger-grade.mjs --go --only ADV-02
 *
 * WHY THIS IS A SCRIPT AND NOT A PERSON READING THE PAGE
 *
 * /ledger/methodology promises: "the grader sees two answers and the rubric, and
 * does not know which arm produced which." Anyone who has already read the two
 * outputs — including whoever is operating this repo — is disqualified from
 * being that grader, because they cannot unsee the label.
 *
 * So blindness is enforced mechanically here:
 *   1. Source labels are stripped from both answers (the agent arm's JSON keys
 *      that name the engine, the manual arm's "I read…" phrasing is left alone
 *      because it is prose, but any explicit arm marker is removed).
 *   2. The two answers are assigned A/B by a coin flip seeded per benchmark.
 *   3. The grading call receives ONLY: the task, the rubric, answer A, answer B.
 *      It is never told which arm is which, and it cannot query for it.
 *   4. The mapping is un-shuffled here, after the scores come back.
 *
 * The grader is a language model. That is disclosed on the methodology page and
 * on every benchmark — it is a judgement call about writing quality, which is
 * exactly what the Ledger exists to measure and exactly what MCS refuses to do.
 * The rubric was registered and hashed before either arm ran, so the grader
 * cannot be tuned to the result.
 *
 * A grade is never overwritten. Re-running against an already-scored arm is a
 * no-op unless --regrade is passed, and a regrade records a new scored_at.
 */
import { createHash } from 'node:crypto'
import postgres from 'postgres'

const GO = process.argv.includes('--go')
const REGRADE = process.argv.includes('--regrade')
const onlyIx = process.argv.indexOf('--only')
const ONLY = onlyIx > -1 ? process.argv[onlyIx + 1] : null

const KEY = process.env.DEEPSEEK_API_KEY
if (GO && !KEY) { console.error('DEEPSEEK_API_KEY not set'); process.exit(1) }
const DB = process.env.DATABASE_URL
if (!DB) { console.error('DATABASE_URL not set'); process.exit(1) }

const sql = postgres(DB, { max: 2 })

/**
 * Remove what identifies the ARM, and nothing else.
 *
 * A first version also redacted `source`, `method` and `readAt`. That was a
 * serious mistake: those fields ARE the Provenance criterion the rubric scores
 * 15 points on, so stripping them made every structured answer look unsourced
 * and the grader — correctly — gave it zero. Citing where a number came from is
 * not an arm marker; a careful human cites sources too.
 *
 * What actually leaks the arm is an explicit self-reference ("the agent
 * returned…", "I read…"), so only that is neutralised.
 */
function anonymise(text) {
  return String(text ?? '')
    .replace(/\b(the agent arm|the manual arm|the human arm|agent arm|manual arm|human arm)\b/gi, 'this response')
    .replace(/\b(the agent|the analyst|the responder)\b/gi, 'this response')
    .trim()
}

/**
 * The grader. DeepSeek is already the project's only model dependency (the
 * classify worker), so grading introduces no new vendor and no new key. It is
 * named on the methodology page and on every benchmark — a reader should know
 * exactly what produced a judgement score.
 */
const GRADER_MODEL = process.env.LEDGER_GRADER_MODEL ?? 'deepseek-chat'

/**
 * Grade ONE answer against the rubric.
 *
 * Deliberately not a comparison. A first attempt graded all of a benchmark's
 * answers in one call and produced nonsense — four byte-identical answers came
 * back scored 30, 30, 70, 30, and one whole benchmark scored zero across the
 * board. Relative grading let presentation order leak in as signal.
 *
 * One answer at a time against an absolute standard fixes that: the rubric
 * already states what full marks means per criterion, temperature is 0, and
 * identical text is graded once and reused (see the dedupe below), so identical
 * answers cannot receive different scores.
 */
async function gradeOne({ task, rubric, answer }) {
  const criteria = rubric.criteria.map((c) => `- ${c.id} (${c.name}, max ${c.points} pts): ${c.standard}`).join('\n')
  const notes = (rubric.notes ?? []).map((n) => `- ${n}`).join('\n')

  const prompt = `You are grading ONE answer to an analytical task against a fixed rubric.

You do not know who or what produced this answer — a person, a program, anything. Do not speculate
about it and do not let format sway you. A terse answer that states every required fact correctly
scores as well as a long one; a long one that omits a required field does not get credit for
effort. Structured data (e.g. JSON) is a legitimate answer format.

## THE TASK THAT WAS SET
${task}

## THE RUBRIC — total ${rubric.total} points, version ${rubric.version}
${criteria}

Scoring notes that bind you:
${notes}

## THE ANSWER TO GRADE
${answer}

## WHAT TO RETURN
Think briefly, then return ONLY this JSON object on the last line — one integer per criterion:

${JSON.stringify(Object.fromEntries(rubric.criteria.map((c) => [c.id, `<integer 0-${c.points}>`]))).replace(/"</g, '<').replace(/>"/g, '>')}

Rules:
- Every criterion id above must be a key. Each value is a single integer, 0 to that
  criterion's stated maximum, never over.
- Award points for what the answer actually does. Zero is a strong claim — use it only when
  nothing in the answer addresses that criterion at all. A correct but brief answer still earns
  correctness marks; a long answer that omits a required field does not earn completeness for effort.
- Do not output prose after the JSON.`

  // The grader models spend "reasoning tokens" before the answer; a tight
  // max_tokens gets eaten by that. Give plenty of room, forbid the long
  // reasoning explicitly, and hard-abort a stalled request.
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
          model: GRADER_MODEL,
          messages: [
            { role: 'system', content: 'Answer immediately with the JSON only. Do not write out step-by-step reasoning. At most one short sentence of thought, then the JSON object on its own line.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0, // judgement as reproducible as the arithmetic it grades
          max_tokens: 8000,
        }),
      })
      if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`)
      const body = await res.json()
      const choice = body.choices?.[0]
      const text = choice?.message?.content ?? ''
      // last {...} in the text — after any reasoning the model prints
      const matches = [...text.matchAll(/\{[^{}]*\}/g)]
      const m = matches[matches.length - 1]
      if (!m) throw new Error(`empty content (finish_reason=${choice?.finish_reason})`)
      const raw = JSON.parse(m[0])
      // normalise {id: 30} and {id: {points: 30}} to {id: {points: 30}}
      const out = {}
      for (const c of rubric.criteria) {
        const v = raw[c.id]
        out[c.id] = { points: typeof v === 'object' && v ? Number(v.points ?? 0) : Number(v ?? 0) }
      }
      return out
    } catch (e) {
      lastErr = e
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error(`grader failed after 3 attempts: ${lastErr?.message ?? lastErr}`)
}

function totalOf(rubric, scores) {
  let t = 0
  for (const c of rubric.criteria) t += Number(scores[c.id]?.points ?? 0)
  return t
}

const benchmarks = await sql`select id, task, rubric, rubric_version, rubric_hash from benchmark ${ONLY ? sql`where id = ${ONLY}` : sql``} order by id`

for (const bench of benchmarks) {
  const rubric = bench.rubric
  console.log(`\n${'═'.repeat(70)}\n${bench.id}  ·  rubric v${bench.rubric_version}  ${String(bench.rubric_hash).slice(0, 18)}…`)

  // EVERY repetition of both arms is graded. The page averages the reps, so
  // scoring only one would let a terse second rep drag an arm down unscored, or
  // flatter it. Reps are answers in their own right.
  const runs = await sql`
    select id, arm, rep, output_text, score_total, block_number
    from benchmark_run
    where benchmark_id = ${bench.id} and output_text is not null
    order by arm, rep, ran_at
  `
  /*
   * Only runs that answered at the PINNED block are comparable.
   *
   * The agent arms were captured across three batches on 5 Sep, and the runner
   * called the live endpoint each time — so several reps read the chain at
   * whatever block was current, not the block the task names. Their numbers are
   * right about a different world. Grading them against a rubric whose first
   * criterion is "right against chain state at the pinned block" would score a
   * correct engine as wrong. They are excluded here and the exclusion is
   * reported rather than quietly dropped.
   *
   * A run with no recorded block (the manual arms record 0) is kept: the
   * analyst's own text states the block they worked at.
   */
  const pinned = String(bench.task).match(/Block:\s*(\d+)/)?.[1] ?? null
  const excluded = pinned
    ? runs.filter((r) => r.block_number && r.block_number !== '0' && r.block_number !== pinned)
    : []
  const eligible = runs.filter((r) => !excluded.includes(r))
  if (excluded.length) {
    console.log(`  pinned block ${pinned}; excluding ${excluded.length} run(s) read at another block: ${[...new Set(excluded.map((r) => `${r.arm}#${r.rep}@${r.block_number}`))].join(', ')}`)
  }

  const arms = new Set(eligible.map((r) => r.arm))
  if (!arms.has('agent') || !arms.has('manual')) { console.log('  skip — both arms are needed for a blind grade'); continue }
  if (!REGRADE && eligible.every((r) => r.score_total !== null)) {
    console.log('  already scored — pass --regrade to score again'); continue
  }

  // Identical text is graded ONCE and the score reused. A deterministic engine
  // answering the same question four times produces four identical answers, and
  // they must not be able to receive four different scores.
  const byHash = new Map()
  for (const r of eligible) {
    const h = createHash('sha256').update(anonymise(r.output_text)).digest('hex')
    if (!byHash.has(h)) byHash.set(h, { text: anonymise(r.output_text), runs: [] })
    byHash.get(h).runs.push(r)
  }
  console.log(`  ${eligible.length} eligible answers, ${byHash.size} distinct; each distinct answer graded once against the rubric alone`)

  if (!GO) {
    for (const [h, g] of byHash) console.log(`  --- ${h.slice(0, 10)} × ${g.runs.length} (${g.text.length} chars) ---\n${g.text.slice(0, 200)}\n`)
    continue
  }

  const PASSES = 3
  const stamp = {
    grader: GRADER_MODEL,
    graded_at: new Date().toISOString(),
    rubric_hash: bench.rubric_hash,
    distinct_answers: byHash.size,
    pinned_block: pinned,
    passes: PASSES,
    excluded_wrong_block: excluded.map((r) => ({ arm: r.arm, rep: r.rep, block: r.block_number })),
    note: `Each answer was graded ${PASSES} times, on its own, against the rubric; the per-criterion score is the median of the passes (LLM judgement is noisy on terse-vs-verbose answers, and the median damps a bad draw). Arm self-references were neutralised; the grader was never told what produced an answer, how many arms existed, or how the others scored. Identical answers were graded once. Runs that read a block other than the one the task pins were excluded.`,
  }
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  }

  for (const group of byHash.values()) {
    // Grade PASSES times and take the per-criterion median.
    const runsOut = []
    for (let p = 0; p < PASSES; p++) runsOut.push(await gradeOne({ task: bench.task, rubric, answer: group.text }))
    const scores = {}
    let bad = false
    for (const c of rubric.criteria) {
      const pts = runsOut.map((o) => o[c.id]?.points).filter((n) => Number.isFinite(n))
      if (pts.length === 0) { bad = true; break }
      scores[c.id] = { points: Math.round(median(pts)) }
    }
    if (bad) { console.log('  ! grader failed to score a criterion across all passes — not written'); continue }
    const total = totalOf(rubric, scores)
    for (const run of group.runs) {
      console.log(`  ${run.arm.padEnd(6)} rep ${run.rep}  ${String(total).padStart(3)} / ${rubric.total}`)
      await sql`
        update benchmark_run set
          score_breakdown = ${sql.json(scores)},
          score_total = ${total},
          score_out_of = ${rubric.total},
          score_reasons = ${sql.json(stamp)},
          scored_at = now(),
          scored_blind = true
        where id = ${run.id}
      `
    }
  }
  console.log('  written')
}

await sql.end()
console.log(GO ? '\nDone.' : '\nDry run. Pass --go to grade and write.')
