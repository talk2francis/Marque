import type { StructuredTask } from './tasks.js'

/** Stable machine reasons shared by Marketplace, profiles, Charter and runs. */
export const CAPABILITY_REASONS = [
  'NOT_REGISTERED',
  'METADATA_UNREADABLE',
  'NO_SERVICE',
  'PROBE_MISSING',
  'PROBE_STALE',
  'ENDPOINT_UNREACHABLE',
  'NO_EXECUTABLE_INTERFACE',
  'A2A_CARD_INVALID',
  'A2A_TASK_ENDPOINT_UNRESOLVED',
  'MCP_INITIALIZE_FAILED',
  'MCP_NO_TOOLS',
  'MCP_SCHEMA_UNSUPPORTED',
  'CATEGORY_UNSUPPORTED',
  'TASK_CAPABILITY_UNVERIFIED',
  'MCS_FAILED',
  'MCS_STALE',
  'QUOTE_UNSUPPORTED',
  'PRICE_UNKNOWN',
  'AUTHORIZATION_UNAVAILABLE',
  'EXECUTION_UNVERIFIED',
] as const

export type CapabilityReason = (typeof CAPABILITY_REASONS)[number]
export type ExecutableProtocol = 'a2a' | 'mcp' | 'x402' | 'erc8183'
export type TaskKind = StructuredTask['kind']

export interface ServiceCapabilityEvidence {
  serviceId: number
  agentId: string
  protocol: string
  discoveryEndpoint: string
  executableEndpoint: string | null
  probeId: number | null
  probedAt: string | null
  liveness: string | null
  failureClass: string | null
  /** Normalized task kinds proven discoverable for this exact service. */
  taskKinds: TaskKind[]
  /** Protocol-specific immutable discovery evidence, e.g. A2A skills/MCP tools. */
  manifest: Record<string, unknown> | null
}

export interface QualificationEvidence {
  testId: string
  passed: boolean
  measuredAt: string
  stale: boolean
}

export interface CanonicalAgentState {
  agentId: string
  registered: boolean
  metadataReadable: boolean
  serviceDeclared: boolean
  reachable: boolean
  callable: boolean
  compatible: boolean
  category: string | null
  qualified: boolean
  previewable: boolean
  quoteable: boolean
  hireable: boolean
  authorizable: boolean
  executable: boolean
  settleable: boolean
  selectedService: ServiceCapabilityEvidence | null
  qualification: QualificationEvidence | null
  reasons: CapabilityReason[]
}

export interface EvaluateAgentInput {
  agentId: string
  registered: boolean
  metadataReadable: boolean
  category: string | null
  requestedTask: TaskKind | null
  services: ServiceCapabilityEvidence[]
  qualification: QualificationEvidence | null
  /** Whether Marque has an explicit Charter template for this task/category. */
  authorizable: boolean
  /** Whether the selected protocol has a real quote operation. */
  quoteableProtocols?: readonly ExecutableProtocol[]
  /** Whether payment/settlement is implemented for the selected service. */
  settleableServiceIds?: readonly number[]
  now?: Date
  maxProbeAgeMs?: number
}

const EXECUTABLE = new Set<string>(['a2a', 'mcp', 'x402', 'erc8183'])

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

/**
 * Derive every product state from the same service-scoped evidence.
 *
 * No state implies the next one. In particular, qualification never repairs a
 * dead service and reachability never proves task compatibility.
 */
export function evaluateAgentState(input: EvaluateAgentInput): CanonicalAgentState {
  const now = input.now ?? new Date()
  // The production worker covers tens of thousands of declared services in a
  // bounded, polite cycle. Twenty-four hours is the published freshness SLA;
  // anything older remains historical evidence but cannot enable Hire.
  const maxAge = input.maxProbeAgeMs ?? 24 * 60 * 60_000
  const reasons: CapabilityReason[] = []

  if (!input.registered) reasons.push('NOT_REGISTERED')
  if (!input.metadataReadable) reasons.push('METADATA_UNREADABLE')
  if (input.services.length === 0) reasons.push('NO_SERVICE')

  const fresh = input.services.filter((service) => {
    if (!service.probedAt) return false
    const at = Date.parse(service.probedAt)
    return Number.isFinite(at) && now.getTime() - at <= maxAge
  })
  if (input.services.length > 0 && input.services.every((s) => !s.probedAt)) reasons.push('PROBE_MISSING')
  if (input.services.some((s) => s.probedAt) && fresh.length === 0) reasons.push('PROBE_STALE')

  const reachableServices = fresh.filter((s) => ['live', 'unbound', 'bad_schema'].includes(s.liveness ?? ''))
  if (fresh.length > 0 && reachableServices.length === 0) reasons.push('ENDPOINT_UNREACHABLE')

  const callableServices = fresh.filter((s) =>
    s.liveness === 'live' && EXECUTABLE.has(s.protocol) && s.executableEndpoint !== null,
  )
  if (reachableServices.length > 0 && callableServices.length === 0) reasons.push('NO_EXECUTABLE_INTERFACE')

  const compatibleServices = input.requestedTask === null
    ? callableServices
    : callableServices.filter((s) => s.taskKinds.includes(input.requestedTask as TaskKind))
  if (callableServices.length > 0 && input.requestedTask !== null && compatibleServices.length === 0) {
    reasons.push('TASK_CAPABILITY_UNVERIFIED')
  }

  // Stable preference: exact compatibility, newest proof, then service id.
  const selectedService = [...compatibleServices].sort((a, b) => {
    const byTime = Date.parse(b.probedAt ?? '') - Date.parse(a.probedAt ?? '')
    return byTime || a.serviceId - b.serviceId
  })[0] ?? null

  const qualification = input.qualification
  if (qualification && !qualification.passed) reasons.push('MCS_FAILED')
  if (qualification?.stale) reasons.push('MCS_STALE')
  const qualified = qualification?.passed === true && !qualification.stale

  if (!input.authorizable) reasons.push('CATEGORY_UNSUPPORTED')
  const authorizable = input.authorizable && selectedService !== null
  if (selectedService && !authorizable) reasons.push('AUTHORIZATION_UNAVAILABLE')

  const quoteable = selectedService !== null
    && (input.quoteableProtocols ?? []).includes(selectedService.protocol as ExecutableProtocol)
  if (selectedService && !quoteable) {
    reasons.push('QUOTE_UNSUPPORTED')
    reasons.push('PRICE_UNKNOWN')
  }

  const settleable = selectedService !== null
    && (input.settleableServiceIds ?? []).includes(selectedService.serviceId)

  return {
    agentId: input.agentId,
    registered: input.registered,
    metadataReadable: input.metadataReadable,
    serviceDeclared: input.services.length > 0,
    reachable: reachableServices.length > 0,
    callable: callableServices.length > 0,
    compatible: selectedService !== null,
    category: input.category,
    qualified,
    // Preview is an execution operation, not a link to an explanatory anchor.
    previewable: selectedService !== null && selectedService.manifest !== null,
    quoteable,
    // Hiring requires exact task compatibility and enforceable authority. It
    // does not require MCS qualification or a known price.
    hireable: selectedService !== null && authorizable,
    authorizable,
    executable: selectedService !== null,
    settleable,
    selectedService,
    qualification,
    reasons: unique(reasons),
  }
}
