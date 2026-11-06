# Local source fingerprint correction, 6 November 2026

This is prepared locally and does not activate a worker or replace an issued result.

The baseline `0e9f5c5` contained fingerprint `0x7f315d9ae44df12d5f0823de5ab3d81bc9a2f842da8c851525cce49c0bdfa55e`. Running the repository's generator in check mode exposed prior drift in adapters.ts, conformance/index.ts, db/schema.ts and probe/schedule.ts; check.ts and lens-checks.ts had become reachable but were absent from the manifest. These changes predate this maintenance batch. The present batch also adds the pinned OpenAPI validator to the development lockfile.

The regenerated fingerprint is `0x3eadaa5da5d5a381d23bd2e80f6af1b67c4af56af9c7dbd997551951171dbd0d`, over the generator's 48-file implementation/import closure. Verify it with `node scripts/generate-mcs-code-anchor.mjs --check`. Its documented scope includes the lockfile and imported workspace code; it is not a deployed-bytecode or issuer attestation.

No grading arithmetic, tolerance, policy, five-minute stale-case guard or historical result was changed to obtain this fingerprint. The standard documents were regenerated with `pnpm standard`, using the existing constants and recorded cases. Historical result bundles keep the fingerprint they originally carried. Do not regenerate or relabel those bundles as though this digest described the code that issued them.

## Authorized release follow-up

The subsequent hardening candidate uses `0x17a8eaecfd0e18ecd511dd30b53780b9db676665049cf082ee02f1ac74942aed` over the same 48-file scope. The differences are concurrent independent Venus reads at the same pinned block, an optional byte-preserving response mode behind the existing SSRF guards, and the explicit importer entry for the already pinned image-raster dependency. Grading arithmetic, tolerances and stale-case policy are unchanged. New reader and binary-guard regressions cover the behavior changes. Existing issued results retain their original fingerprints; no worker is activated by regenerating this file.
