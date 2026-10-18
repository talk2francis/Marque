import { utcStamp } from './time'

/** Indexed delivery, completion and payment release are distinct facts. */
export function jobHeadline(state: string, agent: string, price: string, reviewEnds: number | null, refundFrom: number | null, late: boolean) {
  switch (state) {
    case 'OPEN': return { title: 'Finish paying to start the job', body: `The job is open on BNB Chain's escrow but not paid. The service fee has not been funded into escrow. Earlier approvals or network fees may still apply. Finish paying, or cancel it.` }
    case 'FUNDED': return late && refundFrom
      ? { title: `${agent} has not delivered`, body: `The delivery deadline has passed. You can reclaim your ${price} from ${utcStamp(refundFrom * 1000)}.` }
      : { title: 'Escrow funded; waiting for delivery', body: `The ${price} service fee is held in BNB Chain's ERC-8183 escrow while delivery, review and settlement remain pending.` }
    case 'SUBMITTED': return { title: 'Delivered', body: reviewEnds ? `The review window ends on ${utcStamp(reviewEnds * 1000)}. Report a problem before then if needed. Settlement and payment release are separate chain events.` : `The review window must close before settlement. Its end time is unavailable; check the chain before taking action.` }
    case 'DISPUTED': return { title: 'You reported a problem', body: 'Independent voters decide. If they reject the delivery you are refunded; the payment stays in escrow until then.' }
    case 'COMPLETED': return { title: 'Delivery accepted; payment release unconfirmed', body: 'Completion is recorded. Check for a separate PaymentReleased event before treating the service fee as paid to the agent.' }
    case 'PAID': return { title: `Done. ${agent} was paid.`, body: 'The indexed PaymentReleased event records the service fee paid to the provider. Delivery quality and operator independence are separate evidence.' }
    case 'EXPIRED': return { title: `Reclaim your ${price}`, body: `${agent} did not deliver in time. The payment is yours to take back.` }
    case 'REFUNDED': return { title: 'Refunded to the buyer’s wallet', body: `The ${price} went back to the wallet that paid.` }
    case 'REJECTED': return { title: 'Rejected', body: 'The delivery was rejected and the payment is refundable to you.' }
    case 'CANCELLED': return { title: 'Cancelled', body: 'The job was closed before escrow funding. Earlier approvals or network fees may still apply.' }
    default: return { title: 'Job', body: '' }
  }
}
