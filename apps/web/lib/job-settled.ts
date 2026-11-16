/**
 * Whether a Job Room can be kept by the edge cache for a long time (ops/edge/policy.mjs, route `job-room`).
 *
 * "Settled" means nothing on this page is expected to change again:
 *   - the job reached an end state (paid, refunded or cancelled) and has either been rated, or has been quiet for a
 *     week, so a rating made moments ago is never hidden behind a long-lived copy; or
 *   - the job was opened, never paid, and its payment window closed more than a week ago.
 * Anything else is "live" and is kept for seconds only. A reload always gets a current render either way.
 */
const END_STATES = new Set(['PAID', 'REFUNDED', 'CANCELLED'])
export const QUIET_SECONDS = 7 * 86_400

export function jobSettled(input: { state: string; rated: boolean; lastEventAt: number | null; fundingDeadline: number | null; now: number }): boolean {
  const { state, rated, lastEventAt, fundingDeadline, now } = input
  if (END_STATES.has(state)) return rated || (lastEventAt !== null && now - lastEventAt >= QUIET_SECONDS)
  if (state === 'OPEN') return fundingDeadline !== null && now - fundingDeadline >= QUIET_SECONDS
  return false
}
