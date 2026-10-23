import { analyse } from './strategy.js'
import { reader } from './chain.js'
import { parseTask } from './task.js'

/**
 * Glue for the BNB Agent Studio seller (DEPLOY.md). Studio owns quoting, signing and submitting;
 * call validate() before signing a quote, and deliver() in the delivery step in place of model work.
 */
export function validate(taskText: string): { ok: true } | { ok: false; reason: string } {
  const p = parseTask(taskText)
  return p.ok ? { ok: true } : { ok: false, reason: p.reason }
}

/** The deliverable: JSON text, hashed and recorded on chain by the seller. */
export async function deliver(taskText: string): Promise<string> {
  const p = parseTask(taskText)
  if (!p.ok) return JSON.stringify({ error: p.reason })
  const report = await analyse(p.task, reader(p.task.blockNumber))
  return JSON.stringify(report)
}
