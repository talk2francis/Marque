CREATE TABLE "pool_tick_observation" (
	"id" serial PRIMARY KEY NOT NULL,
	"pool" text NOT NULL,
	"tick" integer NOT NULL,
	"block_number" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pool_watch" (
	"pool" text PRIMARY KEY NOT NULL,
	"fee" integer NOT NULL,
	"token0_symbol" text,
	"token1_symbol" text,
	"reason" text NOT NULL,
	"watching_since" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "pool_tick_pool_time_idx" ON "pool_tick_observation" USING btree ("pool","observed_at");