CREATE TABLE "builder_listing" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"chain_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"contract_address" text NOT NULL,
	"owner_address" text NOT NULL,
	"proof_message" text NOT NULL,
	"proof_signature" text NOT NULL,
	"proof_nonce" text NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"category" text NOT NULL,
	"service_kind" text NOT NULL,
	"endpoint" text NOT NULL,
	"inputs" text,
	"outputs" text,
	"price" text,
	"conformance_result_id" integer,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "builder_listing_agent_uq" ON "builder_listing" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "builder_listing_owner_idx" ON "builder_listing" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "builder_listing_category_idx" ON "builder_listing" USING btree ("category");--> statement-breakpoint
CREATE INDEX "builder_listing_status_idx" ON "builder_listing" USING btree ("status");