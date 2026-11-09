SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Charters v2, four kinds. Additive only: v1 tables (charter_guard and its events) are untouched.
-- DERIVED (rebuildable from chain): charter_v2, charter_v2_event. FIRST-PARTY (measured, never deleted): charter_v2_sample.
-- charter_attempt and charter_watch_key are shared with v1; watch keys gain the kind and agent they belong to.
CREATE TABLE IF NOT EXISTS "charter_v2" (
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "kind" smallint NOT NULL,
  "version" smallint DEFAULT 2 NOT NULL,
  "factory" text NOT NULL,
  "owner" text NOT NULL,
  "params" jsonb NOT NULL,
  "executors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tip_token" text,
  "tip_per_action" numeric(78, 0) DEFAULT '0' NOT NULL,
  "tip_budget" numeric(78, 0) DEFAULT '0' NOT NULL,
  "tips_paid" numeric(78, 0) DEFAULT '0' NOT NULL,
  "totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actions" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_block" bigint NOT NULL,
  "created_tx" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "ended_tx" text,
  "final" boolean DEFAULT false NOT NULL,
  CONSTRAINT "charter_v2_pk" PRIMARY KEY ("chain_id", "address")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_v2_owner_idx" ON "charter_v2" ("chain_id", "owner");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_v2_kind_idx" ON "charter_v2" ("chain_id", "kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charter_v2_event" (
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "kind" smallint NOT NULL,
  "event" text NOT NULL,
  "block_number" bigint NOT NULL,
  "block_hash" text NOT NULL,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "caller" text,
  "data" jsonb NOT NULL,
  "block_time" timestamp with time zone,
  "final" boolean DEFAULT false NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "charter_v2_event_uq" UNIQUE ("chain_id", "tx_hash", "log_index")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_v2_event_charter_idx" ON "charter_v2_event" ("chain_id", "address", "block_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_v2_event_caller_idx" ON "charter_v2_event" ("chain_id", "caller", "kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charter_v2_sample" (
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "kind" smallint NOT NULL,
  "block_number" bigint NOT NULL,
  "state" smallint NOT NULL,
  "data" jsonb NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_v2_sample_idx" ON "charter_v2_sample" ("chain_id", "address", "read_at");
--> statement-breakpoint
ALTER TABLE "charter_watch_key" ADD COLUMN IF NOT EXISTS "kind" smallint DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "charter_watch_key" ADD COLUMN IF NOT EXISTS "agent" text DEFAULT 'keel' NOT NULL;
--> statement-breakpoint
ALTER TABLE "charter_watch_key" ADD COLUMN IF NOT EXISTS "version" smallint DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "charter_attempt" ADD COLUMN IF NOT EXISTS "sender" text;
