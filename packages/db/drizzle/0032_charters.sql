SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Charters, kind 1 (Loan Guard). Additive only: no existing table, row or observation is touched.
-- DERIVED (rebuildable from chain): charter_guard, charter_guard_event, charter_watch_key.
-- FIRST-PARTY (measured, never deleted): charter_guard_sample, charter_attempt.
CREATE TABLE IF NOT EXISTS "charter_guard" (
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "owner" text NOT NULL,
  "v_debt" text NOT NULL,
  "token" text NOT NULL,
  "trigger" numeric(78, 0) NOT NULL,
  "target" numeric(78, 0) NOT NULL,
  "budget" numeric(78, 0) NOT NULL,
  "tip" numeric(78, 0) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_block" bigint NOT NULL,
  "created_tx" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "spent" numeric(78, 0) DEFAULT '0' NOT NULL,
  "acts" integer DEFAULT 0 NOT NULL,
  "ended_at" timestamp with time zone,
  "ended_tx" text,
  "final" boolean DEFAULT false NOT NULL,
  CONSTRAINT "charter_guard_pk" PRIMARY KEY ("chain_id", "address")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_guard_owner_idx" ON "charter_guard" ("chain_id", "owner");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charter_guard_event" (
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "kind" text NOT NULL,
  "block_number" bigint NOT NULL,
  "block_hash" text NOT NULL,
  "tx_hash" text NOT NULL,
  "log_index" integer NOT NULL,
  "caller" text,
  "data" jsonb NOT NULL,
  "block_time" timestamp with time zone,
  "final" boolean DEFAULT false NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "charter_guard_event_uq" UNIQUE ("chain_id", "tx_hash", "log_index")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_guard_event_guard_idx" ON "charter_guard_event" ("chain_id", "address", "block_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_guard_event_caller_idx" ON "charter_guard_event" ("chain_id", "caller") WHERE "kind" = 'Acted';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charter_guard_sample" (
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "block_number" bigint NOT NULL,
  "state" smallint NOT NULL,
  "health" numeric(78, 0),
  "debt" numeric(78, 0),
  "available" numeric(78, 0),
  "would_repay" numeric(78, 0),
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "charter_guard_sample_idx" ON "charter_guard_sample" ("chain_id", "address", "read_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charter_attempt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_id" integer NOT NULL,
  "address" text NOT NULL,
  "path" text NOT NULL,
  "status" text NOT NULL,
  "calls_id" text,
  "tx_hash" text,
  "error" text,
  "prepared_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "lease_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- At most one open attempt per guard: the database itself is the lock a second worker would hit.
CREATE UNIQUE INDEX IF NOT EXISTS "charter_attempt_open_uq" ON "charter_attempt" ("chain_id", "address")
  WHERE "status" IN ('prepared', 'sent', 'pending');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "charter_watch_key" (
  "chain_id" integer NOT NULL,
  "guard" text NOT NULL,
  "wallet_address" text NOT NULL,
  "session_public_key" text,
  "key_id" text,
  "session" jsonb,
  "expiry" timestamp with time zone NOT NULL,
  "grant_tx" text,
  "revoke_tx" text,
  "registered" boolean DEFAULT false NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_checked_at" timestamp with time zone,
  CONSTRAINT "charter_watch_key_pk" PRIMARY KEY ("chain_id", "guard")
);
