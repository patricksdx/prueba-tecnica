CREATE TABLE "sales_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_no" text NOT NULL,
	"order_date" date NOT NULL,
	"seller" text DEFAULT 'Sin vendedor' NOT NULL,
	"seller_code" text DEFAULT '' NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"sku" text DEFAULT '' NOT NULL,
	"product" text DEFAULT '' NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"payment" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" IS NULL OR "users"."role" IN ('admin', 'reader'))
);
--> statement-breakpoint
CREATE INDEX "sales_lines_order_idx" ON "sales_lines" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "sales_lines_status_date_idx" ON "sales_lines" USING btree ("status","order_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");