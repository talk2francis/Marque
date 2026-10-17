export const POLICY_PREVIEW_NOTICE = 'Only read-only policy preview is available. Buyer-owned onchain enforcement has not been verified; no authority was granted.'

/** No environment flag or request can enable an unproven signer boundary. */
export function refuseUnverifiedAuthority(): void {
  throw new Error(POLICY_PREVIEW_NOTICE)
}
