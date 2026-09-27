CREATE TABLE IF NOT EXISTS "builder_proof" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"chain_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"registry" text NOT NULL,
	"owner_address" text NOT NULL,
	"message" text NOT NULL,
	"signature" text NOT NULL,
	"nonce" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "builder_check" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"kind" text NOT NULL,
	"chain_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"endpoint" text,
	"ok" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "builder_proof_key_idx" ON "builder_proof" USING btree ("agent_key","owner_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "builder_proof_owner_idx" ON "builder_proof" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "builder_check_key_idx" ON "builder_check" USING btree ("agent_key","kind","checked_at");
