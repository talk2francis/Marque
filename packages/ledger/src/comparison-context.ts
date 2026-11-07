import { comparisonMissing, trustedBlock, type CompletionRun } from './completion.js'
import { hashContent } from './manifest.js'

export interface RegisteredTaskContext {
  task: string
  taskHash: string
  inputHash: string
  rubricHash: string
}

export interface ComparisonTaskRecovery {
  method: 'verified-original-task'
  task: string
  taskHash: string
  block: string
  registrationTask: string
  registrationTaskHash: string
  registrationBlock: string
  runIds: number[]
}

type ContextRun = CompletionRun & { id?: number; blockRecoveryTaskHash?: string | null }

/** Recover only a block-only registration drift, with the original comparison fully verified. */
export function recoverComparisonTask(
  registered: RegisteredTaskContext,
  runs: readonly ContextRun[],
  makeTask: (context: { block: string }) => string,
): ComparisonTaskRecovery | null {
  const hashes = new Set(runs.map(run => run.manifest['task_hash']))
  if (hashes.size !== 1) return null
  const originalHash = [...hashes][0]
  if (typeof originalHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(originalHash) || originalHash === registered.taskHash) return null
  const blocks = new Set(runs.map(trustedBlock))
  if (blocks.size !== 1) return null
  const block = [...blocks][0]
  if (!block || !/^[1-9]\d*$/.test(block)) return null
  if (runs.some(run => run.blockRecovered && run.blockRecoveryTaskHash !== originalHash)) return null
  if (comparisonMissing({ ...registered, taskHash: originalHash }, runs).length) return null
  const registrationBlocks = [...new Set([...registered.task.matchAll(/Block:\s*(\d+)/gi)].map(match => match[1]!))]
  if (registrationBlocks.length !== 1) return null
  const registrationBlock = registrationBlocks[0]!
  try {
    if (makeTask({ block: registrationBlock }) !== registered.task || hashContent(registered.task) !== registered.taskHash) return null
    const task = makeTask({ block })
    if (hashContent(task) !== originalHash) return null
    return { method: 'verified-original-task', task, taskHash: originalHash, block,
      registrationTask: registered.task, registrationTaskHash: registered.taskHash, registrationBlock,
      runIds: runs.flatMap(run => typeof run.id === 'number' ? [run.id] : []).sort((a, b) => a - b) }
  } catch { return null }
}
