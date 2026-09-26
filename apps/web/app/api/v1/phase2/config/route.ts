import { questConfig } from '@marque/commerce'
import { served } from '../../../../../lib/phase2-api'

export const dynamic = 'force-dynamic'

/** GET /api/v1/phase2/config (SPEC-TRACKING 6.1): contracts, event topics (with on-chain verification), team wallets, indexer position. */
export async function GET() {
  return served('phase2:config', 'config', () => questConfig())
}
