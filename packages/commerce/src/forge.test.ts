import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, hexToString } from 'viem'
import { cardShapeIssues, dataUri, exampleCard, hostVerdict, identityRegistryAbi, LAUNCHED_WITH, registerCall, registeredAgent, registrationJson, registrationText, agentWalletTypedData, agentWalletSignatureOk, parseWalletSignature, setAgentWalletCall } from './forge.js'

const REG = '0x8004A818BFB912233c491871b3d84c89A494BD9e'
const input = { name: ' Lattice Mini ', description: 'Grid plans on BSC.', category: 'grid' as const, a2aCardUrl: 'https://agent.example/.well-known/agent-card.json' }

describe('Forge registration', () => {
  it('builds the registration file Marque ingest parses', () => {
    const j = registrationJson(input)
    expect(j).toMatchObject({ type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1', name: 'Lattice Mini', services: [{ name: 'A2A', endpoint: input.a2aCardUrl }], registrations: [] })
    const after = registrationJson({ ...input, mcpUrl: 'https://agent.example/mcp' }, { chainId: 97, registry: REG, agentId: 123n })
    expect(after.services).toHaveLength(2)
    expect(after.registrations).toEqual([{ agentId: 123, agentRegistry: `eip155:97:${REG}` }])
  })
  it('round-trips the data URI fallback byte for byte', () => {
    const text = registrationText(registrationJson(input))
    const uri = dataUri(text)
    expect(uri.startsWith('data:application/json;base64,')).toBe(true)
    expect(Buffer.from(uri.split(',')[1]!, 'base64').toString('utf8')).toBe(text)
  })
  it('calls the two-argument register overload with the launched_with entry', () => {
    const c = registerCall(REG, 'https://agent.example/.well-known/agent-registration.json')
    const data = encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args })
    expect(data.slice(0, 10)).toBe(encodeFunctionData({ abi: identityRegistryAbi, functionName: 'register', args: ['x', []] }).slice(0, 10))
    expect(hexToString(c.args[1][0].metadataValue)).toBe(LAUNCHED_WITH)
  })
  it('reads the agent id only from the registry Registered event', () => {
    const owner = '0x1111111111111111111111111111111111111111'
    const topics = encodeEventTopics({ abi: identityRegistryAbi, eventName: 'Registered', args: { agentId: 371234n, owner } })
    const data = encodeAbiParameters([{ type: 'string' }], ['ipfs://x'])
    const log = { address: REG, topics, data } as never
    expect(registeredAgent([log], REG)).toEqual({ agentId: 371234n, owner, agentURI: 'ipfs://x' })
    expect(registeredAgent([{ ...(log as object), address: '0x2222222222222222222222222222222222222222' } as never], REG)).toBeNull()
  })
})

describe('Forge card checks', () => {
  it('passes the example card for every category', () => {
    for (const c of ['health_factor', 'yield', 'grid', 'rebalancing', 'security'] as const) expect(cardShapeIssues(exampleCard(c))).toEqual([])
  })
  it('names each missing field with a fix', () => {
    const issues = cardShapeIssues({ name: 'x', url: 'http://plain', skills: [{ id: 's' }] })
    const fields = issues.map((i) => i.field)
    expect(fields).toEqual(expect.arrayContaining(['description', 'url', 'version', 'capabilities', 'skills[0].name', 'skills[0].description', 'skills[0].tags']))
    expect(issues.every((i) => i.fix.length > 10)).toBe(true)
    expect(cardShapeIssues([])[0]!.field).toBe('(card)')
  })
  it('fails raw IPs and warns on platform subdomains', () => {
    expect(hostVerdict('https://203.0.113.9/card.json').state).toBe('fail')
    expect(hostVerdict('http://agent.example/card').state).toBe('fail')
    expect(hostVerdict('https://my-agent.vercel.app/card').state).toBe('warn')
    expect(hostVerdict('https://agent.brainonbnb.com/card').state).toBe('ok')
  })
})

describe('agent wallet link', () => {
  it('accepts the seller signature for exactly this agent, owner and deadline', async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts')
    const seller = privateKeyToAccount(generatePrivateKey())
    const registry = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const
    const m = { agentId: 2661n, newWallet: seller.address, owner: '0x95A8A1d6c9D5213054936545bE4EE4CFC22b3CfB' as const, deadline: 1_800_000_000n }
    const signature = await seller.signTypedData(agentWalletTypedData(97, registry, m))
    expect(await agentWalletSignatureOk(97, registry, m, signature)).toBe(true)
    expect(await agentWalletSignatureOk(97, registry, { ...m, agentId: 2662n }, signature)).toBe(false)
    expect(await agentWalletSignatureOk(56, registry, m, signature)).toBe(false)
    expect(parseWalletSignature(`some log line\n${JSON.stringify({ wallet: seller.address, signature })}\n`)).toEqual({ wallet: seller.address, signature })
    expect(parseWalletSignature('{"wallet":"0x12","signature":"0x"}')).toBeNull()
    expect(setAgentWalletCall(registry, 1n, seller.address, 2n, signature).functionName).toBe('setAgentWallet')
  })
})
