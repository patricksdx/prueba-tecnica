import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { users } from "./schema";

type ClerkUser = {
	clerkId: string;
	email: string;
	name: string;
};

export async function saveClerkUser(user: ClerkUser) {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error(
			"Falta configurar DATABASE_URL en el entorno del servidor.",
		);
	}
	if (!user.email) {
		throw new Error(
			"La cuenta de Clerk no tiene un correo principal verificado.",
		);
	}

	const client = postgres(connectionString, { max: 1, connect_timeout: 10 });
	try {
		const db = drizzle(client);
		await db.execute(sql`
			CREATE TABLE IF NOT EXISTS users (
				id text PRIMARY KEY,
				clerk_id text NOT NULL UNIQUE,
				email text NOT NULL,
				name text NOT NULL DEFAULT '',
				created_at timestamptz NOT NULL DEFAULT now(),
				updated_at timestamptz NOT NULL DEFAULT now()
			)
		`);
		const [savedUser] = await db
			.insert(users)
			.values({ id: randomUUID(), ...user })
			.onConflictDoUpdate({
				target: users.clerkId,
				set: { email: user.email, name: user.name, updatedAt: new Date() },
			})
			.returning({
				clerkId: users.clerkId,
				email: users.email,
				name: users.name,
			});
		return savedUser;
	} finally {
		await client.end();
	}
}
