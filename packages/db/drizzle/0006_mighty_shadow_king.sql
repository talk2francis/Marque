CREATE TABLE "benchmark" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text,
	"task" text NOT NULL,
	"task_hash" text NOT NULL,
	"input" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"rubric_version" text NOT NULL,
	"rubric_hash" text NOT NULL,
	"rubric" jsonb NOT NULL,
	"rubric_registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmark_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"benchmark_id" text NOT NULL,
	"arm" text NOT NULL,
	"rep" integer NOT NULL,
	"output" jsonb,
	"output_text" text,
	"output_hash" text NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"timing_method" text NOT NULL,
	"block_number" text NOT NULL,
	"job_id" text,
	"tx_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost_breakdown" jsonb NOT NULL,
	"score_breakdown" jsonb,
	"score_total" double precision,
	"score_out_of" double precision,
	"score_reasons" jsonb,
	"scored_at" timestamp with time zone,
	"scored_blind" boolean DEFAULT false NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_hash" text NOT NULL,
	"evidence_url" text,
	"note" text,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sealed_call" (
	"id" serial PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"agent_id" text NOT NULL,
	"category" text NOT NULL,
	"recommendation" jsonb NOT NULL,
	"subject" text NOT NULL,
	"block_number" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolution_rule" text NOT NULL,
	"resolve_after" timestamp with time zone NOT NULL,
	"seal_tx_hash" text,
	"seal_block" text,
	"sealed_at" timestamp with time zone,
	"chain_id" integer DEFAULT 97 NOT NULL,
	"outcome" text DEFAULT 'unresolved' NOT NULL,
	"resolution_evidence" jsonb,
	"resolved_at" timestamp with time zone,
	"resolved_at_block" text,
	CONSTRAINT "sealed_call_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "benchmark_run" ADD CONSTRAINT "benchmark_run_benchmark_id_benchmark_id_fk" FOREIGN KEY ("benchmark_id") REFERENCES "public"."benchmark"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "benchmark_category_idx" ON "benchmark" USING btree ("category");--> statement-breakpoint
CREATE INDEX "benchmark_run_bench_idx" ON "benchmark_run" USING btree ("benchmark_id","arm","rep");--> statement-breakpoint
CREATE INDEX "benchmark_run_hash_idx" ON "benchmark_run" USING btree ("manifest_hash");--> statement-breakpoint
CREATE INDEX "sealed_call_agent_idx" ON "sealed_call" USING btree ("agent_id","issued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sealed_call_outcome_idx" ON "sealed_call" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "sealed_call_resolve_idx" ON "sealed_call" USING btree ("resolve_after");