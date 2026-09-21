/** Submit harmless, read-only tasks to exact external services found in BSC ERC-8004. */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { A2AExecutor, McpExecutor, type StructuredTask } from '@marque/execution'

const subject = '0x0000000000000000000000000000000000000001'
const base = { chainId: 56 as const, blockNumber: '123046270', subject, maxSpendUsd: 0.01 }
const tasks: Record<StructuredTask['kind'], StructuredTask> = {
  yield: { ...base, kind: 'yield', policy: {
    asset: 'USDT', sizeUsd: 100, allowedProtocols: ['Venus', 'PancakeSwap'],
    minImprovementBps: 25, leverageAllowed: false, currentAprPct: 0,
  } },
  grid: { ...base, kind: 'grid', pair: 'BNB/USDT', policy: {
    lowerBound: 500, upperBound: 700, capitalUsd: 100, levels: 5,
    stopPrice: 450, feeBps: 25,
  } },
  rebalance: { ...base, kind: 'rebalance', positionTokenId: '1', policy: {
    rangePct: 5, feeTier: 2500, maxSlippageBps: 50,
  } },
  health_factor: { ...base, kind: 'health_factor', policy: { targetHealthFactor: 2 } },
}

const attempts = [
  { agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:2468', serviceId: 40580,
    name: 'ClawdMint', owner: '0x75b583c518215e272f3c0a3bcc1b27012f294adc', kind: 'a2a' as const,
    endpoint: 'https://clawdmint-api.vercel.app/.well-known/agent-card.json', task: tasks.yield },
  { agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:152313', serviceId: 29792,
    name: 'FrostForge', owner: '0x0a5b165dc464d947e035abf1cc90e526731ef4a2', kind: 'a2a' as const,
    endpoint: 'https://app.singularry.org/agents/237/agent-card.json', task: tasks.grid },
  { agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:2146', serviceId: 31179,
    name: 'CryptoX by Unibase', owner: '0xd7fa5db858a22927c6535fc1647e5b226b6968ad', kind: 'a2a' as const,
    endpoint: 'https://bitagent.s3.ap-southeast-1.amazonaws.com/0xD7Fa5dB858a22927C6535FC1647e5b226b6968Ad/.well-known/agent-card.json', task: tasks.yield },
  { agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:2468', serviceId: 40581,
    name: 'ClawdMint', owner: '0x75b583c518215e272f3c0a3bcc1b27012f294adc', kind: 'mcp' as const,
    endpoint: 'https://clawdmint-api.vercel.app/mcp', task: tasks.yield },
  { agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:113284', serviceId: 30666,
    name: 'Topaz Agent', owner: '0x9e9a1513ed6b0f0d3305a87a6aca5c815ad949d6', kind: 'mcp' as const,
    endpoint: 'https://agents.topazdex.com/mcp', task: tasks.yield },
  { agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:49467', serviceId: 30780,
    name: 'Brain On BNB AI', owner: '0x15ba17075ef5e0736292b030e3715d9100fe3d38', kind: 'mcp' as const,
    endpoint: 'https://brainonbnb.com/mcp', task: tasks.yield },
  { agentId: '56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:43129', serviceId: 30963,
    name: 'Venus powered by HeyAnon', owner: '0xda977767452c5dd021624511f14df67b6c9c2c1b', kind: 'mcp' as const,
    endpoint: 'https://erc8004.heyanon.ai/mcp/venus', task: tasks.health_factor },
]

const results = []
for (const attempt of attempts) {
  const executor = attempt.kind === 'a2a'
    ? new A2AExecutor(attempt.agentId, attempt.endpoint, attempt.name)
    : new McpExecutor(attempt.agentId, attempt.endpoint, attempt.name)
  const measuredAt = new Date().toISOString()
  try {
    const inspect = await executor.inspect()
    const quote = await executor.quote(attempt.task)
    const execution = await executor.execute(attempt.task, {
      buyer: subject, maxSpendUsd: 0.01, allowlist: [], deadlineMs: 45_000,
    })
    results.push({ ...attempt, measuredAt, inspect, quote, execution })
  } catch (error) {
    results.push({ ...attempt, measuredAt, harnessError: error instanceof Error ? error.message : String(error) })
  }
}

const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')
const outputDir = resolve('docs/evidence/third-party/task-attempts')
await mkdir(outputDir, { recursive: true })
const output = resolve(outputDir, `${stamp}.json`)
await writeFile(output, `${JSON.stringify({
  evidence_type: 'real-external-read-only-task-attempts', generated_at: new Date().toISOString(),
  source_chain_id: 56, production_database_mutated: false, financial_transaction_submitted: false,
  attempts: results,
}, null, 2)}\n`, { flag: 'wx' })

console.log(JSON.stringify({ output, attempts: results.map((r) => ({
  agentId: r.agentId, serviceId: r.serviceId, kind: r.kind,
  quote: 'quote' in r ? { ok: r.quote.ok, status: r.quote.status, detail: r.quote.detail } : null,
  execution: 'execution' in r ? { ok: r.execution.ok, reason: r.execution.reason, detail: r.execution.detail,
    latencyMs: r.execution.latencyMs } : null,
  harnessError: 'harnessError' in r ? r.harnessError : null,
})) }, null, 2))
