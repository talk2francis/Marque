SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- V4.4 P1: one read-only check call a day to a listed agent's public free path, its answer read in any layout and its
-- stated chain facts compared with the chain. verdict: agree, wrong, not_comparable, unreadable. Only "wrong" is a
-- fail. The request and response are kept with their hashes, as conformance results are. FIRST-PARTY.
CREATE TABLE IF NOT EXISTS "agent_check" (
	"id" serial PRIMARY KEY,
	"agent_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"category" text,
	"verdict" text NOT NULL,
	"block" text,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text,
	"path" text,
	"request" jsonb,
	"response" jsonb,
	"request_hash" text,
	"response_hash" text,
	"latency_ms" integer,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_check_agent_ran_idx" ON "agent_check" ("agent_id", "ran_at" DESC);
