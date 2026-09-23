import {
	date,
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
	(table) => [uniqueIndex("users_clerk_id_idx").on(table.clerkId)],
);

export const salesLines = pgTable("sales_lines", {
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
});
