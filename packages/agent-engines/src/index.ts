export * from './types.js'
export { textFromA2ABody, a2aResult, a2aError, marqueCard, engineRunWork } from './serve.js'
export * as parse from './parse.js'
export { boundEngine, BOUND_META } from './bound.js'
export { latticeEngine, LATTICE_META } from './lattice.js'
export { sluicegateEngine, SLUICEGATE_META } from './sluicegate.js'
export { keelEngine, KEEL_META } from './keel.js'
export { redcellEngine, REDCELL_META, SEVERITY_RANK, type Severity, type Finding } from './redcell.js'

import { boundEngine } from './bound.js'
import { latticeEngine } from './lattice.js'
import { sluicegateEngine } from './sluicegate.js'
import { keelEngine } from './keel.js'
import { redcellEngine } from './redcell.js'
import type { Engine } from './types.js'

/** Every Marque reference agent, by id. */
export const ENGINES: Record<string, Engine> = {
  bound: boundEngine,
  lattice: latticeEngine,
  sluicegate: sluicegateEngine,
  keel: keelEngine,
  redcell: redcellEngine,
}

export function engineFor(id: string): Engine | null {
  return ENGINES[id] ?? null
}
