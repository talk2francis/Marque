ALTER TABLE "benchmark_run" ADD COLUMN "batch" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
CREATE INDEX "benchmark_run_batch_idx" ON "benchmark_run" USING btree ("benchmark_id","arm","batch");--> statement-breakpoint
-- Backfill the two sittings that already exist. They are kept, not deleted:
-- first-party observations are never dropped (invariant 12). Each sitting is
-- named for the block its first repetition read, which is the fact that makes
-- the two non-comparable and is the reason batches exist at all.
UPDATE "benchmark_run" SET "batch" = 'b' || (
  SELECT MIN(r2."block_number") FROM "benchmark_run" r2
  WHERE r2."benchmark_id" = "benchmark_run"."benchmark_id"
    AND r2."arm" = "benchmark_run"."arm"
    AND (r2."id" <= 8) = ("benchmark_run"."id" <= 8)
) WHERE "batch" = 'legacy';
