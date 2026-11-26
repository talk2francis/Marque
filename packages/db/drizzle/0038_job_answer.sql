SET LOCAL lock_timeout = '500ms';
--> statement-breakpoint
SET LOCAL statement_timeout = '4s';
--> statement-breakpoint
-- Additive: a new table only. Verified delivered answers, kept so a seller's temporary host going away does not hide them.
CREATE TABLE IF NOT EXISTS "job_answer" (
  "chain_id" integer NOT NULL,
  "job_id" text NOT NULL,
  "hash" text NOT NULL,
  "raw" text NOT NULL,
  "url" text,
  "source" text,
  "hash_algorithm" text DEFAULT 'keccak256' NOT NULL,
  "first_read_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "job_answer_chain_id_job_id_hash_pk" PRIMARY KEY("chain_id","job_id","hash")
);
