// Shared by PM2 and release verification. Public values only.
const walkthrough = {
  JUDGE_JOB: '56:56903',
  JUDGE_QUEST_ADDRESS: '0x5aC2448FC79Ef8d33710b1Bced5AEff90138b452',
  JUDGE_EARLIER_ACT: '56:57066',
}
module.exports = { instances: 4, walkthrough, warmRoute: `/jobs/${walkthrough.JUDGE_JOB.replace(':', '/')}` }
