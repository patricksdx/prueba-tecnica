import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ensureSchema } from "../src/server/ensure-schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta configurar DATABASE_URL.");

const client = postgres(connectionString, { max: 2, connect_timeout: 10 });
try {
	const db = drizzle(client);
	await ensureSchema(db);
	await db.execute(sql`TRUNCATE TABLE sales_lines`);
	console.log("Se eliminaron los registros de ventas. Los usuarios se conservaron.");
} finally {
	await client.end();
}
