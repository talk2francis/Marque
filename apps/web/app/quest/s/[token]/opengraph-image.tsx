import { questProjection } from '../../../../lib/quest-api'
import { unsealAddress } from '../../../../lib/share-token'
import { cardSize, questCard } from '../../card-image'

/** The share card for a private progress link: the same numbers, no address. */
export const runtime = 'nodejs'
export const size = cardSize
export const contentType = 'image/png'
export const alt = 'Set and Earn progress on Marque'

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const address = unsealAddress(token)
  const p = address ? await questProjection(address).catch(() => null) : null
  return questCard(p?.value ?? null, null)
}
