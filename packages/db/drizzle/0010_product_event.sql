CREATE TABLE "product_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE INDEX "product_event_name_at_idx" ON "product_event" USING btree ("name","at" DESC);--> statement-breakpoint
CREATE INDEX "product_event_at_idx" ON "product_event" USING btree ("at" DESC);
