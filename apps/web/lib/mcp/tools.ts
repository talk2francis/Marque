import 'server-only'
import { checkAgent, isSupportedChain, network, type ChainId } from '@marque/commerce'
import { classifyByKeyword } from '@marque/registry'
import { referenceAgent } from '../reference-agents'
import { storefrontByToken } from '../storefront'
import { fieldsFromText } from '../task-parse'
import { sealHeld } from '../held-quote'

/**
 * Marque for agents (SPEC-ACCESS 3, invariant 40): eleven tools over Marque's own public APIs. Read and plan only:
 * no private key, no signing, every agent call through the same safeFetch paths the website uses. Every result says
 * its source, its block or observation time, and its network.
 */
export interface Ctx { origin: string; self: string; clientIp: string }
type Json = Record<string, unknown>
export interface ToolDef { name: string; title: string; description: string; inputSchema: Json; run: (args: Json, ctx: Ctx) => Promise<Json> }

const LANE = { type: 'string', enum: ['mainnet', 'practice'], description: 'mainnet (BSC 56, real tokens) or practice (BSC testnet 97, test tokens). Never mixed.' }
const AGENT = { type: 'string', description: 'An agent: "56:12345" (chain:token), a token id on BSC mainnet, or a Marque reference slug such as "keel".' }
const CATEGORY = { type: 'string', enum: ['health_factor', 'yield', 'grid', 'rebalancing', 'security'] }
const netOf = (c: number) => (c === 97 ? 'BSC testnet (97)' : 'BSC mainnet (56)')
export class ToolError extends Error {}

async function api(ctx: Ctx, path: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; json: Json }> {
  const r = await fetch(`${ctx.self}${path}`, {
    method: init?.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ctx.clientIp, 'x-marque-source': 'mcp' },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(60_000),
  })
  const json = (await r.json().catch(() => ({}))) as Json
  return { status: r.status, json }
}
const fail = (j: Json, fallback: string) => { throw new ToolError(String(j['detail'] ?? j['error'] ?? fallback)) }

/** "keel" | "56:123" | "123" | a full agent id -> { chainId, tokenId, agentId }. */
async function resolveAgent(a: string): Promise<{ chainId: ChainId; tokenId: string; agentId: string }> {
  const s = a.trim()
  const ref = referenceAgent(s.toLowerCase())
  let chainId: ChainId = 56, tokenId: string
  if (ref) tokenId = String(ref.erc8004.tokenId)
  else if (/^(56|97):\d{1,12}$/.test(s)) { chainId = Number(s.split(':')[0]) as ChainId; tokenId = s.split(':')[1]! }
  else if (/^\d{1,12}$/.test(s)) tokenId = s
  else if (/^(56|97):0x[0-9a-fA-F]{40}:\d{1,12}$/.test(s)) { const [c, , t] = s.split(':'); chainId = Number(c) as ChainId; tokenId = t! }
  else throw new ToolError('Give the agent as "56:<token id>", "97:<token id>" or a reference slug such as "keel".')
  if (!isSupportedChain(chainId)) throw new ToolError('Only BSC mainnet (56) and BSC testnet (97) are listed.')
  return { chainId, tokenId, agentId: `${chainId}:${network(chainId).identityRegistry.toLowerCase()}:${tokenId}` }
}
const profileUrl = (ctx: Ctx, chainId: number, tokenId: string) => `${ctx.origin}/agents/${chainId}/${tokenId}`

