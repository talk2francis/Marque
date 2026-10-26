SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- V4.2 L0: Marque's chain checks of a delivered answer, pinned to the answer's block. Deterministic, so the first decided
-- result is kept permanently and read before any recompute; an undecided result never replaces it. FIRST-PARTY.
CREATE TABLE IF NOT EXISTS "lens_result" (
	"chain_id" integer NOT NULL,
	"job_id" text NOT NULL,
	"block" text,
	"checks" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	PRIMARY KEY ("chain_id", "job_id")
);
