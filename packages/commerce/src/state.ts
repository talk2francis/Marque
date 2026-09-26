/**
 * The ERC-8183 job state machine (SPEC-COMMERCE 6), as a pure projection of on-chain
 * events. The UI never keeps its own idea of where a job is: it renders this.
 *
 *   OPEN ── reject ──▶ CANCELLED
 *    │ registerJob / setBudget (either order; flags)
 *    ▼ fund
 *   FUNDED ── expiry, no delivery ──▶ EXPIRED ── claimRefund ──▶ REFUNDED
 *    │ submit
 *    ▼
 *   SUBMITTED ── dispute ──▶ DISPUTED ── settle(reject) ──▶ REJECTED ──▶ REFUNDED
 *    │ window passes, settle
 *    ▼
 *   COMPLETED ──▶ PAID (PaymentReleased)
 */
export type JobState =
  | 'OPEN' | 'FUNDED' | 'SUBMITTED' | 'DISPUTED' | 'COMPLETED' | 'PAID'
  | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'REFUNDED'

export type JobEventName =
  | 'JobCreated' | 'JobRegistered' | 'BudgetSet' | 'JobPaymentTokenBound' | 'JobFunded' | 'JobSubmitted'
  | 'Disputed' | 'JobSettled' | 'JobCompleted' | 'PaymentReleased' | 'JobRejected' | 'JobExpired' | 'Refunded'

export interface JobEvent {
  name: JobEventName
  blockNumber: number
  logIndex: number
  txHash: string
  blockTime?: string | null
  args: Record<string, unknown>
}

export interface JobProjection {
  state: JobState
  registered: boolean
  budgetSet: boolean
  client: string | null
  provider: string | null
  evaluator: string | null
  hook: string | null
  expiredAt: number | null
  budgetRaw: string | null
  fundedRaw: string | null
  token: string | null
  deliverable: string | null
  paidRaw: string | null
  refundedRaw: string | null
  tx: Partial<Record<'created' | 'registered' | 'budgetSet' | 'funded' | 'submitted' | 'disputed' | 'settled' | 'completed' | 'paymentReleased' | 'rejected' | 'expired' | 'refunded', string>>
  times: Partial<Record<'created' | 'funded' | 'submitted' | 'completed' | 'refunded', string | null>>
  /** Events that arrived in a state that does not allow them; kept, never silently dropped. */
  anomalies: string[]
  createdBlock: number | null
  updatedBlock: number | null
}

/** Terminal states: nothing further can happen to the escrowed funds. */
export const TERMINAL: ReadonlySet<JobState> = new Set(['CANCELLED', 'PAID', 'REFUNDED'])

/** Allowed state for each event (the state it moves the job to, from each legal predecessor). */
const TRANSITIONS: Record<JobEventName, Partial<Record<JobState | 'NONE', JobState>>> = {
  JobCreated: { NONE: 'OPEN' },
  JobRegistered: { OPEN: 'OPEN' },
  BudgetSet: { OPEN: 'OPEN' },
  JobPaymentTokenBound: { NONE: 'OPEN', OPEN: 'OPEN' },
  JobFunded: { OPEN: 'FUNDED' },
  JobSubmitted: { FUNDED: 'SUBMITTED' },
  Disputed: { SUBMITTED: 'DISPUTED' },
  JobSettled: { SUBMITTED: 'SUBMITTED', DISPUTED: 'DISPUTED' },
  JobCompleted: { SUBMITTED: 'COMPLETED', DISPUTED: 'COMPLETED' },
  PaymentReleased: { COMPLETED: 'PAID' },
  JobRejected: { OPEN: 'CANCELLED', FUNDED: 'REJECTED', SUBMITTED: 'REJECTED', DISPUTED: 'REJECTED' },
  JobExpired: { FUNDED: 'EXPIRED', SUBMITTED: 'EXPIRED' },
  Refunded: { REJECTED: 'REFUNDED', EXPIRED: 'REFUNDED', FUNDED: 'REFUNDED' },
}

const str = (v: unknown): string | null => (v === undefined || v === null ? null : typeof v === 'bigint' ? v.toString() : String(v))

