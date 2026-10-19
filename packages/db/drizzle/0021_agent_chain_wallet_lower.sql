-- Matches seller-history joins without scanning the wide registry metadata.
-- Production creates this same additive index CONCURRENTLY first; migration
-- registration is repeatable and never rewrites observations or older entries.
CREATE INDEX IF NOT EXISTS "agent_chain_wallet_lower_idx" ON "agent" USING btree ("chain_id",lower("agent_wallet"));
