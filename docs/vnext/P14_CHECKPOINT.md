# P14 security and release checkpoint, 18 October 2026

Status: AMBER. Release acceptance and exact activation are recorded below and in
[P15 handoff](P15_HANDOFF.md). Product limits remain explicit; this is not an
independent security certification.

Production baseline: `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`.
Final tested web source: `07307a5cb962622cc8b3aef98347451bbc15bd7d`.
P14/P15 extend the existing marketplace, buyer/seller APIs, four categories,
ERC-8183 projections, canonical SHA-256 receipts, deterministic MCS, SDK pins,
Caddy router-state protection, loopback slots, PM2 and observation backups.
No new contract, dependency, migration, registry identity or signer is required.

## Repairs and negative evidence

- Reject HTTPS-to-HTTP redirects before forwarding task bytes or opening a second
  pinned request. Existing SSRF, redirect, body and timeout boundaries remain.
- Require a complete successful HTTP transport for deployment and rollback.
  Prepared artifacts bind source, release metadata, runtime inputs and checksums.
- Persist available PM2 web slots before cutover and persist stopped retirement
  state. The observed reboot otherwise left Caddy pointing to a stopped slot.
- Separate Judge preview, service-fee escrow, submission, completion and payment.
  Guide, FAQ, paper and campaign crosswalks no longer imply a universal signed
  quote, free outside task, native action grant or organizer qualification.
- Compare minimum atomic prices only within a single chain, token and decimal
  scope. Unknown mixed scope is not a zero price or zero availability.
- Quarantine the legacy unconsented outside conformance task sweep. Its one-shot
  path refuses before database/network access; reference startup defers its
  existing schedules. Observation history is preserved.
- Scope ready/exact and category/default classified catalogs to complete owner
  groups before enrichment. Candidate classifications form a superset; the
  unchanged projection chooses the winner. Other-category siblings retain clone
  counts. Unknown ownership and explicit unclassified browsing retain the full
  original path. Read failures remain unavailable, never fabricated zero supply.

The first restored ready-catalog request failed with HTTP 503 in 9.177 seconds.
Broad-query alternatives did not reliably help and were not adopted. A later
real browser found Judge's category request still returned 503. Two new unit
regressions failed before its repair. Final read-only restored measurements:
health-factor 43 owners, 83 qualifying rows and 24 category matches in 5.693
seconds; classified catalog 891 owners, 1,724 qualifying rows and 797 matches in
5.690 seconds. These are dated samples, not production counts or percentiles.
The SQL statement limits were not increased and no index was added.

The first recovery rollback rehearsal timed out; the unchanged bounded repeat
passed. A hire-sheet test also failed because its accessible name changes after
metadata loading. The corrected locator passed four focused phone/desktop theme
states with no task, signature or wallet write. Original failures are retained.

## Validation

Final source: 896 tests in 96 files passed, zero skips, including 55 isolated
PostgreSQL regressions and three public read-only RPC cases. Fourteen focused
catalog checks passed. Final web types passed. Actual build, lint, copy,
packaging, browser, audit, rollback and production results follow in the release
record; source-only tests do not establish production activation.

GitHub run [39146724043](https://github.com/talk2francis/Marque/actions/runs/39146724043)
passed typechecks, lint, copy, tests, guarded fixture regressions, build and live
smoke for the final source. The earlier run's old-live marketplace hydration
failure remains recorded separately.

Sampled API top-level fields were preserved. Nullable health release metadata,
receipt evidence and exact-service preflight fields are additive. Historical
receipt/MCS hashes remain unchanged. The MCS manifest still has 42 files and
SHA-256 `0xbd9cc6322863f39347715b0cceb78aafd11157d6feebecb9ff144b7c92a87acf`;
arithmetic version 1.0.0 and tolerance revision 1 are unchanged.

## Operations and limits

Fresh backup at 10:59:47 UTC has two local copies with SHA-256
`4cffb02fba5b6553ead592229c2de24ca6e039e58b35c38bd99425cde3fb3c2a`.
Gzip validation and complete isolated restore passed. Twenty migration journal
hashes match source, with no pending migration. The restored observation counts
are a dated snapshot, not today's live population. Existing nightly encrypted
remote backup was verified; independent recovery-key custody remains untested.
A new full-database remote export was rejected by automatic review and was not
retried; the safe local restore proof was used instead.

The host's ACPI power-key shutdown and post-boot HTTP 502 recovery are detailed in
[P15 recovery](P15_RECOVERY.md). Protected application and shared-service process
comparisons use a new post-reboot baseline. Release activation permits only web
slots and four Marque read/diagnostic workers; keeper, sellers and other products
retain their processes. No global restart, database reset or history rewrite.

Residual limitations are in [risk register](P14_RISK_REGISTER.md). No new paid
pilot, provably independent person/funding sample, native asset authority,
payable HTTP seller or linked commercial-quality result is claimed. Historical
Plinth payment and the separate portable receipt remain distinct evidence.
Mainnet/testnet transactions and paid external tasks initiated by this release:
NONE. Existing keeper/seller duties continue independently.

## Accepted candidate and rollout gate

Final source validation passed: web types 51.83 seconds, build 349.18 seconds,
lint 57.30 seconds, copy 5.68 seconds and standalone packaging 0.41 seconds.
All tracked hashes matched the frozen source after validation. The private
reversal took 0.684 seconds to the old slot and 4.460 seconds back to the
candidate. Eleven proxy cases, eleven complete-body HTTP/schema samples and
the unchanged 42-file code-provenance response passed.

All 102 route/theme/width browser states passed, with no page/console errors,
unexpected HTTP errors, horizontal overflow or missing image labels. Thirty
catalog states ran AXE without serious/critical violations. Four synthetic
EIP-1193 wallet states passed; balances/RPC were fixtures and no key, signature
or transaction was used. The separate 40-state DOM audit had no page/console,
contrast, focus, overflow or image-label failures. Thirty-two states reported
small inline prose links; these are retained as advisory findings. Cancelled
Next prefetches during context closure were recorded separately, with no other
unexplained request failures.

Manual review covered contact sheets of all 132 custom route/interaction
screens and all 40 common audit captures, plus selected full-size quote and
sandbox-wallet originals. No redesign or brand/font/theme replacement was made.

Four old live JavaScript paths returned 404 from the bare new artifact. Release
staging now retains prior public static files without replacing new files, and
the candidate verifier checks complete old-page assets before cutover. Five
local HTTP-fixture regressions pass, along with shell/Node syntax, affected
script lint and five actual deployment CLI rejection cases. Legacy releases
without RELEASE_SHA retain a directory reference rather than a fabricated SHA.
GitHub tooling run [39148171653](https://github.com/talk2francis/Marque/actions/runs/39148171653) passed, including the new asset fixtures.

Decision: GO for the owner-authorized staged rollout. The cached-client asset
positive check, production public acceptance and scoped worker activation must
pass before declaring the release live. Production remains the baseline at
this candidate checkpoint; final observations are appended after activation.
