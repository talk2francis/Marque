-- Sparse current-manifest discovery avoids fetching failed probe payloads.
-- Production builds this additive index concurrently before migration registration.
CREATE INDEX IF NOT EXISTS "probe_manifest_lookup_idx" ON "probe" USING btree ("id") WHERE "manifest" IS NOT NULL;
