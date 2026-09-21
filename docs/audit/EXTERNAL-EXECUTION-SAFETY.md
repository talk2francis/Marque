# External execution safety classification

Date: 2026-09-21

This review covers the seven exact identity/service pairs prepared by
`scripts/release-execute-candidates.mts`. Classification is based on the
freshly captured card/tool manifest in
`docs/evidence/third-party/candidate-discovery/2026-09-21T11-38-05Z.json`.
No operation in this document was invoked during classification.

Classes: **A** demonstrably read-only; **B** analytical but provider-side
effects cannot be ruled out; **C** explicitly financial/state-changing;
**D** unknown or no compatible operation.

| Agent / identity | Service | Intended operation | Class | Evidence and decision |
|---|---|---|---|---|
| ClawdMint / #2468 | 40580 · A2A | `message/send`, Yield task | B | The card declares a Yield Optimizer skill and task URL, but A2A `message/send` creates a provider task/conversation. The card supplies no side-effect-free capability method or read-only annotation. No invocation. |
| FrostForge / #152313 | 29792 · A2A | `message/send`, Grid task | B | Shared Singularry task endpoint. A message creates work/provider state; the card does not prove read-only handling. No invocation. |
| CryptoX by Unibase / #2146 | 31179 · A2A | `message/send`, Yield task | B | The advertised BitAgent endpoint accepts jobs/messages; the card has no read-only guarantee and advertises no Marque task schema. No invocation. |
| ClawdMint / #2468 | 40581 · MCP | `get_yield_opportunities` | A operation, **not task-compatible** | Tool description only reads yield opportunities; schema has optional `asset`, `min_tvl_usd`, `top_n`, no wallet/payment/transaction fields. No annotations are supplied. It cannot represent Marque's size, allowed-protocol, improvement, leverage and current-APR policy, so canonical compatibility is false and it is not invoked as a Marque task. |
| Topaz Agent / #113284 | 30666 · MCP | `topaz_get_pool_stats` (the prior matcher would choose this) | A operation, **not task-compatible** | Description returns pool/APR statistics; empty optional schema and no mutation semantics. No annotations. It cannot accept the requested subject or Yield policy. The stronger matcher rejects it. |
| Brain On BNB AI / #49467 | 30780 · MCP | `pancakeswap_fee_tiers` (the prior matcher would choose this) | A operation, **not task-compatible** | Manifest says it measures fee tiers, requires only an address, and explicitly supplies `readOnlyHint: true`, `destructiveHint: false`. It cannot accept the full Yield policy and is rejected as task-incompatible. |
| Venus powered by HeyAnon / #43129 | 30963 · MCP | Health-factor task | D | Read tools exist (`getBorrowBalance`, `getAccountLiquidity`, collateral queries), but their required `chainName(s)`, pool and token-array schemas cannot be populated from the current Marque task without inventing arguments. Earlier tools named `borrow`, `repay`, `mintToken`, and collateral changes are explicitly `type: execution`. No compatible tool is selected or called. |

## Result

Three MCP operations are independently supportable as read-only operations,
but none can satisfy the complete typed Marque task selected for it. Calling
an unrelated safe tool would prove MCP transport only, not Marketplace Hire or
task compatibility, so this audit does not count or invoke those operations as
an end-to-end proof. All three A2A operations remain class B. The Venus attempt
remains class D because safe argument adaptation is unproven.

Accordingly the automatically invokable set for the requested Marque
lifecycle is empty. This is negative evidence, not a reason to weaken the task
schema or compatibility threshold.
