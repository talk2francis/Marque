/** Quote specific sellers now (ignores cadence). Usage: tsx scripts/quote-now.mts <owner-or-tokenId> ... Read only. */
import { closeDb } from '@marque/db'
import { sellerCandidates, recordQuote } from '../src/supply.js'
import { requestQuote, probeTask } from '../src/quote.js'
const keys = process.argv.slice(2).map((k) => k.toLowerCase())
const list = (await sellerCandidates()).filter((c) => keys.includes(c.tokenId) || keys.includes((c.owner ?? '').toLowerCase()))
for (const c of list) {
  const q = await requestQuote(c.endpoint, probeTask(c.category ?? 'general'), { agentWallet: c.agentWallet, agentOwner: c.owner })
  await recordQuote('probe', c, q)
  console.log(c.tokenId, c.name, c.category, q.ok ? `OK signed=${q.signed} ${q.chainId} ${q.price} ${q.token.symbol}` : `NO ${q.reason}: ${q.detail}`)
}
await closeDb()
