import { describe, expect, it } from 'vitest'
import { completedDuringCampaign } from './campaign-window.js'
import { campaignStartMs, campaignEndMs } from './campaign.js'
const at = (n: number) => new Date(n).toISOString()
describe('closed builder campaign hires', () => {
  it('includes the close boundary and delayed indexing of pre-close events', () => {
    expect(completedDuringCampaign({ fundedAt: at(campaignStartMs), completedAt: at(campaignEndMs) })).toBe(true)
  })
  it('excludes jobs completed after the close even when funded before it', () => {
    expect(completedDuringCampaign({ fundedAt: '2026-10-30T13:34:48Z', completedAt: '2026-11-06T13:39:35Z' })).toBe(false)
    expect(completedDuringCampaign({ fundedAt: at(campaignStartMs), completedAt: at(campaignEndMs + 1) })).toBe(false)
  })
  it('requires valid funding and completion timestamps inside the window', () => {
    for (const job of [{ fundedAt: null, completedAt: at(campaignEndMs) }, { fundedAt: at(campaignStartMs), completedAt: null }, { fundedAt: 'bad', completedAt: 'bad' }, { fundedAt: at(campaignStartMs - 1), completedAt: at(campaignEndMs) }]) expect(completedDuringCampaign(job)).toBe(false)
  })
})
