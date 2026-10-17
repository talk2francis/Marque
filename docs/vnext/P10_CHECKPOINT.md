# P10 checkpoint: read-only action policy boundary

17 October 2026. Validation in progress; this draft is not a completion claim.

Baseline P09 checkpoint `19f5f779e78bcac489791a41b1dd354bc1c129ee`; frozen candidate source `a49852dc01d9a6b00c46457e76fae3d15ce8260a`, branch `repair/vnext-v3-p10-20261017`, isolated `/root/marque-vnext-p07`. Production remains `97ef4c73ea3717d1a059b649a35e8124d93bdb7f`. Owner approves P10 then P11; P11 follows the committed checkpoint, without another phase approval. No automatic P12 or release. Independent P11 source preparation overlaps P10 frozen validation in its own worktree; expensive validation waits for the completed P10 checkpoint. This authorized efficiency choice is recorded, not an early completion claim.

## Scope and reuse

Native buyer-owned session enforcement is unproven. P10 selects the pack's read-only policy-preview fallback. It reuses all four historical category templates, UI/design/fonts/art, charter history, registry hash/revocation records, bounded catalog, buyer-owned mainnet fee escrow and existing ownership/hire checks. No replacement session, escrow, registry, key store or paid adapter. See [authority contract](P10_AUTHORITY_CONTRACT.md).

Source audit: web RegistryCharterService uses an operator signer on testnet97, not buyer asset authority. Legacy execute omits selector/token/recipient enforcement and serialized cap reservation. Altana SDK installed0.9.0; unwired adapter adds0.002BNB, maps total to day, drops selectors and reports cached state as chain-derived. Deployed AltanaKeyStore version/bytecode and actual native revocation effectiveness: UNKNOWN, not used. These are quarantined historical implementations, not repaired native enforcement. New registry grant/execute fail before work, Altana construction fails before signer/SDK initialization; no bypass flag. No new signing or native authority is enabled.

Existing POST `/api/v1/charters` intentionally returns409 `authority_unverified` before parsing, DB or signing. Historical GET list shape remains `{charters,chainId:97}`. `readCharter` derives expiry without mutating original rows. Four-category preview checks exact native caps locally, never opens a wallet or starts a permission lifetime. Service fee escrow does not authorize asset movements. Judge no longer creates a charter or asserts a hardcoded current-block pass; it displays bounded dated catalog evidence and explains its old grant/run sequence stops at preview.

Changed paths: mandates availability, providers/registry and providers/altana guards, pure policy-preview and its export/tests; existing charters route/tests; lib/charters observation/test; app/charter page/PolicyPreview, charters history, SandboxCharterStrip, judge page/JudgeFlow and why CTA; architecture, capability/conflict/graph/project/deviation/contract/checkpoint docs. No SDK/lock, worker, ops or SQL migration changes.

## Actual baseline observations

At2026-10-17T14:46:16.264960Z shared service/PM2 PIDs unchanged, original Marquecodex tmux present, Linger=yes, production tracked source unchanged and26 pre-existing untracked media retained. Trusted sanitized Caddy router-state mirror matches. Complete public baseline responses: Marque200/0.185642s/66bytes; KerbAPI200/2.795395s/308bytes; Kerbweb200/0.372899s/224967bytes. These are individual readings, not uptime or p95; prior P09 Kerb7.778119s sample remains dated evidence with unknown cause. Validation uses50%CPU,3GiB memory/1GiB swap,nice15,idle I/O; no product restart or query rewrite.

Public read-only GET `/api/v1/charters` returned200,0.305675s,41324bytes:40 capped returned records, all registry/testnet97,30expired/10revoked,2 distinct recorded owner addresses. This is not a population count or independent-user count. No POST was sent to production.

