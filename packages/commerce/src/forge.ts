import { decodeEventLog, parseAbi, stringToHex, type Hex, type Log } from 'viem'

/**
 * The Agent Forge's registration helpers (SPEC-BUILDERS 4). Pure: they build what the builder's own
 * wallet signs and read what the chain returned. Marque never registers for anyone, never pays the
 * gas and never holds a key.
 */

/** ERC-8004 IdentityRegistry, the exact overloads the BNB SDK ships (gotcha 14.10.1: name the overload). */
export const identityRegistryAbi = parseAbi([
  'function register(string agentURI, (string metadataKey, bytes metadataValue)[] metadata) returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
])

export const REGISTRATION_TYPE = 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1'
export const LAUNCHED_WITH = 'Marque Forge · https://marque.trade/builders'
export const FORGE_CATEGORIES = ['health_factor', 'yield', 'grid', 'rebalancing', 'security'] as const
export type ForgeCategory = (typeof FORGE_CATEGORIES)[number]

export interface RegistrationInput {
  name: string
  description: string
  category: ForgeCategory
  a2aCardUrl: string
  mcpUrl?: string | null
  imageUrl?: string | null
}

/** The registration file, in the shape Marque's own ingest parses (name, type, services, registrations). */
export function registrationJson(input: RegistrationInput, registered?: { chainId: 56 | 97; registry: string; agentId: bigint | number | string }) {
  const services: Array<{ name: string; endpoint: string }> = [{ name: 'A2A', endpoint: input.a2aCardUrl }]
  if (input.mcpUrl) services.push({ name: 'MCP', endpoint: input.mcpUrl })
  return {
    type: REGISTRATION_TYPE,
    name: input.name.trim(),
    description: input.description.trim(),
    image: input.imageUrl?.trim() || '',
    services,
    // Classification hint read by Marque; the card's skills still decide the category.
    category: input.category,
    registrations: registered ? [{ agentId: Number(registered.agentId), agentRegistry: `eip155:${registered.chainId}:${registered.registry}` }] : [],
  }
}

/** Stable bytes for hosting and byte-for-byte comparison (two-space JSON, trailing newline). */
export function registrationText(json: ReturnType<typeof registrationJson>): string {
  return `${JSON.stringify(json, null, 2)}\n`
}

/** The on-chain fallback: no hosting, slightly more gas. */
export function dataUri(text: string): string {
  // Browser and server alike: UTF-8 bytes, then base64.
  let bin = ''
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b)
  return `data:application/json;base64,${btoa(bin)}`
}

/** The exact `register` call the builder's wallet signs. */
export function registerCall(registry: `0x${string}`, agentURI: string) {
  return {
    address: registry,
    abi: identityRegistryAbi,
    functionName: 'register' as const,
    args: [agentURI, [{ metadataKey: 'launched_with', metadataValue: stringToHex(LAUNCHED_WITH) as Hex }]] as const,
  }
}

/** The new agent's id from a confirmed receipt's logs, only from the registry's own Registered event. */
export function registeredAgent(logs: readonly Pick<Log, 'address' | 'data' | 'topics'>[], registry: string): { agentId: bigint; owner: `0x${string}`; agentURI: string } | null {
  for (const l of logs) {
    if (l.address.toLowerCase() !== registry.toLowerCase()) continue
    try {
      const e = decodeEventLog({ abi: identityRegistryAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] })
      if (e.eventName === 'Registered') return { agentId: e.args.agentId, owner: e.args.owner, agentURI: e.args.agentURI }
    } catch { /* another event */ }
  }
  return null
}

/* ------------------------------------------------------------------ A2A card shape (SPEC-BUILDERS 5.2) */

export interface CardIssue { field: string; problem: string; fix: string }

