CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"token_id" text NOT NULL,
	"contract_address" text NOT NULL,
	"owner_address" text,
	"name" text,
	"description" text,
	"image_url" text,
	"agent_wallet" text,
	"supported_protocols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"x402_supported" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_metadata" jsonb,
	"scan_health_status" text,
	"scan_health_checked_at" timestamp with time zone,
	"scan_total_score" double precision,
	"scan_parse_status" text,
	"scan_parse_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_endpoint_verified" boolean DEFAULT false NOT NULL,
	"detail_fetched" boolean DEFAULT false NOT NULL,
	"detail_fetched_at" timestamp with time zone,
	"registry_created_at" timestamp with time zone,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_category" (
	"agent_id" text NOT NULL,
	"category" text NOT NULL,
	"confidence" double precision NOT NULL,
	"method" text NOT NULL,
	"rationale" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_category_agent_id_category_pk" PRIMARY KEY("agent_id","category")
);
--> statement-breakpoint
CREATE TABLE "agent_service" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"endpoint" text NOT NULL,
	"version" text,
	"declared_price" text,
	"source" text NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"resolved_endpoint" text,
	"raw" jsonb,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"chain_id" integer NOT NULL,
	"stage" text NOT NULL,
	"count" integer NOT NULL,
	"method" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_cursor" (
	"source" text PRIMARY KEY NOT NULL,
	"cursor" bigint DEFAULT 0 NOT NULL,
	"detail" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probe" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"service_id" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"latency_ms" integer,
	"status_code" integer,
	"failure_class" text,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "agent_category" ADD CONSTRAINT "agent_category_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_service" ADD CONSTRAINT "agent_service_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_chain_token_uq" ON "agent" USING btree ("chain_id","token_id");--> statement-breakpoint
CREATE INDEX "agent_chain_idx" ON "agent" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "agent_owner_idx" ON "agent" USING btree ("owner_address");--> statement-breakpoint
CREATE INDEX "agent_detail_idx" ON "agent" USING btree ("chain_id","detail_fetched");--> statement-breakpoint
CREATE INDEX "agent_category_category_idx" ON "agent_category" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_service_uq" ON "agent_service" USING btree ("agent_id","kind","endpoint");--> statement-breakpoint
CREATE INDEX "agent_service_agent_idx" ON "agent_service" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_service_kind_idx" ON "agent_service" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "funnel_taken_idx" ON "funnel_snapshot" USING btree ("taken_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "funnel_stage_idx" ON "funnel_snapshot" USING btree ("chain_id","stage","taken_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "probe_agent_checked_idx" ON "probe" USING btree ("agent_id","checked_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "probe_checked_idx" ON "probe" USING btree ("checked_at" DESC NULLS LAST);