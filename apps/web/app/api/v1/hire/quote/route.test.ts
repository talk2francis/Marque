import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const { sellerFor, quoteForBuyer } = vi.hoisted(() => ({ sellerFor: vi.fn(), quoteForBuyer: vi.fn() }))
vi.mock('@marque/commerce', async original => ({ ...await original<typeof import('@marque/commerce')>(), sellerFor, quoteForBuyer }))
vi.mock('@marque/agent-engines', () => ({ engineFor: () => ({ inspect: () => ({ missing: [], assumptions: [] }) }) }))
import { POST } from './route'

const task = 'Compare the fee tiers for this token with 1000 USD capital.'
const request = () => new NextRequest('https://candidate.invalid/api/v1/hire/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: '56:registry:7', serviceId: 42, task, quoteAccessVersion: 2 }) })
beforeEach(() => {
  sellerFor.mockReset().mockResolvedValue({ name: 'Fee tier service', category: 'rebalancing', firstParty: null, taskGuide: { skillId: 'fee_tiers' } })
  quoteForBuyer.mockReset().mockResolvedValue({ agentId: '56:registry:7', chainId: 56 })
})

describe('acceptance criteria follow the exact paid task', () => {
  it('does not add range-planning criteria to a seller-declared fee-tier task', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(sellerFor).toHaveBeenCalledWith('56:registry:7', 42)
    const [agentId, serviceId, sent, version] = quoteForBuyer.mock.calls[0]!
    expect({ agentId, serviceId, version }).toEqual({ agentId: '56:registry:7', serviceId: 42, version: 2 })
    expect(sent.task_description).toBe(task)
    expect(sent.terms).not.toHaveProperty('success_criteria')
    expect(sent.terms.deliverables).toBeTruthy()
  })

  it('retains category criteria for first-party category tasks', async () => {
    sellerFor.mockResolvedValue({ name: 'Reference', category: 'rebalancing', firstParty: { slug: 'bound' }, taskGuide: null })
    expect((await POST(request())).status).toBe(200)
    expect(quoteForBuyer.mock.calls[0]![2].terms.success_criteria.length).toBeGreaterThan(0)
  })

  it('retains the existing category path when no explicit paid guide is available', async () => {
    sellerFor.mockResolvedValue({ name: 'Category seller', category: 'rebalancing', firstParty: null, taskGuide: null })
    expect((await POST(request())).status).toBe(200)
    expect(quoteForBuyer.mock.calls[0]![2].terms.success_criteria.length).toBeGreaterThan(0)
  })
})
