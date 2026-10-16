import { RECEIPT_DIGEST_CONTRACT, verifyReceiptIntegrity, type Receipt } from '@marque/execution'

/** A read-only projection, outside the immutable receipt's digest domain. */
export function receiptEvidence(row: {
  hash: string
  body: Record<string, unknown>
  anchorTxHash: string | null
  anchorBlock: string | null
}) {
  const integrity = verifyReceiptIntegrity(row.body, row.hash)
  const receipt = integrity.computedHash ? row.body as unknown as Receipt : null
  return {
    version: 1,
    source: 'stored_receipt_projection',
    digest: { ...RECEIPT_DIGEST_CONTRACT, ...integrity },
    execution: {
      source: 'receipt_claim',
      chainId: receipt?.execution.chainId ?? null,
      blockNumber: receipt?.execution.blockNumber ?? null,
      blockHash: null,
      txHashes: receipt?.execution.txHashes ?? [],
      observedAt: receipt?.execution.finishedAt ?? null,
      verification: 'NOT_CHECKED',
    },
    quality: {
      source: 'receipt_claim',
      testId: receipt?.quality.testId ?? null,
      testVersion: receipt?.quality.testVersion ?? null,
      toleranceRevision: receipt?.quality.toleranceRevision ?? null,
      caseId: receipt?.quality.caseId ?? null,
      groundTruthHash: receipt?.quality.groundTruthHash ?? null,
      groundTruthDigestContract: 'marque-sorted-json-v1/SHA-256/no-prefix',
      freshness: 'NOT_CHECKED',
      verification: 'NOT_CHECKED',
    },
    artifact: {
      source: 'stored_receipt_json',
      pointer: '/receipt/agentResponse',
      rawArtifactDigest: null,
      verification: 'ORIGINAL_TRANSPORT_BYTES_UNAVAILABLE',
    },
    anchor: {
      source: 'stored_anchor_reference',
      // Historical rows have no anchor chain/contract/block hash. Never copy
      // the execution chain or today's deployment configuration into this proof.
      chainId: null,
      contract: null,
      txHash: row.anchorTxHash,
      blockNumber: row.anchorBlock,
      blockHash: null,
      verification: 'NOT_CHECKED',
    },
    independence: 'UNKNOWN',
    limitations: [
      'A digest match checks content integrity, not issuer identity or claim truth.',
      'Payment release, execution, authority and quality require their own evidence.',
      'Recorded times and block numbers do not establish current freshness or finality.',
      'URLs are references; their current response bytes have not been fetched or verified.',
    ],
  }
}
