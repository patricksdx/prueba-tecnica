import { randomUUID } from "node:crypto";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { salesLines, users } from "./schema";

export type AppRole = "admin" | "reader";

const monthNames = [
	"Enero",
	"Febrero",
	"Marzo",
	"Abril",
	"Mayo",
	"Junio",
	"Julio",
	"Agosto",
	"Septiembre",
	"Octubre",
	"Noviembre",
	"Diciembre",
];

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
		const user = await syncCurrentUser();
		if (!user) throw redirect({ to: "/" });
		if (!user.role) throw redirect({ to: "/espera" });
		return withDatabase(async (db) => {
			const rows = await db
				.select()
				.from(salesLines)
				.orderBy(desc(salesLines.orderDate));
			const completed = rows.filter((row) => row.status === "Completada");
			const months = Array.from({ length: 12 }, (_, index) => ({
				month: monthNames[index],
				sales: 0,
				units: 0,
			}));
			const products = new Map<
				string,
				{ sku: string; product: string; quantity: number; sales: number }
			>();
			const sellers = new Map<
				string,
				{ name: string; sales: number; orders: Set<string> }
			>();
			const orders = new Map<
				string,
				{
					orderNo: string;
					date: string;
					customer: string;
					seller: string;
					status: string;
					total: number;
					channel: string;
					count: number;
				}
			>();
			for (const row of rows) {
				const cents = row.total;
				const existingOrder = orders.get(row.orderNo);
				if (existingOrder) {
					existingOrder.total += cents;
					existingOrder.count += 1;
					if (!existingOrder.customer && row.customer)
						existingOrder.customer = row.customer;
				} else {
					orders.set(row.orderNo, {
						orderNo: row.orderNo,
						date: row.orderDate,
						customer: row.customer,
						seller: row.seller,
						status: row.status,
						total: cents,
						channel: row.channel,
						count: 1,
					});
				}
			}
			for (const row of completed) {
				const monthIndex = Number(row.orderDate.slice(5, 7)) - 1;
				if (monthIndex >= 0 && monthIndex < 12) {
					months[monthIndex].sales += row.total;
					months[monthIndex].units += row.quantity;
				}
				const product = products.get(row.sku) ?? {
					sku: row.sku,
					product: row.product,
					quantity: 0,
					sales: 0,
				};
				product.quantity += row.quantity;
				product.sales += row.total;
				products.set(row.sku, product);
				const seller = sellers.get(row.seller) ?? {
					name: row.seller,
					sales: 0,
					orders: new Set<string>(),
				};
				seller.sales += row.total;
				seller.orders.add(row.orderNo);
				sellers.set(row.seller, seller);
			}
			return {
				user,
				totalSales: completed.reduce((sum, row) => sum + row.total, 0),
				completedOrders: [...orders.values()].filter(
					(order) => order.status === "Completada",
				).length,
				unitsSold: completed.reduce((sum, row) => sum + row.quantity, 0),
				pendingUsers:
					user.role === "admin"
						? (
								await db
									.select({ value: count() })
									.from(users)
									.where(sql`${users.role} IS NULL`)
							)[0].value
						: 0,
				monthlySales: months,
				products: [...products.values()]
					.sort((a, b) => b.quantity - a.quantity)
					.slice(0, 10),
				sellers: [...sellers.values()]
					.map(({ orders: sellerOrders, ...seller }) => ({
						...seller,
						orders: sellerOrders.size,
					}))
					.sort((a, b) => b.sales - a.sales),
				orders: [...orders.values()].sort((a, b) =>
					b.date.localeCompare(a.date),
				),
				managedUsers:
					user.role === "admin"
						? await db
								.select({
									clerkId: users.clerkId,
									email: users.email,
									name: users.name,
									role: users.role,
									createdAt: users.createdAt,
								})
								.from(users)
								.orderBy(desc(users.createdAt))
						: [],
			};
		});
	},
);

export const getOrderDetails = createServerFn({ method: "GET" })
	.validator((orderNo: string) => orderNo)
	.handler(async ({ data: orderNo }) => {
		const user = await syncCurrentUser();
		if (!user?.role)
			throw new Error("No tienes permisos para consultar pedidos.");
		return withDatabase(async (db) =>
			db
				.select()
				.from(salesLines)
				.where(eq(salesLines.orderNo, orderNo))
				.orderBy(asc(salesLines.sku)),
		);
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
