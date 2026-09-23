import { sql } from "drizzle-orm";
import {
	check,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
	"users",
	{
		id: text("id").primaryKey(),
		clerkId: text("clerk_id").notNull(),
		email: text("email").notNull(),
		name: text("name").notNull().default(""),
		role: text("role").$type<"admin" | "reader">(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("users_clerk_id_idx").on(table.clerkId),
		check(
			"users_role_check",
			sql`${table.role} IS NULL OR ${table.role} IN ('admin', 'reader')`,
		),
	],
);

// Tablas de autenticación (users) y dimensión comercial (sellers) son distintas.

export const importBatches = pgTable(
	"import_batches",
	{
		id: text("id").primaryKey(),
		sourceKind: text("source_kind").notNull(),
		fileName: text("file_name").notNull(),
		sha256: text("sha256").notNull(),
		status: text("status").notNull().default("completed"),
		rowsRead: integer("rows_read").notNull().default(0),
		rowsImported: integer("rows_imported").notNull().default(0),
		rowsRejected: integer("rows_rejected").notNull().default(0),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		uniqueIndex("import_batches_source_sha_idx").on(
			table.sourceKind,
			table.sha256,
		),
	],
);

export const sellers = pgTable(
	"sellers",
	{
		id: text("id").primaryKey(),
		externalCode: text("external_code"),
		controlName: text("control_name"),
		name: text("name").notNull(),
	},
	(table) => [
		uniqueIndex("sellers_external_code_idx").on(table.externalCode),
		uniqueIndex("sellers_control_name_idx").on(table.controlName),
	],
);

export const customers = pgTable(
	"customers",
	{
		id: text("id").primaryKey(),
		documentNo: text("document_no"),
		name: text("name"),
	},
	(table) => [index("customers_document_idx").on(table.documentNo)],
);

export const products = pgTable(
	"products",
	{
		id: text("id").primaryKey(),
		sku: text("sku").notNull(),
		canonicalName: text("canonical_name"),
		brand: text("brand"),
		category: text("category"),
	},
	(table) => [uniqueIndex("products_sku_idx").on(table.sku)],
);

export const salesOrders = pgTable(
	"sales_orders",
	{
		id: text("id").primaryKey(),
		externalNo: text("external_no").notNull(),
		normalizedNo: text("normalized_no").notNull(),
		orderDate: date("order_date", { mode: "string" }).notNull(),
		sellerId: text("seller_id").references(() => sellers.id),
		customerId: text("customer_id").references(() => customers.id),
		customerName: text("customer_name"),
		channel: text("channel"),
		status: text("status").notNull().default(""),
		payment: text("payment"),
		district: text("district"),
		batchId: text("batch_id").references(() => importBatches.id),
		sourceSheet: text("source_sheet"),
		sourceRow: integer("source_row"),
	},
	(table) => [
		uniqueIndex("sales_orders_external_no_idx").on(table.externalNo),
		index("sales_orders_normalized_no_idx").on(table.normalizedNo),
		index("sales_orders_status_date_idx").on(table.status, table.orderDate),
		index("sales_orders_seller_date_idx").on(table.sellerId, table.orderDate),
	],
);

export const salesOrderLines = pgTable(
	"sales_order_lines",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => salesOrders.id, { onDelete: "cascade" }),
		lineNo: integer("line_no").notNull(),
		productId: text("product_id").references(() => products.id),
		skuRaw: text("sku_raw"),
		skuNormalized: text("sku_normalized"),
		description: text("description").notNull().default(""),
		brandSnapshot: text("brand_snapshot"),
		categorySnapshot: text("category_snapshot"),
		quantity: integer("quantity").notNull().default(0),
		unitPrice: integer("unit_price_cents"),
		lineTotal: integer("line_total_cents"),
		sourceRow: integer("source_row"),
	},
	(table) => [
		uniqueIndex("sales_order_lines_order_line_idx").on(
			table.orderId,
			table.lineNo,
		),
		index("sales_order_lines_sku_idx").on(table.skuNormalized),
		check("sales_order_lines_qty_check", sql`${table.quantity} >= 0`),
	],
);

export const salesControlEntries = pgTable(
	"sales_control_entries",
	{
		id: text("id").primaryKey(),
		entryDate: date("entry_date", { mode: "string" }).notNull(),
		sellerId: text("seller_id").references(() => sellers.id),
		documentRaw: text("document_raw"),
		customerId: text("customer_id").references(() => customers.id),
		orderId: text("order_id").references(() => salesOrders.id),
		externalRaw: text("external_raw"),
		normalizedNo: text("normalized_no"),
		amountCents: integer("amount_cents"),
		rawStatus: text("raw_status"),
		normalizedStatus: text("normalized_status").notNull().default("unknown"),
		batchId: text("batch_id").references(() => importBatches.id),
		sourceSheet: text("source_sheet"),
		sourceRow: integer("source_row"),
		sourceBlock: text("source_block"),
	},
	(table) => [
		uniqueIndex("sales_control_entry_coord_idx").on(
			table.batchId,
			table.sourceSheet,
			table.sourceRow,
			table.sourceBlock,
		),
		index("sales_control_entry_norm_idx").on(table.normalizedNo),
	],
);

export const customerAdvances = pgTable(
	"customer_advances",
	{
		id: text("id").primaryKey(),
		customerId: text("customer_id").references(() => customers.id),
		documentRaw: text("document_raw"),
		customerRaw: text("customer_raw"),
		advanceCents: integer("advance_cents").notNull().default(0),
		outstandingCents: integer("outstanding_cents").notNull().default(0),
		note: text("note"),
		batchId: text("batch_id").references(() => importBatches.id),
		sourceRow: integer("source_row"),
	},
	(table) => [index("customer_advances_doc_idx").on(table.documentRaw)],
);

export const reportedSummaries = pgTable(
	"reported_summaries",
	{
		id: text("id").primaryKey(),
		kind: text("kind").notNull(),
		sellerId: text("seller_id").references(() => sellers.id),
		period: text("period"),
		reportedOrders: integer("reported_orders"),
		reportedTotalCents: integer("reported_total_cents").notNull().default(0),
		rawLabel: text("raw_label"),
		batchId: text("batch_id").references(() => importBatches.id),
		sourceSheet: text("source_sheet"),
		sourceRow: integer("source_row"),
	},
	(table) => [index("reported_summaries_kind_idx").on(table.kind)],
);

// Tabla histórica denormalizada; se conserva durante la transición.
export const salesLines = pgTable(
	"sales_lines",
	{
		id: text("id").primaryKey(),
		orderNo: text("order_no").notNull(),
		orderDate: date("order_date", { mode: "string" }).notNull(),
		seller: text("seller").notNull().default("Sin vendedor"),
		sellerCode: text("seller_code").notNull().default(""),
		customer: text("customer").notNull().default(""),
		channel: text("channel").notNull().default(""),
		status: text("status").notNull().default(""),
		sku: text("sku").notNull().default(""),
		product: text("product").notNull().default(""),
		brand: text("brand").notNull().default(""),
		category: text("category").notNull().default(""),
		quantity: integer("quantity").notNull().default(0),
		unitPrice: integer("unit_price_cents").notNull().default(0),
		total: integer("total_cents").notNull().default(0),
		payment: text("payment").notNull().default(""),
		district: text("district").notNull().default(""),
	},
	(table) => [
		index("sales_lines_order_idx").on(table.orderNo),
		index("sales_lines_status_date_idx").on(table.status, table.orderDate),
	],
);