/** Shape checks only (no network): what a buyer's client needs to read the card. */
export function cardShapeIssues(card: unknown): CardIssue[] {
  const out: CardIssue[] = []
  if (!card || typeof card !== 'object' || Array.isArray(card)) return [{ field: '(card)', problem: 'The response is not a JSON object.', fix: 'Serve the A2A agent card as a JSON object with Content-Type application/json.' }]
  const c = card as Record<string, unknown>
  const str = (k: string) => typeof c[k] === 'string' && (c[k] as string).trim().length > 0
  if (!str('name')) out.push({ field: 'name', problem: 'Missing or empty.', fix: 'Add "name": the display name buyers will see.' })
  if (!str('description')) out.push({ field: 'description', problem: 'Missing or empty.', fix: 'Add "description": one or two sentences on what it answers.' })
  if (!str('url') || !/^https:\/\//.test(String(c['url']))) out.push({ field: 'url', problem: str('url') ? 'Not an https URL.' : 'Missing.', fix: 'Add "url": the https JSON-RPC endpoint that answers message/send.' })
  if (!str('version')) out.push({ field: 'version', problem: 'Missing.', fix: 'Add "version", for example "1.0.0".' })
  if (!c['capabilities'] || typeof c['capabilities'] !== 'object') out.push({ field: 'capabilities', problem: 'Missing.', fix: 'Add "capabilities": {} (an empty object is valid).' })
  const skills = Array.isArray(c['skills']) ? (c['skills'] as unknown[]) : null
  if (!skills || skills.length === 0) out.push({ field: 'skills', problem: skills ? 'The array is empty.' : 'Missing.', fix: 'Add "skills": at least one skill with id, name, description and tags.' })
  else skills.forEach((s, i) => {
    const o = (s ?? {}) as Record<string, unknown>
    for (const k of ['id', 'name', 'description'] as const) if (typeof o[k] !== 'string' || !(o[k] as string).trim()) out.push({ field: `skills[${i}].${k}`, problem: 'Missing or empty.', fix: `Give skill ${i + 1} a "${k}".` })
    if (!Array.isArray(o['tags']) || (o['tags'] as unknown[]).length === 0) out.push({ field: `skills[${i}].tags`, problem: 'Missing or empty.', fix: `Give skill ${i + 1} "tags", for example ["venus", "health factor"].` })
  })
  return out
}

const SKILL_WORDS: Record<ForgeCategory, { id: string; name: string; tags: string[]; description: string }> = {
  health_factor: { id: 'health-factor', name: 'Venus health factor', tags: ['venus', 'health factor', 'liquidation', 'bsc'], description: 'Reads a Venus borrower’s health factor, liquidation price and the repay that reaches a target.' },
  yield: { id: 'yield', name: 'Stablecoin yield', tags: ['yield', 'apr', 'venus', 'bsc'], description: 'Ranks where an amount earns the most net of switching cost, and says whether to move.' },
  grid: { id: 'grid', name: 'Grid plan', tags: ['grid', 'trading', 'levels', 'bsc'], description: 'Plans grid levels inside a range with capital, stop and fee drag stated.' },
  rebalancing: { id: 'rebalance', name: 'PancakeSwap V3 range', tags: ['pancakeswap', 'v3', 'liquidity', 'rebalance'], description: 'Reads a V3 position and proposes a range on valid ticks.' },
  security: { id: 'token-review', name: 'Token review', tags: ['security', 'token', 'audit', 'bsc'], description: 'Reviews a token contract for owner powers, taxes and blacklists.' },
}

/** A minimal valid card for a category: the corrected example shown beside a failing check. */
export function exampleCard(category: ForgeCategory, name = 'Your agent', url = 'https://your-domain.example/a2a') {
  const s = SKILL_WORDS[category]
  return { name, description: s.description, url, version: '1.0.0', capabilities: {}, defaultInputModes: ['text'], defaultOutputModes: ['application/json'], skills: [{ id: s.id, name: s.name, description: s.description, tags: s.tags }] }
}

/** Host checks for "domain agent card" (5.5): a raw IP fails, a shared platform subdomain warns. */
const PLATFORMS = /\.(vercel\.app|netlify\.app|onrender\.com|herokuapp\.com|workers\.dev|pages\.dev|fly\.dev|railway\.app|ngrok(-free)?\.(app|io)|replit\.app|github\.io|glitch\.me|nodeops\.(app|network|xyz))$/i
export function hostVerdict(url: string): { state: 'ok' | 'warn' | 'fail'; reason: string } {
  let h: string
  try { const u = new URL(url); if (u.protocol !== 'https:') return { state: 'fail', reason: 'The card must be served over https.' }; h = u.hostname } catch { return { state: 'fail', reason: 'Not a valid URL.' } }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return { state: 'fail', reason: 'A raw IP address is not a domain you control. Put the card on a domain.' }
  if (PLATFORMS.test(h)) return { state: 'warn', reason: `${h} is a shared platform subdomain. It works, but a domain you own reads as a "domain agent card".` }
  return { state: 'ok', reason: `Served from ${h}.` }
}
