/**
 * A dedicated enrichment pass.
 *
 * The interleaved worker splits its budget between sweeping and enriching, and
 * sweeping gets slow past ~100k offset. Supply measurement depends only on
 * enrichment, so this drains the candidate queue directly.
 */
import { ScanClient, enrichDetails, BSC } from '@marque/registry'
import { closeDb } from '@marque/db'

const client = new ScanClient()
let total = 0, withService = 0, services = 0, rounds = 0
const started = Date.now()

for (;;) {
  const r = await enrichDetails({ client, chainId: BSC, limit: 500 })
  if (r.attempted === 0) { console.log('queue drained'); break }
  total += r.attempted; withService += r.withAtLeastOneService; services += r.servicesWritten; rounds++
  const mins = (Date.now() - started) / 60000
  console.log(JSON.stringify({
    round: rounds, enriched: total, withService, services,
    rate: `${Math.round(total / Math.max(mins, 0.01))}/min`,
    budgetDay: client.rateLimit.remainingDay,
  }))
  if (client.rateLimit.remainingDay !== null && client.rateLimit.remainingDay < 3000) {
    console.log('stopping: day budget nearly exhausted'); break
  }
}
await closeDb()
