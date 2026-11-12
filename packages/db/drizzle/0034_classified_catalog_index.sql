SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Production prepares this same small index CONCURRENTLY before migration
-- registration. No identity, classification or observation is removed.
CREATE INDEX IF NOT EXISTS "agent_category_classified_idx" ON "agent_category" USING btree ("agent_id") WHERE "category" <> 'unclassified';
