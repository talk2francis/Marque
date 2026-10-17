import { stableHash } from './hash.js'
import type { TestCase } from './types.js'

export function caseCommitment(testCase: TestCase, groundTruthHash: string): string {
  return stableHash({
    id: testCase.id, testId: testCase.testId, category: testCase.category,
    chainId: testCase.chainId, blockNumber: testCase.blockNumber.toString(),
    subject: testCase.subject, policy: testCase.policy, prompt: testCase.prompt,
    groundTruthHash,
  })
}
