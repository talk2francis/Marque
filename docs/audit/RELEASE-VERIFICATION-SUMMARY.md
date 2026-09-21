# Marque release verification summary

Date: 2026-09-21  
Branch: `hardening/third-party-marketplace`  
Recommendation: **NO — do not deploy**

The fixes and evidence are pushed to `hardening/third-party-marketplace`.

## 1. Exact commits

- `9f51958 fix(marketplace): unify canonical hireability evidence`
- `7e4c5ef docs(audit): record post-hardening release evidence`

## 2. Remaining issues

- **P0:** Zero independent agents completed the full Charter → external result → receipt lifecycle.
- **P1:** Revoked/expired requests are rejected before run acceptance, but browser-visible failure receipts for those attempts remain unproven.
- **P1:** Global canonical callable/compatible/hireable counts require migration 0012 plus fresh reprobes; legacy MCP evidence is not trustworthy.
- **P2:** Generic Charter candidate evaluation uses canonical semantics but fans out per identity; batching is advisable at larger category sizes.

## 3. Canonical funnel counts

Production-derived counts:

- Registered: **355,603**
- Metadata readable: **114,263**
- Service declared: **39,927**
- Historically qualified identities: **5**
- Fresh transport-reachable under available legacy fields: **26,775**
- Legacy non-A2A “live”: **6,199**, but not publishable as canonical callable
- Globally canonical callable/compatible/hireable: unavailable until migration and fresh reprobes

Fresh 30-service audit sample:

- Reachable: **29**
- Protocol-callable without A2A work: **19**
- Task-compatible: **0**
- Hireable: **0**

## 4. External agents/services inspected

**30**, including the seven prepared execution candidates.

## 5. Protocol-reachable

**29/30**.

## 6. Genuinely protocol-callable

**19/30** — nine MCP and ten x402. A2A card readability no longer counts.

## 7. Task-compatible

**0/30** under the complete typed Marque task schemas.

## 8. Safely invoked

**0**. Three MCP operations were class A/read-only but could not represent the requested Marque task. Calling them would prove transport, not Hire compatibility.

## 9. Complete Marque lifecycles

**0**.

## 10. Independent operators proven end-to-end

None.

## 11. A2A result

New probes preserve card readability, advertised skills, endpoint discovery and advertised task hints, but leave `messageSendCallable` unknown and verified task kinds empty. The three prepared A2A operations are class B because `message/send` creates provider-side work/conversation state.

## 12. MCP result

Nine sampled endpoints successfully completed `initialize → tools/list`. Matching now rejects tools that merely mention a category but cannot represent the complete typed task. ClawdMint, Topaz and Brain On BNB exposed read-only tools, but none accepted the full requested policy. Venus argument adaptation remained unproven.

## 13. Browser E2E

- Local built candidate: **4/4** desktop/mobile tests passed.
- Previous live read-only suite: **6/6** passed.
- Proven: generic/exact equivalence, unavailable-agent exclusion, exact accepted selection, reload/history continuity, mobile behavior, no reference fallback, and unsupported-category fail-closed.
- No Grant action was submitted.

## 14. Identity/service continuity

Canonical inventory and exact Hire now use the same evaluator. Receipts now preserve:

- Agent identity
- Service ID
- Protocol
- Discovery endpoint
- Executable endpoint
- Probe ID

## 15. Failure receipts

Runtime tests prove distinct terminal receipts for:

- Quote failure
- Authority rejection
- Timeout
- Malformed/unusable response
- No compatible interface
- Execution failure

Quote failures remain `stage: quote`, not execution failures. Revoked/expired binding rejection passes, but browser-visible receipts for those pre-acceptance cases remain incomplete.

## 16. Performance

The generic candidate query used indexes, returned 84 identities in **13.161 ms**, used a 30 kB in-memory sort and wrote no temporary blocks. Per-identity canonical evaluation remains a P2 batching opportunity.

## 17. Security

Passing coverage includes SSRF/private ranges, redirect revalidation, oversized responses, timeouts, stale probes, service mixing, category and identity mismatch, revoked/expired binding, and immutable duplicate receipt persistence.

No external task, payment, transaction, production migration, mainnet write, or deployment occurred.

## 18. Defensible claims

- Marque indexes independent ERC-8004 identities and exact services.
- A readable A2A card is distinct from a callable task endpoint.
- MCP discovery performs proper initialization and tool listing.
- Exact and generic Charter eligibility share one canonical decision.
- Unsupported categories and stale evidence fail closed.
- Exact unavailable third parties never silently become reference agents.
- Accepted pipeline failures generate stage-accurate evidence.
- Receipts preserve exact service identity.

## 19. Forbidden claims

- “Any registered agent can be hired.”
- “A readable A2A card is callable.”
- “6,199 agents are canonically callable.”
- “Three independent external agents work end-to-end.”
- “Third-party payment or settlement is proven.”
- “Every revoked/expired browser attempt produces a receipt.”
- “Marque is production-ready.”

## 20. Deployment recommendation

**NO.** Zero independent external agents have completed a genuine full lifecycle, and the migrated/freshly reprobed global capability funnel is not yet available.

## Related reports

- `docs/audit/FINAL-AUDIT.md`
- `docs/audit/EXTERNAL-EXECUTION-SAFETY.md`
- `docs/audit/MIGRATION-0012-VERIFICATION.md`
