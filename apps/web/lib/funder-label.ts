/** Who paid for a job, in words (V4.2 L0). The class itself comes from @marque/commerce funderClass. */
export type FunderClass = 'outside' | 'team' | 'operator'
export const FUNDER_LABEL: Record<FunderClass, string> = { outside: 'Outside buyer', team: 'Marque team (test)', operator: "The agent's own operator" }
export const FUNDER_NOTE: Record<FunderClass, string> = {
  outside: "Not in Marque's published team list. It does not prove the buyer is unrelated.",
  team: "Paid by one of Marque's own published test wallets. Shown, never counted as usage.",
  operator: "Paid by the agent's own owner or agent wallet. Shown, never counted as usage.",
}
