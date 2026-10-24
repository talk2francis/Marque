'use client'
import { saveBrief } from '../../lib/brief'

/** Step 1 to step 2: carry the demo position into the tender form (visible and editable there, sent nowhere by itself). */
export function RepayPlanButton({ address, target }: { address: string; target: number }) {
  return (
    <a className="btn btn--primary btn--sm" href="/tender?category=health_factor" onClick={() => saveBrief({ category: 'health_factor', address, targetHf: target })}>
      Get a repay plan
    </a>
  )
}
