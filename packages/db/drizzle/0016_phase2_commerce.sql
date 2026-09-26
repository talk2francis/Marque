CREATE TABLE "agent_alias" (
	"alias" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_cursor" (
	"chain_id" integer NOT NULL,
	"contract" text NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chain_cursor_chain_id_contract_pk" PRIMARY KEY("chain_id","contract")
);
--> statement-breakpoint
CREATE TABLE "commerce_event" (
	"chain_id" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_number" bigint NOT NULL,
	"block_time" timestamp with time zone,
	"contract" text NOT NULL,
	"name" text NOT NULL,
	"job_id" text,
	"args" jsonb NOT NULL,
	CONSTRAINT "commerce_event_chain_id_tx_hash_log_index_pk" PRIMARY KEY("chain_id","tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE "commerce_job" (
	"chain_id" integer NOT NULL,
	"job_id" text NOT NULL,
	"client" text NOT NULL,
	"provider" text NOT NULL,
	"evaluator" text,
	"hook" text,
	"token" text,
	"budget_raw" text,
	"funded_raw" text,
	"expired_at" bigint,
	"deliverable" text,
	"state" text NOT NULL,
	"intent_id" uuid,
	"created_block" bigint,
	"updated_block" bigint,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_job_chain_id_job_id_pk" PRIMARY KEY("chain_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "commerce_quote" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"agent_id" text NOT NULL,
	"service_id" integer,
	"endpoint" text NOT NULL,
	"ok" boolean NOT NULL,
	"failure" text,
	"detail" text,
	"chain_id" integer,
	"provider" text,
	"price_raw" text,
	"token" text,
	"token_symbol" text,
	"token_decimals" integer,
	"quote_expires_at" timestamp with time zone,
	"estimated_completion_seconds" integer,
	"negotiation_hash" text,
	"provider_sig" text,
	"quote_hash" text,
	"latency_ms" integer,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hire_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"agent_id" text NOT NULL,
	"service_id" integer,
	"category" text NOT NULL,
	"chain_id" integer NOT NULL,
	"quote_id" integer NOT NULL,
	"provider" text NOT NULL,
	"token" text NOT NULL,
	"price_raw" text NOT NULL,
	"description" text NOT NULL,
	"description_hash" text NOT NULL,
	"expired_at" bigint NOT NULL,
	"state" text DEFAULT 'intent' NOT NULL,
	"job_id" text,
	"create_tx" text,
	"bind_source" text,
	"client_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bound_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notify_attempt" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"job_id" text NOT NULL,
	"intent_id" uuid,
	"endpoint" text NOT NULL,
	"attempt" integer NOT NULL,
	"ok" boolean NOT NULL,
	"status" text,
	"detail" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating" (
	"chain_id" integer NOT NULL,
	"agent_token_id" text NOT NULL,
	"client" text NOT NULL,
	"feedback_index" text NOT NULL,
	"value" text NOT NULL,
	"value_decimals" integer NOT NULL,
	"tag1" text,
	"tag2" text,
	"endpoint" text,
	"feedback_uri" text,
	"feedback_hash" text,
	"tx_hash" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_time" timestamp with time zone,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "rating_chain_id_agent_token_id_client_feedback_index_pk" PRIMARY KEY("chain_id","agent_token_id","client","feedback_index")
);
--> statement-breakpoint
CREATE TABLE "rating_comment" (
	"feedback_hash" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"job_id" text NOT NULL,
	"agent_token_id" text NOT NULL,
	"client" text NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"canonical" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "commerce_event_job_idx" ON "commerce_event" USING btree ("chain_id","job_id");--> statement-breakpoint
CREATE INDEX "commerce_event_name_idx" ON "commerce_event" USING btree ("chain_id","name","block_number");--> statement-breakpoint
CREATE INDEX "commerce_job_client_idx" ON "commerce_job" USING btree ("client");--> statement-breakpoint
CREATE INDEX "commerce_job_provider_idx" ON "commerce_job" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "commerce_job_intent_idx" ON "commerce_job" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "commerce_quote_agent_created_idx" ON "commerce_quote" USING btree ("agent_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "commerce_quote_service_created_idx" ON "commerce_quote" USING btree ("service_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "commerce_quote_hash_idx" ON "commerce_quote" USING btree ("quote_hash");--> statement-breakpoint
CREATE INDEX "hire_intent_wallet_idx" ON "hire_intent" USING btree ("wallet","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "hire_intent_job_uq" ON "hire_intent" USING btree ("chain_id","job_id");--> statement-breakpoint
CREATE INDEX "hire_intent_desc_idx" ON "hire_intent" USING btree ("description_hash");--> statement-breakpoint
CREATE INDEX "notify_attempt_job_idx" ON "notify_attempt" USING btree ("chain_id","job_id");--> statement-breakpoint
CREATE INDEX "rating_client_idx" ON "rating" USING btree ("client");--> statement-breakpoint
INSERT INTO "agent_alias" ("alias", "chain_id", "token_id") VALUES
  ('marque:bound', 56, '341553'), ('marque:lattice', 56, '341554'), ('marque:sluicegate', 56, '341555'),
  ('marque:keel', 56, '341556'), ('marque:redcell', 56, '341557')
ON CONFLICT ("alias") DO NOTHING;
