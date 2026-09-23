import { randomUUID } from "node:crypto";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fetchOrderDetails, fetchSalesDashboard } from "./sales";
import { users } from "./schema";

export type AppRole = "admin" | "reader";

async function withDatabase<T>(
	work: (db: ReturnType<typeof drizzle>) => Promise<T>,
) {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("Falta configurar DATABASE_URL.");
	const client = postgres(connectionString, { max: 2, connect_timeout: 10 });
	try {
		const db = drizzle(client);
		return await work(db);
	} finally {
		await client.end();
	}
}

async function syncCurrentUser() {
	const { userId } = await auth();
	if (!userId) return null;
	const clerkUser = await (await clerkClient()).users.getUser(userId);
	const email = clerkUser.primaryEmailAddress?.emailAddress;
	if (!email)
		throw new Error("El usuario de Clerk no tiene un correo principal.");
	const isBootstrapAdmin = (process.env.CLERK_ADMIN_IDS ?? "")
		.split(",")
		.map((id) => id.trim())
		.includes(userId);
	return withDatabase(async (db) => {
		const [saved] = await db
			.insert(users)
			.values({
				id: randomUUID(),
				clerkId: userId,
				email,
				name: [clerkUser.firstName, clerkUser.lastName]
					.filter(Boolean)
					.join(" "),
				role: isBootstrapAdmin ? "admin" : null,
			})
			.onConflictDoUpdate({
				target: users.clerkId,
				set: {
					email,
					name: [clerkUser.firstName, clerkUser.lastName]
						.filter(Boolean)
						.join(" "),
					updatedAt: new Date(),
					...(isBootstrapAdmin ? { role: "admin" } : {}),
				},
			})
			.returning({
				clerkId: users.clerkId,
				email: users.email,
				name: users.name,
				role: users.role,
			});
		return saved as typeof saved & { role: AppRole | null };
	});
}

export const getSessionUser = createServerFn({ method: "GET" }).handler(
	syncCurrentUser,
);

export const getSalesDashboard = createServerFn({ method: "GET" }).handler(
	async () => {
		try {
			return await fetchSalesDashboard();
		} catch (error) {
			if (error instanceof Error && /Sin sesión|Sin rol/.test(error.message))
				throw redirect({
					to: error.message === "Sin sesión" ? "/" : "/espera",
				});
			throw error;
		}
	},
);

export const getOrderDetails = createServerFn({ method: "GET" })
	.validator((orderNo: string) => orderNo)
	.handler(async ({ data: orderNo }) => {
		const user = await syncCurrentUser();
		if (!user?.role)
			throw new Error("No tienes permisos para consultar pedidos.");
		return withDatabase(async () => fetchOrderDetails(orderNo));
	});

export const changeUserRole = createServerFn({ method: "POST" })
	.validator((input: { clerkId: string; role: AppRole | null }) => {
		if (!input.clerkId || !["admin", "reader", null].includes(input.role))
			throw new Error("Rol inválido.");
		return input;
	})
	.handler(async ({ data }) => {
		const currentUser = await syncCurrentUser();
		if (currentUser?.role !== "admin")
			throw new Error("Se requiere el rol de administrador.");
		return withDatabase(async (db) => {
			const [updated] = await db
				.update(users)
				.set({ role: data.role, updatedAt: new Date() })
				.where(eq(users.clerkId, data.clerkId))
				.returning({ clerkId: users.clerkId, role: users.role });
			if (!updated) throw new Error("No se encontró el usuario.");
			return updated;
		});
	});