export const TOOLS: ToolDef[] = [
  {
    name: 'search_agents', title: 'Search agents',
    description: 'Find BNB Chain agents on Marque by category or task, ranked hireable-first with live price state, Marque test (warrant) and availability.',
    inputSchema: { type: 'object', properties: { category: CATEGORY, task: { type: 'string', description: 'What you need done, in plain words (used to pick a category when none is given).' }, lane: LANE, max_price: { type: 'number', description: 'Live quote at or under this, in the quote token.' }, warranted_only: { type: 'boolean' } }, additionalProperties: false },
    async run(a, ctx) {
      let category = a['category'] as string | undefined
      if (!category && typeof a['task'] === 'string') { const c = classifyByKeyword({ description: a['task'] }).category; if (c !== 'unclassified') category = c }
      const q = new URLSearchParams({ tab: 'all', limit: '10', sort: 'best', lane: (a['lane'] as string) ?? 'mainnet' })
      if (category) q.set('category', category)
      if (typeof a['max_price'] === 'number') q.set('maxPrice', String(a['max_price']))
      if (a['warranted_only'] === true) q.set('warranted', '1')
      const { status, json } = await api(ctx, `/api/v1/marketplace?${q}`)
      if (status !== 200) fail(json, 'The marketplace could not be read.')
      const agents = ((json['agents'] as Json[]) ?? []).map((r) => {
        const c = r['commerce'] as Json, w = r['warrant'] as Json
        const [chain, , token] = String(r['agentId']).split(':')
        return {
          agent: `${chain}:${token}`, name: r['name'], category: r['category'], reference: r['isReference'],
          price: r['price'] ?? null, priceState: c?.['state'] ?? null, quotedAt: c?.['quotedAt'] ?? null,
          warrant: { status: w?.['status'], test: w?.['testId'] ?? null, date: w?.['date'] ?? null },
          availability: { liveness: r['liveness'], lastProbeMs: r['latencyMs'] ?? null }, profile: profileUrl(ctx, Number(chain), String(token)),
        }
      })
      return { network: netOf(json['chainId'] as number), category: category ?? 'all', total: json['total'], observedAt: json['generatedAt'], source: 'Marque marketplace: probes, quotes and conformance results (MEASURED, TESTED)', agents }
    },
  },
  {
    name: 'get_agent', title: 'Get an agent',
    description: 'The facts on an agent page: what it does, current terms, Marque test history summary, delivered jobs, ratings and links.',
    inputSchema: { type: 'object', properties: { agent: AGENT }, required: ['agent'], additionalProperties: false },
    async run(a, ctx) {
      const { chainId, tokenId } = await resolveAgent(String(a['agent']))
      const d = await storefrontByToken(tokenId, chainId)
      if (!d) throw new ToolError(`Marque has not indexed agent ${chainId}:${tokenId}.`)
      const own = d.tests[0] ?? null
      return {
        network: netOf(chainId), agent: `${chainId}:${tokenId}`, name: d.name, category: d.category, reference: d.isReference,
        description: { text: d.description, provenance: 'CLAIMED (written by the operator in the ERC-8004 registry)' },
        terms: { state: d.terms.state, price: d.terms.priceLabel, signed: d.commerce?.signatureEvidence ?? null, reviewWindowSeconds: d.disputeWindowSeconds, permissions: 'Service fee only. No access to the buyer\'s wallet.' },
        test: own ? { testId: own.testId, pass: own.pass, failedFields: own.failedFields, block: own.block, ranAt: own.ranAt, provenance: 'TESTED' } : null,
        track: { delivered: d.track.jobs.delivered, completed: d.track.jobs.settled, refunded: d.track.jobs.refunded, disputed: d.track.jobs.disputed, buyerRating: d.track.verified.averageStars, ratings: d.track.verified.count, provenance: 'ONCHAIN' },
        links: { profile: profileUrl(ctx, chainId, tokenId), evidence: `${profileUrl(ctx, chainId, tokenId)}/evidence`, hire: `${ctx.origin}/register?hire=${encodeURIComponent(d.agentId)}` },
        observedAt: new Date().toISOString(),
      }
    },
  },
  {
    name: 'get_quote', title: 'Get a quote',
    description: 'Ask one agent for a fresh price on a task. Returns price, token, signed or identity-checked, and expiry. Binds nobody.',
    inputSchema: { type: 'object', properties: { agent: AGENT, task: { type: 'string', description: 'The task in plain words, with the addresses and numbers it needs.' }, lane: LANE }, required: ['agent', 'task'], additionalProperties: false },
    async run(a, ctx) {
      const { agentId, chainId } = await resolveAgent(String(a['agent']))
      const { status, json } = await api(ctx, '/api/v1/hire/quote', { method: 'POST', body: { agentId, task: String(a['task']) } })
      if (status !== 200) fail(json, 'The agent did not quote.')
      return { network: netOf(chainId), agent: json['agentName'], price: json['priceLabel'], priceRaw: json['price'], token: json['token'], signed: json['signed'], signatureEvidence: json['signatureEvidence'], expiresAt: new Date(Number(json['expiresAt']) * 1000).toISOString(), provider: json['provider'], assumptions: json['assumptions'] ?? [], source: 'The agent\'s own ERC-8183 negotiate response, verified by Marque against its registered wallet', observedAt: new Date().toISOString() }
    },
  },
  {
    name: 'tender', title: 'Get quotes from every compatible agent',
    description: 'Send the same task to every compatible agent in a category and return each one\'s quote or refusal, sorted by price.',
    inputSchema: { type: 'object', properties: { category: CATEGORY, task: { type: 'string', description: 'The task in plain words, e.g. "health factor of 0x… and the repay to reach 1.5".' }, lane: LANE, max_agents: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['category', 'task'], additionalProperties: false },
    async run(a, ctx) {
      const category = String(a['category'])
      const fields = fieldsFromText(category, String(a['task']))
      const { status, json } = await api(ctx, '/api/v1/tender?format=json', { method: 'POST', body: { category, task: fields, lane: a['lane'] ?? 'mainnet' } })
      if (status !== 200) fail(json, 'The tender could not run.')
      const events = (json['events'] as Json[]) ?? []
      const start = events.find((e) => e['type'] === 'start') as Json | undefined
      const done = events.find((e) => e['type'] === 'done') as Json | undefined
      const names = new Map(((start?.['asked'] as Json[]) ?? []).map((x) => [String(x['agentId']), String(x['name'] ?? '')]))
      const tok = (id: string) => { const [c, , t] = id.split(':'); return `${c}:${t}` }
      const priced = events.filter((e) => e['type'] === 'quote').map((e) => {
        const q = e['quote'] as Json
        return { agent: tok(String(e['agentId'])), name: q['agentName'], price: q['priceLabel'], priceRaw: q['price'], token: (q['token'] as Json)?.['symbol'], signed: q['signed'], expiresAt: new Date(Number(q['expiresAt']) * 1000).toISOString(), ms: e['ms'] }
      }).sort((x, y) => Number(BigInt(String(x.priceRaw)) - BigInt(String(y.priceRaw))))
      const notPriced = events.filter((e) => e['type'] === 'declined' || e['type'] === 'failed').map((e) => ({ agent: tok(String(e['agentId'])), name: names.get(String(e['agentId'])) ?? null, outcome: e['type'], reason: e['reason'] }))
      const max = typeof a['max_agents'] === 'number' ? (a['max_agents'] as number) : 20
      return { network: a['lane'] === 'practice' ? netOf(97) : netOf(56), category, taskFields: fields, task: start?.['task'] ?? null, asked: done?.['asked'] ?? null, priced: priced.slice(0, max), notPriced: notPriced.slice(0, max), tenderId: done?.['tenderId'] ?? null, compare: `${ctx.origin}/tender?category=${category}`, source: 'Each agent\'s own negotiate response, requested in parallel by Marque', observedAt: new Date().toISOString() }
    },
  },
  {
    name: 'try_agent', title: 'Try an agent free',
    description: 'A free preview answer from an agent that offers one (Marque reference agents). Nothing is paid and nothing is recorded on chain.',
    inputSchema: { type: 'object', properties: { agent: AGENT, task: { type: 'string' } }, required: ['agent', 'task'], additionalProperties: false },
    async run(a, ctx) {
      const { agentId, chainId } = await resolveAgent(String(a['agent']))
      const { status, json } = await api(ctx, '/api/v1/hire/try', { method: 'POST', body: { agentId, task: String(a['task']) } })
      if (status !== 200) fail(json, 'This agent offers no free preview.')
      return { network: netOf(chainId), preview: true, answer: json, note: 'A free preview at the agent\'s own endpoint; not an escrow job and not on chain.', observedAt: new Date().toISOString() }
    },
  },
  {
    name: 'read_position', title: 'Read a position',
    description: 'Read any BSC address: PancakeSwap V3 ranges, Venus health factor, idle balances and the best yield, at one block, with needs-attention flags.',
    inputSchema: { type: 'object', properties: { address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } }, required: ['address'], additionalProperties: false },
    async run(a, ctx) {
      const { status, json } = await api(ctx, `/api/v1/positions/${a['address']}`)
      if (status !== 200) fail(json, 'The position could not be read.')
      const v = json['venus'] as Json | undefined
      const hf = (v?.['healthFactor'] as number | null) ?? null
      const lp = ((json['pancakeV3'] as Json)?.['positions'] as Json[] | undefined) ?? []
      const flags = [
        ...(hf !== null && hf < 1.2 ? [`Venus health factor ${hf.toFixed(3)} is below 1.2`] : []),
        ...lp.filter((p) => p['inRange'] === false).map((p) => `PancakeSwap V3 position #${p['tokenId']} is out of range`),
      ]
      return { network: netOf(56), block: json['blockNumber'], readAt: json['readAt'], needsAttention: flags, venus: v ?? null, pancakeV3: json['pancakeV3'] ?? null, idle: json['spot'] ?? null, bestYield: json['bestYield'] ?? null, source: 'Venus Comptroller, PancakeSwap V3 position manager and pools, read on chain (ONCHAIN)', desk: `${ctx.origin}/positions?addr=${a['address']}` }
    },
  },
  {
    name: 'plan_hire', title: 'Plan a hire',
    description: 'Quote an agent for the buyer and return the unsigned transaction sequence plus a link the human opens to review and sign on Marque. Marque never signs.',
    inputSchema: { type: 'object', properties: { agent: AGENT, task: { type: 'string' }, lane: LANE, buyer: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'The wallet that will sign and pay.' } }, required: ['agent', 'task', 'buyer'], additionalProperties: false },
    async run(a, ctx) {
      const { agentId, chainId } = await resolveAgent(String(a['agent']))
      const task = String(a['task'])
      const { status, json } = await api(ctx, '/api/v1/hire/quote', { method: 'POST', body: { agentId, task } })
      if (status !== 200) fail(json, 'The agent did not quote.')
      const n = network(chainId)
      const held = sealHeld({ quote: json, task })
      return {
        network: netOf(chainId), agent: json['agentName'], price: json['priceLabel'], expiresAt: new Date(Number(json['expiresAt']) * 1000).toISOString(), buyer: a['buyer'],
        sign: `${ctx.origin}/register?hire=${encodeURIComponent(agentId)}&held=${held}`,
        steps: [
          { step: 1, words: `Open a job for ${json['agentName']} in BNB Chain's ERC-8183 escrow`, to: n.commerce, function: 'createJob', note: 'The job id comes from the JobCreated event of this transaction.' },
          { step: 2, words: 'Turn on buyer protection', to: n.router, function: 'registerJob(jobId, policy)' },
          { step: 3, words: `Lock the price at ${json['priceLabel']}`, to: n.commerce, function: 'setBudget(jobId, amount)' },
          { step: 4, words: `Allow exactly ${json['priceLabel']}`, to: (json['token'] as Json)?.['address'], function: 'approve(escrow, exact amount)' },
          { step: 5, words: `Pay ${json['priceLabel']} into escrow`, to: n.commerce, function: 'fund(jobId, amount)' },
        ],
        note: 'Open the sign link: the hire sheet shows this exact quote and every step in plain words before the wallet signs. The escrow refunds the full amount if the agent does not deliver by the deadline.',
        source: 'The agent\'s signed negotiate response; calls built by Marque\'s hire sheet code', observedAt: new Date().toISOString(),
      }
    },
  },
  {
    name: 'job_status', title: 'Job status',
    description: 'One ERC-8183 job: state, agent, amount, deliverable link, review window and refund deadline.',
    inputSchema: { type: 'object', properties: { chainId: { type: 'integer', enum: [56, 97] }, jobId: { type: 'string', pattern: '^\\d{1,12}$' } }, required: ['chainId', 'jobId'], additionalProperties: false },
    async run(a, ctx) {
      const { status, json } = await api(ctx, `/api/v1/phase2/job/${a['chainId']}/${a['jobId']}`)
      if (status !== 200) fail(json, 'The job could not be read.')
      return { network: netOf(Number(a['chainId'])), ...json, jobRoom: `${ctx.origin}/jobs/${a['chainId']}/${a['jobId']}`, source: 'BNB Chain ERC-8183 escrow events, indexed by Marque (ONCHAIN)' }
    },
  },
  {
    name: 'verify_receipt', title: 'Verify a receipt',
    description: 'Recompute a Marque run receipt\'s digest and say whether it matches what was anchored.',
    inputSchema: { type: 'object', properties: { receiptId: { type: 'string' } }, required: ['receiptId'], additionalProperties: false },
    async run(a, ctx) {
      const { status, json } = await api(ctx, `/api/v1/receipts/${encodeURIComponent(String(a['receiptId']))}`)
      if (status !== 200) fail(json, 'No receipt with that id.')
      return { ...json, receipt: `${ctx.origin}/receipts/${a['receiptId']}`, source: 'Marque receipt store, digest recomputed on read' }
    },
  },
  {
    name: 'quest_progress', title: 'Set and Earn progress',
    description: 'BNB Chain Set and Earn progress for any address: hires across marketplaces and the six build criteria for agents it owns.',
    inputSchema: { type: 'object', properties: { address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } }, required: ['address'], additionalProperties: false },
    async run(a, ctx) {
      const { status, json } = await api(ctx, `/api/v1/quest/${a['address']}`)
      if (status !== 200) fail(json, 'Progress could not be read.')
      return { ...json, page: `${ctx.origin}/quest/${a['address']}`, source: 'Chain-derived quest projection (SPEC-TRACKING); BNB Chain decides qualification' }
    },
  },
  {
    name: 'check_agent', title: 'Check an agent against the build criteria',
    description: 'The six Set and Earn build criteria for one ERC-8004 agent, each observed, not yet, declared or not observable, with the next fix.',
    inputSchema: { type: 'object', properties: { chainId: { type: 'integer', enum: [56, 97] }, tokenId: { type: 'string', pattern: '^\\d{1,12}$' } }, required: ['chainId', 'tokenId'], additionalProperties: false },
    async run(a, ctx) {
      const r = await checkAgent(Number(a['chainId']) as ChainId, String(a['tokenId']))
      if (!r) throw new ToolError(`No ERC-8004 identity #${a['tokenId']} on ${netOf(Number(a['chainId']))}.`)
      return { network: netOf(Number(a['chainId'])), ...r, fixReport: `${ctx.origin}/builders/check/${a['chainId']}/${a['tokenId']}`, source: 'ERC-8004 registry, Marque probes, quotes and the hire index, read now', observedAt: new Date().toISOString() }
    },
  },
]
