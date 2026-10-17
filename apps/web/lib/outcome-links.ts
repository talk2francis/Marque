import { z } from 'zod'

const reference = z.object({
  id: z.number().int().positive(), benchmarkId: z.string().max(200),
  jobId: z.string().regex(/^\d{1,30}$/).nullable(), chainId: z.union([z.literal(56), z.literal(97)]).nullable(),
  receiptId: z.string().uuid().nullable(), block: z.string().regex(/^\d{1,30}$/), at: z.string().datetime(),
}).strict()

/** Reference metadata only. Equal agent names, task text or a receipt hash anchor
 * do not join independently recorded Ledger and paid-job observations. */
export function ledgerOutcomeReferences(rows: readonly unknown[], computedAt: string) {
  const parsed = rows.slice(0, 200).map(r => reference.safeParse(r))
  const records = parsed.flatMap(p => p.success ? [{ ...p.data,
    state: p.data.jobId !== null || p.data.receiptId !== null ? 'EXPLICIT_REFERENCE_UNVERIFIED' as const : 'UNAVAILABLE' as const,
    jobUrl: p.data.jobId !== null && p.data.chainId !== null ? `/jobs/${p.data.chainId}/${p.data.jobId}` : null,
    receiptUrl: p.data.receiptId !== null ? `/receipts/${p.data.receiptId}` : null,
    linkVerification: 'NOT_PERFORMED' as const, prePostMeasurement: 'UNKNOWN' as const,
    blockContext: p.data.block === '0' ? 'NOT_RECORDED' as const : 'RECORDED_NOT_RECHECKED' as const,
  }] : [])
  return {
    schema: 'marque.ledger-outcome-references.v1' as const, computedAt,
    provenance: 'STORED_BENCHMARK_REFERENCE_METADATA' as const,
    scope: { returnedRecords: records.length, invalidRecords: parsed.length - records.length, moreAvailable: rows.length > 200, limit: 200 },
    state: records.some(r => r.state === 'EXPLICIT_REFERENCE_UNVERIFIED') ? 'REFERENCES_REQUIRE_VERIFICATION' as const : 'UNAVAILABLE' as const,
    verifiedReceiptLinkedOutcome: null, records,
    rejectedRecords: parsed.flatMap((p,position) => p.success ? [] : [{position, reason:'UNSUPPORTED_REFERENCE_METADATA_PENDING_REVIEW' as const}]),
    independentHumans: null, roi: null, drawdown: null,
    limits: ['No receipt/job linkage is inferred from a matching agent, date, task or anchor.',
      'Explicit references are unverified pointers, not proof of the same task, service or commercial outcome.',
      'Stored block and time describe the original observation. Pre/post uncertainty and financial counterfactuals are unavailable.',
      'Original manifests, rows and earlier sittings remain unchanged.'],
  }
}
