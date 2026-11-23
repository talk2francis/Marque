/**
 * Stable addresses for an agent's portrait and banner (23 Nov 2026). Pages used to embed the image's content hash, so a
 * page cached before a change (edge, or either web worker's ISR copy) kept pointing at the old picture, and reloads
 * could flip between old and new. These addresses never change; the route behind them serves the CURRENT image.
 */
export type AgentArtKind = 'portrait' | 'banner'

export function agentArtUrl(agentId: string, kind: AgentArtKind): string | null {
  const m = /^(56|97):(0x[0-9a-fA-F]{40}):(\d{1,78})$/.exec(agentId)
  return m ? `/img/art/${m[1]}/${m[2]!.toLowerCase()}/${m[3]}/${kind}` : null
}

export const AGENT_ART_PATH = /^\/img\/art\/(?:56|97)\/0x[0-9a-f]{40}\/\d{1,78}\/(?:portrait|banner)$/
