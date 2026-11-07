SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Additive only. On production, prepare these concurrently with
-- scripts/prepare-quote-read-indexes.mts before registering this migration.
-- No observation, eligibility predicate or price interpretation changes.
CREATE INDEX IF NOT EXISTS "commerce_quote_service_latest_idx" ON "commerce_quote" USING btree ("service_id", "created_at" DESC NULLS FIRST, "id" DESC NULLS FIRST) WHERE "service_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_quote_agent_read_idx" ON "commerce_quote" USING btree ("agent_id", "created_at" DESC NULLS FIRST, "id" DESC NULLS FIRST, "service_id") WHERE "service_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commerce_quote_agent_ok_idx" ON "commerce_quote" USING btree ("agent_id", "created_at" DESC NULLS FIRST, "id" DESC NULLS FIRST) WHERE "ok" AND "chain_id"::text = split_part("agent_id", ':', 1);
