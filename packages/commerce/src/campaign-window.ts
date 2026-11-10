import { campaignStartMs, campaignEndMs } from './campaign.js'
/** Completion is observed at its chain timestamp, never the indexer's arrival time. */
export function completedDuringCampaign(job: { fundedAt: string | null; completedAt: string | null }): boolean {
  if (!job.fundedAt || !job.completedAt) return false
  const funded = Date.parse(job.fundedAt), completed = Date.parse(job.completedAt)
  return Number.isFinite(funded) && Number.isFinite(completed) && funded >= campaignStartMs && funded <= campaignEndMs && completed >= funded && completed <= campaignEndMs
}
