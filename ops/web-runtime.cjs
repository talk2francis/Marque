// Shared by PM2 and release verification. Public values only.
const walkthrough = {
  JUDGE_JOB: '56:56903',
  JUDGE_QUEST_ADDRESS: '0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452',
  JUDGE_EARLIER_ACT: '56:57066',
}
const warmRoute = `/jobs/${walkthrough.JUDGE_JOB.replace(':', '/')}`
const profile = require('../config/first-party.json').agents.find(agent => agent.slug === 'keel')
if (!profile?.testnet) throw new Error('Reference profile initialization is not configured')
const warmRoutes = ['/', '/judge', '/builders', `/agents/${profile.slug}`,
  `/agents/${profile.chainId}/${profile.tokenId}`, `/agents/${profile.testnet.chainId}/${profile.testnet.tokenId}`, warmRoute]
module.exports = { instances: 4, walkthrough, warmRoute, warmRoutes }
