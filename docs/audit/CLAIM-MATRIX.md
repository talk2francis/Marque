# Claim-to-code matrix

Baseline: 2026-09-21. This matrix is intentionally negative where production
evidence is absent. “Receipt” is not synonymous with settlement or success.

## Authoritative current-state corrections

The original rows below are preserved as the claim audit at discovery time.
These corrections supersede conflicting statuses without erasing the failure:

| Claim | Current status | Current evidence |
|---|---|---|
| Third-party Hire uses the exact selected identity/service | PROVEN in tests and production | Canonical batched state, deep-link/generic equivalence, and production run `5e3a6cab-d203-491e-bff3-7df5ce06d7fc` preserve the immutable agent/service tuple. |
| A readable A2A card is callable | FALSE by design | Card readability and endpoint discovery do not set `messageSendCallable`. |
| MCP is protocol-correct | PROVEN for one compatible independent service | Production completed initialize → initialized → tools/list → schema-derived tools/call exactly once for service 32467. |
| Every accepted attempt terminates in evidence | PROVEN in tests | Typed success/failure receipt; pre-acceptance rejection is a separate immutable artifact. |
| Receipt means settlement | FALSE | Artifact type and commercial settlement remain separate. |
| All indexed identities are callable/hireable | FALSE | The UI/API expose distinct stages and fresh coverage. |
| Third-party settlement is supported generally | UNPROVEN | No claim or enabled fallback; no external funds spent. |

