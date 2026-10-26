import { questProjection, QUEST_ADDRESS } from '../../../lib/quest-api'
import { cardSize, questCard } from '../card-image'

/** The share card for /quest/{address}, with the short address (the person chose to show it). */
export const runtime = 'nodejs'
export const size = cardSize
export const contentType = 'image/png'
export const alt = 'Set and Earn progress on Marque'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params
  const valid = QUEST_ADDRESS.test(address)
  const p = valid ? await questProjection(address).catch(() => null) : null
  return questCard(p?.value ?? null, valid ? short(address) : 'Check any wallet')
}
