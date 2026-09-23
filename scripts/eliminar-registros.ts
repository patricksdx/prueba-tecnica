import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta configurar DATABASE_URL.");

const client = postgres(connectionString, { max: 2, connect_timeout: 10 });
try {
	const db = drizzle(client);
	// Orden compatible con las claves foráneas; users se conserva.
	await db.execute(sql`
		TRUNCATE TABLE
			sales_control_entries,
			customer_advances,
			reported_summaries,
			sales_order_lines,
			sales_orders,
			sales_lines,
			products,
			customers,
			sellers,
			import_batches
		RESTART IDENTITY CASCADE
	`);
	console.log(
		"Se eliminaron los registros comerciales normalizados y el historial. Los usuarios se conservaron.",
	);
} finally {
	await client.end();
}