| Claim | Surface | Source file | Code path | Test | Live evidence | Status | Severity | Action |
|---|---|---|---|---|---|---|---|---|
| Third-party agents can be hired | README, Marketplace, homepage | `README.md`, `MarketCells.tsx`, `page.tsx` | Marketplace `hireable` is protocol-kind membership | None E2E | No independent third-party run/receipt found in audited candidates | FALSE | P0 | Gate Hire on exact verified service/task path |
| Marketplace selection remains the Charter counterparty | Marketplace/Charter | `market-model.ts`, Charter page/API | fixed by `7fb5331` direct ID lookup | `agents.test.ts` only | Deep links preserve tested IDs | PARTIALLY PROVEN | P0 | Persist and assert identity/service through run/receipt |
| Third-party profile leads to Hire | Agent profile | `agents/56/[tokenId]/page.tsx` | No action exists | None | Profile is a dead end | FALSE | P0 | Use shared action model and exact Hire URL |
| “Callable” means Marque can submit a task | Marketplace, filters, category pages | `marketplace.ts`, `market-model.ts` | latest agent probe + declared kind | None | Hevo is labelled usable while chosen A2A URL returns 405 | FALSE | P0 | Canonical per-service capability resolution |
| Public API is safe to consume cross-origin | Read API/docs | `middleware.ts`, API routes | wildcard CORS is limited to `GET`/`HEAD`; mutation routes remain same-origin | Type/lint; route E2E pending | Not deployed | PARTIALLY PROVEN | P1 | Add browser preflight E2E and production header smoke |
| “Live” means the selected interface works | Marketplace, compare, status | multiple | agent-level latest probe in several queries | Probe unit tests | Service-level observations exist, but surfaces collapse them | FALSE | P0 | Always name service and freshness |
| Preview free runs a real task | Marketplace | `MarketCells.tsx` | link to profile anchor only | None | Third-party profile has no preview execution | FALSE | P0 | Disable/rename until adapter-specific preview succeeds |
| MCS qualification proves current executability | Standard/Marketplace | `marketplace.ts` | results and liveness independently stored, then merged in UI rank | grading tests | Historical results exist | PARTIALLY PROVEN | P1 | Show qualification and current execution state independently |
| MCS failure makes an agent non-callable | Marketplace | `marketplace.ts` | failure does not block `hireable` | None | SwapGod remains displayed after MCS failure | PROVEN (negative claim avoided) | P2 | Preserve separation explicitly in canonical model |
| A2A is supported | Docs/Marketplace | `liveness.ts`, `a2a.ts`, `runs.ts` | card and declared task endpoint are resolved separately; absent task URL fails closed | Protocol fixtures pass | Production third-party lifecycle not yet repeated | PARTIALLY PROVEN | P0 | Complete external lifecycle evidence |
| MCP is supported | Docs/Marketplace | `liveness.ts`, `mcp.ts` | initialize/session/list/call; tool schema controls compatibility and arguments | Protocol and schema fixtures pass | Production run `5e3a6cab-d203-491e-bff3-7df5ce06d7fc` completed against independent service 32467 | PROVEN | P2 | Broaden compatible inventory; do not generalize one proof to all MCP servers |
| Every hire has a public receipt | README, My Marque, homepage | `pipeline.ts`, `runs.ts` | quote failure returns before receipt construction | Receipt unit coverage absent | 27 runs versus 23 receipts; four failures | FALSE | P0 | Terminal failure evidence for every accepted run |
| Failures are published | README, Standard, Run Room | conformance and run paths | MCS failures persist; early run failures lack receipts | grading tests only | Failed runs visible, but no terminal receipt | PARTIALLY PROVEN | P0 | Preserve failure artifacts and render their class |
| Receipt means settled | Tape, compare, docs wording | `Tape.tsx`, `compare/page.tsx` | receipt counted/labeled as settled while commercial `settled` may be false | None | Existing receipt schema separates settlement | FALSE | P1 | Replace “settled run” with “receipted attempt” unless paid |
| Charter is bounded and revocable | Charter/Judge/docs | mandates provider, signed control capability, `startRun` live re-read | public IDs cannot use/revoke; exact agent/category, expiry and revocation enforced before execution | capability/binding/store tests | Existing testnet grants/revokes; production capability flow not deployed | PARTIALLY PROVEN | P0 | Add route E2E and verify production after release gate |
| Works without wallet | README/Judge/positions | page and demo-owner paths | reads and demo flow do not require connected wallet | UI audit only | Public pages load without wallet | PARTIALLY PROVEN | P1 | Browser E2E through signature boundary |
| Production build is reproducible offline | Deployment/runtime | `layout.tsx`, committed font assets | `next/font/local`; no build-time font network request | `pnpm --filter @marque/web build` passes | Not deployed | PROVEN | P1 | Retain local assets and smoke standalone output |
| Migration 0012 preserves historical evidence | Database release | `0012_capability_evidence.sql` | additive transaction with receipt-type backfill and service/run indexes | Isolated pre-0012 candidate fixtures preserved; replay rolls back | Production deliberately untouched | PROVEN (candidate) | P0 | Backup/restore drill and approved maintenance window before production |
| Marketplace counts describe distinct states | Homepage/Register | `funnel.ts`, `page.tsx`, `marketplace.ts` | explicit registered → metadata → service → reachable → callable → compatible → qualified → hireable identity counts | Type/lint; DB integration pending migration | Existing production shows older collapsed stages | PARTIALLY PROVEN | P1 | Apply migration, capture production counts and reconcile Marketplace total |
| One agent has one name | Marketplace/profile/receipt | marketplace group aggregate | longest name can be selected from a different identity | None | token 338481 displayed with another identity’s name | FALSE | P0 | Identity fields only from selected identity row |
| Reference agents use the same downstream path | Judge/execution | `reference-agents.ts`, `runs.ts` | resolver special-cases references before DB services | reference engine tests | Reference receipts exist | PARTIALLY PROVEN | P1 | Same resolved-service contract and invariant tests |
| Real task against real chain state | Judge/preview | `JudgeFlow.tsx`, `runs.ts` | block pinned before run; reference path works | No browser E2E | Third-party path unproven | PARTIALLY PROVEN | P0 | External fixture/E2E plus independent live proof |
| Anchored receipt proves truth | Receipt | receipt page | copy correctly limits anchor claim to existence/immutability | None | 23/23 current receipts anchored | PROVEN | P3 | Retain wording and add artifact-type label |
| Mainnet writes require explicit approval | Product invariant/docs | mandates/execution/scripts | controls vary by path | No comprehensive test | Not exercised in this audit | UNPROVEN | P0 | Central chain/write policy and negative tests |

This matrix expands during each checkpoint. A release may only promote a row to
PROVEN when an automated test and an inspectable production artifact both exist
where the claim concerns production behavior.