export function projectJob(events: readonly JobEvent[]): JobProjection {
  const p: JobProjection = {
    state: 'OPEN', registered: false, budgetSet: false, client: null, provider: null, evaluator: null, hook: null,
    expiredAt: null, budgetRaw: null, fundedRaw: null, token: null, deliverable: null, paidRaw: null, refundedRaw: null,
    tx: {}, times: {}, anomalies: [], createdBlock: null, updatedBlock: null,
  }
  let current: JobState | 'NONE' = 'NONE'
  const sorted = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  for (const e of sorted) {
    const next: JobState | undefined = TRANSITIONS[e.name]?.[current]
    if (next === undefined) {
      p.anomalies.push(`${e.name} in ${current} (tx ${e.txHash})`)
      continue
    }
    current = next
    p.updatedBlock = e.blockNumber
    const a = e.args
    switch (e.name) {
      case 'JobCreated':
        p.client = str(a['client']); p.provider = str(a['provider']); p.evaluator = str(a['evaluator']); p.hook = str(a['hook'])
        p.expiredAt = a['expiredAt'] == null ? null : Number(a['expiredAt'])
        p.tx.created = e.txHash; p.times.created = e.blockTime ?? null; p.createdBlock = e.blockNumber
        break
      case 'JobPaymentTokenBound': p.token = str(a['token']); break
      case 'JobRegistered': p.registered = true; p.tx.registered = e.txHash; break
      case 'BudgetSet': p.budgetSet = true; p.budgetRaw = str(a['amount']); p.tx.budgetSet = e.txHash; break
      case 'JobFunded': p.fundedRaw = str(a['amount']); p.tx.funded = e.txHash; p.times.funded = e.blockTime ?? null; break
      case 'JobSubmitted': p.deliverable = str(a['deliverable']); p.tx.submitted = e.txHash; p.times.submitted = e.blockTime ?? null; break
      case 'Disputed': p.tx.disputed = e.txHash; break
      case 'JobSettled': p.tx.settled = e.txHash; break
      case 'JobCompleted': p.tx.completed = e.txHash; p.times.completed = e.blockTime ?? null; break
      case 'PaymentReleased': p.paidRaw = str(a['amount']); p.tx.paymentReleased = e.txHash; break
      case 'JobRejected': p.tx.rejected = e.txHash; break
      case 'JobExpired': p.tx.expired = e.txHash; break
      case 'Refunded': p.refundedRaw = str(a['amount']); p.tx.refunded = e.txHash; p.times.refunded = e.blockTime ?? null; break
    }
  }
  p.state = current === 'NONE' ? 'OPEN' : current
  return p
}

/** Where a funded job stands against the clock (used by the Job Room and the keeper). */
export function timeline(p: Pick<JobProjection, 'state' | 'expiredAt'>, submittedAtSeconds: number | null, disputeWindowSeconds: number, nowSeconds: number) {
  const submitDeadline = p.expiredAt === null ? null : p.expiredAt - disputeWindowSeconds
  const refundFrom = p.expiredAt
  const reviewEndsAt = submittedAtSeconds === null ? null : submittedAtSeconds + disputeWindowSeconds
  return {
    submitDeadline,
    refundFrom,
    reviewEndsAt,
    /** Funded, and the agent can no longer deliver in time. */
    awaitingExpiry: p.state === 'FUNDED' && submitDeadline !== null && nowSeconds > submitDeadline,
    refundable: (p.state === 'FUNDED' || p.state === 'EXPIRED') && refundFrom !== null && nowSeconds >= refundFrom,
    settleable: (p.state === 'SUBMITTED') && reviewEndsAt !== null && nowSeconds >= reviewEndsAt,
    disputable: p.state === 'SUBMITTED' && reviewEndsAt !== null && nowSeconds < reviewEndsAt,
    cancellable: p.state === 'OPEN',
  }
}

/** The quest-level meaning of a job state (SPEC-TRACKING 2). */
export const DELIVERED: ReadonlySet<JobState> = new Set(['SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID'])
export const FUNDED_OR_LATER: ReadonlySet<JobState> = new Set(['FUNDED', 'SUBMITTED', 'DISPUTED', 'COMPLETED', 'PAID', 'REJECTED', 'EXPIRED', 'REFUNDED'])
