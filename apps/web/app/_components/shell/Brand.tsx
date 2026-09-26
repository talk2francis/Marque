import { BRAND } from '@marque/ui/brand'
import { Lockup } from '../brand/Wordmark'

/** The lockup as a home link: the traced vector of the finalised artwork, in the ink of the current theme. */
export function LockupLink({ height = 22 }: { height?: number }) {
  return (
    <a href="/" className="brand-link" aria-label={`${BRAND.name} home`}>
      <Lockup height={height} />
    </a>
  )
}
