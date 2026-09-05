CREATE TABLE "charter" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"chain_id" integer NOT NULL,
	"owner_address" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text,
	"status" text NOT NULL,
	"policy" jsonb NOT NULL,
	"policy_hash" text NOT NULL,
	"revoke_hash" text,
	"session_key_address" text,
	"grant_tx_hash" text,
	"revoke_tx_hash" text,
	"verify_url" text,
	"expires_at" timestamp with time zone NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"calls_used" integer DEFAULT 0 NOT NULL,
	"spent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"granted_by" text DEFAULT 'visitor' NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"hash" text NOT NULL,
	"body" jsonb NOT NULL,
	"anchor_tx_hash" text,
	"anchor_block" text,
	"anchored_at" timestamp with time zone,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text,
	"kind" text NOT NULL,
	"category" text NOT NULL,
	"charter_id" text,
	"subject" text NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" text NOT NULL,
	"task" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"stage" text DEFAULT 'quote' NOT NULL,
	"ok" boolean,
	"failure" text,
	"failure_reason" text,
	"fee_usd" double precision,
	"max_spend_usd" double precision NOT NULL,
	"latency_ms" integer,
	"tx_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "run_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"detail" text,
	"tx_hash" text,
	"data" jsonb
);
--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_run_id_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charter_status_idx" ON "charter" USING btree ("status","granted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "charter_owner_idx" ON "charter" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "charter_granted_idx" ON "charter" USING btree ("granted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "receipt_hash_idx" ON "receipt" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "receipt_issued_idx" ON "receipt" USING btree ("issued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "run_started_idx" ON "run" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "run_agent_idx" ON "run" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "run_charter_idx" ON "run" USING btree ("charter_id");--> statement-breakpoint
CREATE INDEX "run_event_run_idx" ON "run_event" USING btree ("run_id","at");