Mid-run2026-10-17T15:19:56.967986Z: original shared/PM2 PIDs, tmux, linger, production source/media and trusted proxy mirror still unchanged. Complete Marque200/0.487545s; KerbAPI200/5.675677s; Kerbweb200/0.500943s. Bodies explicitly validate Marque ok=true, Kerb status=ok and complete HTML at both initial and mid samples. The slower Kerb sample is preserved with UNKNOWN causality. At15:20:34.780829Z:6visible CPUs, load7.24/5.04/4.05, CPU pressure avg10=68.46%, MemAvailable4237648KiB, validation521297920bytes/no restarts. Only our P10 validation/proof and queued P11 validation units were reduced at15:21:05.438614Z from50% to25%CPU,CPUWeight1; no product action or speculative query rewrite. This does not establish zero performance impact. Wall timings include throttling/host contention.

## Validation

Final targeted command `pnpm exec vitest run packages/mandates/src/policy-preview.test.ts packages/mandates/src/authority-boundary.test.ts apps/web/lib/charter-observation.test.ts apps/web/app/api/v1/charters/route.test.ts --maxWorkers=1 --minWorkers=1`:31passed,4files,7.43s. Focused mandates and web types exit0. Initial redundant mainnet branch caused TS2367 after constructor narrowed chain to97; removed redundant branch, preserved the finding/log. No tolerance or test weakened.

Full Vitest on initial source7efa310 (before history-action/copy correction): `Test Files 79 passed | 4 skipped (83)`; `Tests 754 passed | 37 skipped (791)`;472.68s Vitest,479.39s runner, exit0. The37 gated DB/network tests are skipped, not claimed run. MCS anchor check exit0, unchanged `0x6b3312b87d03dc3fca1fae0ae67903bdc6bd63ec74f7cb3452be1a58cedf6433`.

Final targeted31/31pass,4files,153.44sVitest/187.45srunner at10%CPU; test logic/backend denial bytes unchanged by the later UI/copy-only repairs. Full serial workspace typecheck exit0,1264.02s. History/Judge corrections4f95195/a49852d are frozen before the standalone build; Next also checks final web types. Full-build/lint/copy, Chromium screenshots/inspection, transport regression and closing continuity: PENDING. Private evidence `/root/.marque/private/vnext-p10-20261017`, no screenshots or raw API records committed.

Negative cases include wrong chain/owner/account/fork, stale/future supplied state, expired/revoked, exact selector/target/recipient/asset, approval/arbitrary/malformed/trailing calldata, cumulative BigInt cap, unsupported asset calls, grant/execute refusal before SDK/store/RPC/signer, malformed POST refusal and two observational reads with no row update. Even a within-bounds preview returns executionAllowed=false, authority=NONE, unauthenticated snapshot, simulation NOT_RUN and onchain enforcement NOT_PROVEN. Unit supplied revocation is not proof of native onchain revoke. Real wallet execution/simulation/chain enforcement are UNAVAILABLE by design.

## Compatibility, deviations and gates

Intentional409 is a safety restriction of the old unauthenticated operator-funded testnet demo, not a backward-compatible grant success. GET/history and buyer mainnet hire APIs remain; no schema migration or first-party observation rewrite/deletion. Legacy charter revocation capability remains a policy-record anchor, not proven wallet session revocation. Rollback source to P09 only with review of the unsafe writer re-enable risk; no data rollback.

Deviations: native sessions reduced to read-only preview per P10; no fake grant or real-wallet success claim. Historical category templates are proposed testnet operations, not enabled native/token actions. A future native implementation must prove deployed code/version, account control, exact call/asset/recipient/lifetime caps, simulation/freshness/TOCTOU and revoke effectiveness before another authority review.

Chain/environment: proposed BSC56/97 in deterministic tests, historical records97, existing fee hire56 unchanged; actor/human/funding independence UNKNOWN. Mainnet state changes NONE; testnet writes NONE; paid/provider tasks NONE; wallet/key/session NONE; production deployment NONE; git push NONE; database writes NONE. No production release/new authority is approved. Final phase status PENDING until all evidence closes.
