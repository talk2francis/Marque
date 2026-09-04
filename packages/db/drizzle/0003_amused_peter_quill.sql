CREATE TABLE "conformance_case" (
	"id" text PRIMARY KEY NOT NULL,
	"test_id" text NOT NULL,
	"category" text NOT NULL,
	"chain_id" integer NOT NULL,
	"block_number" text NOT NULL,
	"subject" jsonb NOT NULL,
	"policy" jsonb NOT NULL,
	"ground_truth" jsonb NOT NULL,
	"ground_truth_hash" text NOT NULL,
	"prompt" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "conformance_case_test_idx" ON "conformance_case" USING btree ("test_id","active");