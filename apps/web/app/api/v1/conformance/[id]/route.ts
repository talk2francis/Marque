import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, conformanceResult } from '@marque/db'
import { warrantRecordMetadata } from '@marque/conformance'
import { withDeadline } from '../../../../../lib/deadline'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }

/** Public commitment reference, not a raw task/response disclosure or a chain verifier. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2_147_483_647) return NextResponse.json({ error: 'invalid_result_id' }, { status: 400, headers })
  try {
    const [r] = await withDeadline(db().select({
      id: conformanceResult.id, agentId: conformanceResult.agentId,
      testId: conformanceResult.testId, testVersion: conformanceResult.testVersion,
      toleranceRevision: conformanceResult.toleranceRevision, caseId: conformanceResult.caseId,
      chainId: conformanceResult.chainId, blockNumber: conformanceResult.blockNumber,
      pass: conformanceResult.pass, request: conformanceResult.request,
      requestHash: conformanceResult.requestHash, responseHash: conformanceResult.responseHash,
      ranAt: conformanceResult.ranAt,
    }).from(conformanceResult).where(eq(conformanceResult.id, Number(id))).limit(1), 8000)
    if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404, headers })
    return NextResponse.json({
      version: 1, id: r.id, source: 'first_party_conformance_record',
      agentId: r.agentId, testId: r.testId, testVersion: r.testVersion,
      toleranceRevision: r.toleranceRevision, caseId: r.caseId,
      inputChainId: r.chainId, inputBlockNumber: r.blockNumber,
      recordedPass: r.pass, observedAt: r.ranAt, sampleSize: 1,
      requestHash: r.requestHash, responseHash: r.responseHash,
      commitments: warrantRecordMetadata(r.request, r.requestHash, r.agentId),
      replay: 'NOT_PERFORMED', independence: 'UNKNOWN', payment: 'NOT_CLAIMED',
      bundle: null, limitations: ['Raw input/output content is not disclosed by this GET. Obtain a portable bundle from its owner.', 'A recorded test pass alone is not an exact-service Warrant, guarantee or paid settlement.'],
    }, { headers })
  } catch {
    return NextResponse.json({ error: 'conformance_unavailable', detail: 'The stored commitment could not be read. Retry later.' }, { status: 503, headers })
  }
}
