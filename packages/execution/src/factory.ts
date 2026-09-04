import { A2AExecutor } from './executors/a2a.js'
import { McpExecutor } from './executors/mcp.js'
import { X402Executor } from './executors/x402.js'
import type { AgentExecutor } from './types.js'

/**
 * Pick an executor for a service kind.
 *
 * `termix` maps to A2AExecutor with no special casing. TermiX-registered agents
 * speak standard A2A; the only TermiX-specific thing is metadata normalisation,
 * which happens during ingest in packages/registry. A TermixExecutor would be
 * sponsor plumbing pretending to be architecture.
 *
 * ERC-8183 is absent here on purpose: it needs a kernel address, so it is
 * constructed explicitly rather than guessed from a service row.
 */
export function executorFor(
  kind: string,
  agentId: string,
  endpoint: string,
  name: string | null = null,
): AgentExecutor | null {
  switch (kind) {
    case 'a2a':
    case 'termix':
      return new A2AExecutor(agentId, endpoint, name)
    case 'mcp':
      return new McpExecutor(agentId, endpoint, name)
    case 'x402':
      return new X402Executor(agentId, endpoint, name)
    default:
      // REST and web endpoints expose no task interface we can address
      // generically, and inventing one would produce meaningless results.
      return null
  }
}
