/** Confirmed receipts and uncertain wallet requests must never be submitted again (C10). */
export function grantRetryPolicy(states: readonly ('waiting' | 'signing' | 'pending' | 'done' | 'failed')[]): 'submit' | 'verify' | 'wait' {
  if (states.length && states.every(s => s === 'done')) return 'verify'
  if (states.some(s => s === 'pending' || s === 'signing')) return 'wait'
  return 'submit'
}
