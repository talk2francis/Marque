-- Matches the exact identity/service latest-observation lookup, including its
-- ordering. Production builds this same index CONCURRENTLY before migration
-- registration; IF NOT EXISTS makes that operational step repeatable.
CREATE INDEX IF NOT EXISTS "probe_service_agent_checked_idx" ON "probe" USING btree ("service_id","agent_id","checked_at" DESC NULLS LAST);
