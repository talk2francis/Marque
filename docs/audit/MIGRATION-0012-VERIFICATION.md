# Migration 0012 verification

Verified 2026-09-21 against the isolated local database
`marque_release_verify_20260921`. The live `marque` database was not modified.

## Method

1. Reconstructed migrations `0000` through `0011` in the candidate database.
2. Inserted synthetic pre-0012 probe, conformance, run and receipt observations.
   These are migration fixtures, not marketplace or interoperability evidence.
3. Fingerprinted and read back all immutable payload/hash fields.
4. Applied `0012_capability_evidence.sql` inside one transaction.
5. Verified columns, defaults, nullability, indexes and receipt classification.
6. Attempted the raw migration again to verify it fails closed and rolls back.

## Result

- No rows were deleted: probe 1, conformance result 1, run 3, receipt 3 before
  and after.
- Existing probe details, run tasks/results/failures, receipt bodies/hashes and
  conformance request/response hashes were preserved exactly.
- Legacy probe rows receive `task_kinds=[]`; protocol version and manifest stay
  null rather than being inferred.
- Legacy receipts are classified from their immutable body: failed execution →
  `failure`, genuinely settled → `settlement`, otherwise `execution`.
- `artifact_type` and `task_kinds` are non-null with safe defaults after the
  backfill. New run evidence columns are nullable for historical compatibility.
- Indexes exist as `(service_id, checked_at DESC)`, `(service_id, started_at
  DESC)` and `(correlation_id)`.
- Direct SQL replay fails with PostgreSQL `42701` on the first duplicate column;
  the transaction leaves the migrated state unchanged. Normal idempotency is
  provided by Drizzle's migration journal, not `IF NOT EXISTS` clauses.

## Recovery

Do not drop the new columns after they contain observations. Before a future
production application, take a database backup and verify restoration. If the
migration transaction fails, retain the original schema and repair forward.
The non-concurrent index builds can briefly lock their tables, so production
application requires a separately approved maintenance window and query/load
assessment. This verification does not authorize that application.

## Repository gates after migration verification

- Tests: 260 passed; 3 explicitly network-gated tests skipped.
- Typecheck: all 18 workspace projects passed.
- Lint: passed with zero warnings.
- Production build: passed. Existing optional wallet-connector dependency
  warnings remain visible and are not treated as failures.
