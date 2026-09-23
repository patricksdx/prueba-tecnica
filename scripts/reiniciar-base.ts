import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta configurar DATABASE_URL.");

const client = postgres(connectionString, { max: 1, connect_timeout: 10 });
try {
	// Las migraciones iniciales deben aplicarse sobre una base sin estas tablas.
	// El historial de Drizzle también se borra para poder aplicarlas desde cero.
	await client.begin(async (sql) => {
		await sql`DROP TABLE IF EXISTS
			sales_control_entries,
			customer_advances,
			reported_summaries,
			sales_order_lines,
			sales_orders,
			sales_lines,
			products,
			customers,
			sellers,
			import_batches,
			users`;
		const [{ exists }] = await sql<{ exists: string | null }[]>`
			SELECT to_regclass('drizzle.__drizzle_migrations')::text AS exists
		`;
		if (exists) await sql`DROP TABLE drizzle.__drizzle_migrations`;
	});
	console.log(
		"Tablas y migraciones anteriores eliminadas. Aplicando migraciones...",
	);
} finally {
	await client.end();
}
