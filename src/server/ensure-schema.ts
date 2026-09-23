import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

export async function ensureSchema(db: ReturnType<typeof drizzle>) {
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS users (
			id text PRIMARY KEY,
			clerk_id text NOT NULL UNIQUE,
			email text NOT NULL,
			name text NOT NULL DEFAULT '',
			role text CHECK (role IS NULL OR role IN ('admin', 'reader')),
			created_at timestamptz NOT NULL DEFAULT now(),
			updated_at timestamptz NOT NULL DEFAULT now()
		)
	`);
	await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text`);
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS sales_lines (
			id text PRIMARY KEY,
			order_no text NOT NULL,
			order_date date NOT NULL,
			seller text NOT NULL DEFAULT 'Sin vendedor',
			seller_code text NOT NULL DEFAULT '',
			customer text NOT NULL DEFAULT '',
			channel text NOT NULL DEFAULT '',
			status text NOT NULL DEFAULT '',
			sku text NOT NULL DEFAULT '',
			product text NOT NULL DEFAULT '',
			brand text NOT NULL DEFAULT '',
			category text NOT NULL DEFAULT '',
			quantity integer NOT NULL DEFAULT 0,
			unit_price_cents integer NOT NULL DEFAULT 0,
			total_cents integer NOT NULL DEFAULT 0,
			payment text NOT NULL DEFAULT '',
			district text NOT NULL DEFAULT ''
		)
	`);
	await db.execute(
		sql`CREATE INDEX IF NOT EXISTS sales_lines_order_idx ON sales_lines(order_no)`,
	);
	await db.execute(
		sql`CREATE INDEX IF NOT EXISTS sales_lines_status_date_idx ON sales_lines(status, order_date)`,
	);
}
