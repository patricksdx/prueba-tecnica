CREATE TABLE "customer_advances" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"document_raw" text,
	"customer_raw" text,
	"advance_cents" integer DEFAULT 0 NOT NULL,
	"outstanding_cents" integer DEFAULT 0 NOT NULL,
	"note" text,
	"batch_id" text,
	"source_row" integer
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"document_no" text,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_rejected" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"canonical_name" text,
	"brand" text,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "reported_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"seller_id" text,
	"period" text,
	"reported_orders" integer,
	"reported_total_cents" integer DEFAULT 0 NOT NULL,
	"raw_label" text,
	"batch_id" text,
	"source_sheet" text,
	"source_row" integer
);
--> statement-breakpoint
CREATE TABLE "sales_control_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_date" date NOT NULL,
	"seller_id" text,
	"document_raw" text,
	"customer_id" text,
	"order_id" text,
	"external_raw" text,
	"normalized_no" text,
	"amount_cents" integer,
	"raw_status" text,
	"normalized_status" text DEFAULT 'unknown' NOT NULL,
	"batch_id" text,
	"source_sheet" text,
	"source_row" integer,
	"source_block" text
);
--> statement-breakpoint
CREATE TABLE "sales_order_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" text,
	"sku_raw" text,
	"sku_normalized" text,
	"description" text DEFAULT '' NOT NULL,
	"brand_snapshot" text,
	"category_snapshot" text,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_price_cents" integer,
	"line_total_cents" integer,
	"source_row" integer,
	CONSTRAINT "sales_order_lines_qty_check" CHECK ("sales_order_lines"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"external_no" text NOT NULL,
	"normalized_no" text NOT NULL,
	"order_date" date NOT NULL,
	"seller_id" text,
	"customer_id" text,
	"customer_name" text,
	"channel" text,
	"status" text DEFAULT '' NOT NULL,
	"payment" text,
	"district" text,
	"batch_id" text,
	"source_sheet" text,
	"source_row" integer
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" text PRIMARY KEY NOT NULL,
	"external_code" text,
	"control_name" text,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_advances" ADD CONSTRAINT "customer_advances_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reported_summaries" ADD CONSTRAINT "reported_summaries_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reported_summaries" ADD CONSTRAINT "reported_summaries_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_control_entries" ADD CONSTRAINT "sales_control_entries_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_control_entries" ADD CONSTRAINT "sales_control_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_control_entries" ADD CONSTRAINT "sales_control_entries_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_control_entries" ADD CONSTRAINT "sales_control_entries_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_sales_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_advances_doc_idx" ON "customer_advances" USING btree ("document_raw");--> statement-breakpoint
CREATE INDEX "customers_document_idx" ON "customers" USING btree ("document_no");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_source_sha_idx" ON "import_batches" USING btree ("source_kind","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_idx" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "reported_summaries_kind_idx" ON "reported_summaries" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_control_entry_coord_idx" ON "sales_control_entries" USING btree ("batch_id","source_sheet","source_row","source_block");--> statement-breakpoint
CREATE INDEX "sales_control_entry_norm_idx" ON "sales_control_entries" USING btree ("normalized_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_lines_order_line_idx" ON "sales_order_lines" USING btree ("order_id","line_no");--> statement-breakpoint
CREATE INDEX "sales_order_lines_sku_idx" ON "sales_order_lines" USING btree ("sku_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_external_no_idx" ON "sales_orders" USING btree ("external_no");--> statement-breakpoint
CREATE INDEX "sales_orders_normalized_no_idx" ON "sales_orders" USING btree ("normalized_no");--> statement-breakpoint
CREATE INDEX "sales_orders_status_date_idx" ON "sales_orders" USING btree ("status","order_date");--> statement-breakpoint
CREATE INDEX "sales_orders_seller_date_idx" ON "sales_orders" USING btree ("seller_id","order_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_external_code_idx" ON "sellers" USING btree ("external_code");--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_control_name_idx" ON "sellers" USING btree ("control_name");