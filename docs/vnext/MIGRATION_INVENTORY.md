# Migration inventory

Read-only check on 16 October 2026: all 20 live Drizzle hashes match source. No migration was applied. Existing migration SQL is described, never executed by this audit.

| Source migration | SHA-256 | Live match | Statement kinds |
|---|---|---|---|
| `0000_nosy_omega_red.sql` | `afa89a13352262a69e98c7cc068dd09b100c5a10e624dbe889ca7b9bc1dfff66` | YES | ALTER TABLE, CREATE INDEX, CREATE TABLE, CREATE UNIQUE INDEX |
| `0001_empty_outlaw_kid.sql` | `8c04857947cda45efb14fa494160f778fa68e59f7e3442ea33f0c2820c11cdbb` | YES | ALTER TABLE |
| `0002_tiny_squirrel_girl.sql` | `66bb4f053f789a7ecc031d9e81bbac26c599e7a5f289316f36b0b3897457565e` | YES | CREATE INDEX, CREATE TABLE |
| `0003_amused_peter_quill.sql` | `8ddb42f650d75a1c057169aee118c0fc55c489c8d99f25521705072ebeb00bfe` | YES | CREATE INDEX, CREATE TABLE |
| `0004_moaning_whizzer.sql` | `57ba3a87b308096ae3c9d9e7c431f4b434e0c85d138cc7ee89696538ae20caaa` | YES | ALTER TABLE, CREATE INDEX, CREATE TABLE |
| `0005_normal_sunspot.sql` | `c17f5cd19e4141254057976fee071481bd1a03b87b79ee37ca423ba9a5ab7758` | YES | ALTER TABLE |
| `0006_mighty_shadow_king.sql` | `68315c4e3f8025aca5b552c9d9d6f71ad24589a10a271ae48afb7f5057da1f4a` | YES | ALTER TABLE, CREATE INDEX, CREATE TABLE |
| `0007_slim_ken_ellis.sql` | `bfc9723cccae7161d4c03d0b256df92b1be5c392304b6b4542ad6027b91ea562` | YES | ALTER TABLE, CREATE INDEX, UPDATE |
| `0008_brown_the_watchers.sql` | `0708404431adc7761439aa9d5348870bb1ff5f43a1f105c9e66a314157c4f92f` | YES | CREATE INDEX, CREATE TABLE |
| `0009_military_chronomancer.sql` | `ec6534de5672e032f8e96f9104d7b8542eeeccb250537c99228a7359f2596b69` | YES | CREATE INDEX, CREATE TABLE, CREATE UNIQUE INDEX |
| `0010_product_event.sql` | `07f1579db3a41c1fd17ae8c4a197cc2a3f51ad93f21ec3b1a532b88f2ed47767` | YES | CREATE INDEX, CREATE TABLE |
| `0011_even_synch.sql` | `1f0092dc5e197f30580efad7fd7ef3751d883eeeb1321650217e38f8ff0f8117` | YES | ALTER TABLE, CREATE INDEX, CREATE TABLE |
| `0012_capability_evidence.sql` | `35f963ba18757becd9989c79143c568bf7cf744fec15e8c7aeec9f08c4a5a3f6` | YES | ALTER TABLE, CREATE INDEX, UPDATE |
| `0013_acoustic_black_widow.sql` | `a008b0908360f4b041b6c79ff26cc1913b5582d9114df76fe2c984d4231a9da6` | YES | CREATE INDEX, CREATE TABLE |
| `0014_probe_schedule.sql` | `8aefbef8599ee3a6de8a34d907d998b3acf814ff1d61f2985ee0092d74ea6964` | YES | CREATE INDEX, CREATE TABLE |
| `0015_probe_schedule_last_probe.sql` | `da9ee1a75079005f92b4ae5356d7fe96e33e574d308e17a11fa2541cb7938b33` | YES | ALTER TABLE, UPDATE |
| `0016_phase2_commerce.sql` | `5617c48e0c8e88d7e7dea6021f5d8271381445d5e70033aab30f21fed6be4704` | YES | CREATE INDEX, CREATE TABLE, CREATE UNIQUE INDEX, INSERT INTO |
| `0017_quote_signed.sql` | `d343c8fa7f34365f5fae362aa8c4148e07ab117515605afb45711139c9e0e78f` | YES | ALTER TABLE |
| `0018_agent_wallet_idx.sql` | `2ac147ef26d6263faa88a9fea3d7903e95becbd3e325c8546d3872cb6f9c297b` | YES | CREATE INDEX |
| `0019_builder_checks.sql` | `da4183107f7927da37d8f69bdba77d2c2d10ff4e0c54b8651025b8222ec106f3` | YES | CREATE INDEX, CREATE TABLE |

Canonical tables include derived identity/service/category/cursors and durable observations: probes, conformance cases/results, runs/events/rejections, receipts, builder proofs/checks/listings, benchmark arms/provenance, seals, quotes, intents/notify attempts, commerce events/jobs, ratings/comments and measured pool observations.

Migration 0012 adds capability/service binding and backfills an artifact_type column. That historical script is not authorization to alter historical receipt bodies/hashes. Migration 0016 creates commerce/index/intent/rating tables; 0017 adds nullable quote signed mode; 0018 indexes agent wallet; 0019 creates builder proof/check observations. No reset or new schema is needed for P00.

## Additive production update, 20 October 2026

The dated 16 October inventory above remains historical. Production now has 23 migration rows. The three additional source migrations are:

| Source migration | SHA-256 | Scope |
|---|---|---|
| `0020_probe_service_agent_checked.sql` | `fa6f807d2f229c959d025b5f471c5eb85e568ddabc58da0caedcb1e64da59a45` | Additive index; original observations and prior ledger rows preserved |
| `0021_agent_chain_wallet_lower.sql` | `2980c0e013992a7dc05357ce0240ea8e32c5a48769d66ae5a70dd7ccbda38ea5` | Additive index; original observations and prior ledger rows preserved |
| `0022_probe_manifest_lookup.sql` | `aba1ed611a7a59c49b466b53fe04e7907e1dea66d0c8df4d72a42a199e432fc8` | Additive index; original observations and prior ledger rows preserved |

The 0021 concurrent normalized-wallet index is valid and ready; the failed initial lock-wait attempt and subsequent concurrent repair remain in private operational evidence. The 18 October backup/restore proof predates these additions and is not a new 23-migration restore drill. See the [release audit](./V3_RELEASE_AUDIT.md).


### Builder service incident candidate, 20 October 2026

Additive migration `0023_service_declarations.sql` adds nullable `currently_declared` and `declaration_checked_at` fields to the derived `agent_service` table. It alters no first-party table, existing row ID or historical observation. Candidate fixture verification and production application are reported separately in the incident checkpoint; the 23-row production and older restore statements above are dated evidence, not a claim that this candidate has already deployed.
