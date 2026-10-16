/** Dated organizer guidance. Local quest progress never certifies organizer eligibility. */
export const CAMPAIGN_RULES = {
  version: 'bnb-2026-10-16',
  checkedAt: '2026-10-16',
  url: 'https://www.bnbchain.org/en/hackathons/smart-money-era-set-and-earn',
  announcementUrl: 'https://www.bnbchain.org/en/blog/set-and-earn-hire-and-build-ai-agents-on-bnb-chain-win',
  startDate: '2026-10-01',
  qualifyingAnnouncementAt: null, // Exact qualifying X-announcement timestamp is not established.
  endsAt: '2026-11-05T12:00:00Z',
  hireMinimum: { agents: 3, marketplaces: 2 },
  marketplaces: ['TermiX', 'AgentSouk', 'Dolphin', 'HelloFugu', 'KATTEGAT', 'MarqueTrade', 'Pokter', 'AgentAtlas', 'Mandate'],
} as const
