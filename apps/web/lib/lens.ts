import 'server-only'
import { sql } from 'drizzle-orm'
import { cachedProjection, db } from '@marque/db'
import { normalizeAnswer, questJob, type ChainId, type Lens } from '@marque/commerce'
import { checksFor, type LensCheck } from '@marque/conformance'
import { criteriaFor, criterionByText, evaluateCriteria, type CriterionResult } from '@marque/conformance/criteria'
import { jobManifest, type Manifest } from './manifest'
import { onchainJobTask } from './job-description'

/**
 * Result Lens, server side (SPEC-WORKSPACE 2.1): the delivered answer read for its category, and
 * Marque's own checks of it. Checks are the Standard's assertions with the Standard's tolerances
 * (packages/conformance), applied to a paid answer: a recomputation from BNB Chain at the block the
 * answer names (archive reads), or a pure arithmetic assertion on the answer itself. Every check
 * says which it is. Nothing here is a judgement of the answer's quality.
 */

export type { CheckState, LensCheck } from '@marque/conformance'

const ADDR = /0x[0-9a-fA-F]{40}/
export interface JobLens {
  lens: Lens | null
  checks: LensCheck[]
  checkedAtBlock: string | null
  summary: { checked: number; agreed: number }
  /**
   * V4.2 L0. decided: at least one check ran to an answer. unavailable: a check exists but a chain read failed (say so,
   * with the time of the attempt). no-check: no check exists for this answer, or it lacks an input a check needs
   * (`reason` names it). A decided result pinned to a block is stored permanently (lens_result) and read first.
   */
  state: 'decided' | 'unavailable' | 'no-check'
  reason: string | null
  attemptedAt: string
  stored: boolean
  manifest: { matches: boolean | null; hash: string | null; raw: string | null; url: string | null; source: string | null; hashAlgorithm?: 'keccak256' | 'sha256' } | null
  readable: boolean
  /** The acceptance criteria and whether each was met, from the same checks. */
  terms: LensTerms | null
}

/**
 * signed: the criteria are in the job description inside the terms the agent signed. buyer: in the description, set by
 * the buyer, not signed by the agent. standard: the job carries no criteria; Marque's criteria for the category are
 * shown against the same checks, and are not part of this job's terms.
 */
export interface LensTerms { source: 'signed' | 'buyer' | 'standard'; rows: CriterionResult[]; met: number; of: number }

export function termsOf(description: string | null, category: string | null, checks: readonly LensCheck[]): LensTerms | null {
  let texts: string[] = []
  let source: LensTerms['source'] = 'standard'
  try {
    const d = JSON.parse(description ?? '') as { provider_sig?: unknown; terms?: { success_criteria?: unknown; criteria_set_by?: unknown } }
    const sc = d?.terms?.success_criteria
    if (Array.isArray(sc) && sc.length) {
      texts = sc.filter((x): x is string => typeof x === 'string')
      source = typeof d.provider_sig === 'string' && d.terms?.criteria_set_by !== 'buyer' ? 'signed' : 'buyer'
    }
  } catch { /* plain-text description: no criteria in it */ }
  const list = texts.length ? texts.map((t) => criterionByText(t) ?? { id: `other-${t.length}`, text: t, check: '\u0000' }) : [...criteriaFor(category)]
  if (!list.length) return null
  const rows = evaluateCriteria(list, checks)
  return { source, rows, met: rows.filter((r) => r.state === 'met').length, of: rows.length }
}

type ReadJob = Awaited<ReturnType<typeof questJob>>
async function build(chainId: ChainId, jobId: string, opts: { replay?: boolean; job?: ReadJob } = {}): Promise<JobLens> {
  const job = opts.job === undefined ? await questJob(chainId, jobId).catch(() => null) : opts.job
  const url = job?.deliverable?.url ?? null
  const manifest: Manifest | null = await jobManifest(chainId, jobId, job as never)
  const source = (job?.deliverable as { source?: string | null } | undefined)?.source ?? null
  if (!manifest) return { lens: null, checks: [], checkedAtBlock: null, summary: { checked: 0, agreed: 0 }, state: 'no-check', reason: 'the answer file could not be read', attemptedAt: new Date().toISOString(), stored: false, manifest: url ? { matches: null, hash: null, raw: null, url, source } : null, readable: false, terms: null }
  // A file found from the chain hash (no published URL) still links to where it was read.
  void source
  let content: unknown = manifest.content
  if (!content) { try { content = JSON.parse(manifest.raw) } catch { content = null } }
  const category = job?.agent?.category ?? null
  const lens = normalizeAnswer(category, content)
  const block = lens.meta.block && /^\d{6,12}$/.test(lens.meta.block) ? BigInt(lens.meta.block) : null
  const manifestView = { matches: manifest.matches, hash: manifest.hash, raw: manifest.source==='submission_calldata' ? manifest.raw : manifest.pretty || manifest.raw, url:manifest.url ?? url, source:manifest.source ?? source, hashAlgorithm:manifest.hashAlgorithm ?? 'keccak256' as const }
  const attemptedAt = new Date().toISOString()
  // The job's terms as recorded: Marque's intent (hires started here) or the escrow's own description.
  const [hi] = (await db().execute(sql`select i.description from commerce_job j join hire_intent i on i.id = j.intent_id where j.chain_id = ${chainId} and j.job_id = ${jobId} limit 1`).catch(() => [])) as unknown as Array<{ description: string | null }>
  const intentDescription = hi?.description ?? (job?.intent as { description?: string } | null)?.description ?? null
  const onchain = await onchainJobTask(chainId, jobId)
  const description = onchain?.description ?? intentDescription
  // A decided result never changes: read it before recomputing anything.
  const [kept] = (await db().execute(sql`select block, checks, summary, computed_at from lens_result where chain_id = ${chainId} and job_id = ${jobId} limit 1`).catch(() => [])) as unknown as Array<{ block: string | null; checks: LensCheck[]; summary: { checked: number; agreed: number }; computed_at: string }>
  if (kept && !opts.replay) {
    return { lens, checks: kept.checks, checkedAtBlock: kept.block, summary: kept.summary, state: 'decided', reason: null, attemptedAt: new Date(kept.computed_at).toISOString(), stored: true, manifest: manifestView, readable: lens.kind !== 'generic', terms: termsOf(description, category, kept.checks) }
  }
  // The buyer's words: the hire intent's signed description (hires started on Marque), else the job's own description
  // on chain, which every ERC-8183 job carries.
  const fromIntent = (() => { const d = intentDescription; if (!d) return null; try { return String((JSON.parse(d) as { task?: string }).task ?? '') } catch { return d } })()
  const task = fromIntent || onchain?.task || null
  // The checks read BSC mainnet state: practice jobs ask about mainnet accounts and pools too.
  const checks = await checksFor(lens, task, block)
  const decided = checks.filter((c) => c.state !== 'unavailable')
  const summary = { checked: decided.length, agreed: decided.filter((c) => c.state === 'match' || c.state === 'holds').length }
  const state: JobLens['state'] = decided.length ? 'decided' : checks.length ? 'unavailable' : 'no-check'
  const reason = state !== 'no-check' ? null : missingInput(lens, task)
  // Keep the first fully decided result for good; a partial or failed read is recomputed next time.
  let stored = false
  if (state === 'decided' && decided.length === checks.length && !opts.replay) {
    await db().execute(sql`insert into lens_result (chain_id, job_id, block, checks, summary) values (${chainId}, ${jobId}, ${block ? block.toString() : null}, ${JSON.stringify(checks)}::jsonb, ${JSON.stringify(summary)}::jsonb) on conflict do nothing`).then(() => { stored = true }).catch(() => undefined)
  }
  return {
    lens, checks, checkedAtBlock: block ? block.toString() : null, summary, state, reason, attemptedAt, stored,
    manifest: manifestView,
    readable: lens.kind !== 'generic',
    terms: termsOf(description, category, checks),
  }
}

/** Why no check ran, in the buyer's words. */
function missingInput(lens: Lens, task: string | null): string {
  if (lens.kind === 'health_factor') {
    if (lens.healthFactor === null) return lens.hasPosition === false ? 'the agent reports no borrowing on this account, so there is no health factor to check' : 'the answer gives no health factor'
    const account = (lens.account && ADDR.test(lens.account)) || (task && ADDR.test(task))
    if (!account) return 'neither the answer nor the job names the account to check'
  }
  if (lens.kind === 'rebalancing') return 'the answer names no position Marque can read'
  if (lens.kind === 'yield') return lens.observedApys?.length ? 'quoted APYs are shown separately; no comparable Venus APR was provided for the rate check' : 'the answer names no Venus rate Marque can compare'
  if (lens.kind === 'grid') return 'the answer states no levels or capital to check'
  return 'Marque has no check for this kind of answer yet'
}

/** Cached 10 minutes per job: a delivered answer does not change; checks are pinned to its block. */
export function jobLens(chainId: ChainId, jobId: string, job?: ReadJob) {
  return cachedProjection(`lens:v9:${chainId}:${jobId}`, () => build(chainId, jobId, { job }), { freshMs: 10 * 60_000, timeoutMs: 20_000 })
}

/** Recompute a job's checks and terms from chain now, ignoring and never writing the stored result (the replay command). */
export function replayLens(chainId: ChainId, jobId: string): Promise<JobLens> {
  return build(chainId, jobId, { replay: true })
}
