import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { asc, count, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as XLSX from "xlsx";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { salesLines, users } from "./schema";

export type AppRole = "admin" | "reader";
type ImportedSale = typeof salesLines.$inferInsert;

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
		await ensureSchema(db);
		await importSalesWhenEmpty(db);
		return await work(db);
	} finally {
		await client.end();
	}
}

async function ensureSchema(db: ReturnType<typeof drizzle>) {
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

function asText(value: unknown): string {
	return value == null ? "" : String(value).trim();
}

function asNumber(value: unknown): number {
	const parsed =
		typeof value === "number"
			? value
			: Number(String(value ?? "").replace(/,/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: unknown): string {
	if (value instanceof Date && !Number.isNaN(value.valueOf()))
		return value.toISOString().slice(0, 10);
	if (typeof value === "number")
		return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000)
			.toISOString()
			.slice(0, 10);
	const parsed = new Date(String(value));
	return Number.isNaN(parsed.valueOf())
		? "2026-01-01"
		: parsed.toISOString().slice(0, 10);
}

async function parseSalesWorkbook(): Promise<ImportedSale[]> {
	// The source workbook stays on the server; never expose it through Vite's public assets.
	const workbookPath = resolve(
		process.cwd(),
		"src/assets/detalle_pedidos_2026.xlsx",
	);
	const workbook = XLSX.read(await readFile(workbookPath), {
		type: "buffer",
		cellDates: true,
	});
	const sheet = workbook.Sheets.Detalle;
	if (!sheet)
		throw new Error("No se encontró la pestaña Detalle del Excel de pedidos.");
	const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
		defval: "",
	});
	return rows.flatMap((row, index) => {
		const orderNo = asText(row.pedido);
		if (!orderNo) return [];
		return [
			{
				id: `${orderNo}:${index}`,
				orderNo,
				orderDate: asDate(row.fecha),
				seller: asText(row.vendedor) || "Sin vendedor",
				sellerCode: asText(row.codigo),
				customer: asText(row.cliente),
				channel: asText(row.canal),
				status: asText(row.estado),
				sku: asText(row.sku),
				product: asText(row.producto),
				brand: asText(row.marca),
				category: asText(row.categoria),
				quantity: Math.round(asNumber(row.cantidad)),
				unitPrice: Math.round(asNumber(row.precio_unit) * 100),
				total: Math.round(asNumber(row.total_pen) * 100),
				payment: asText(row.medio_pago),
				district: asText(row.distrito),
			},
		];
	});
}

async function importSalesWhenEmpty(db: ReturnType<typeof drizzle>) {
	const [{ value }] = await db.select({ value: count() }).from(salesLines);
	if (value > 0) return;
	const rows = await parseSalesWorkbook();
	for (let offset = 0; offset < rows.length; offset += 400) {
		await db
			.insert(salesLines)
			.values(rows.slice(offset, offset + 400))
			.onConflictDoNothing();
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
				completedOrders: [...orders.values()].filter((order) => order.status === "Completada").length,
				unitsSold: completed.reduce((sum, row) => sum + row.quantity, 0),
				pendingUsers: user.role === "admin"
					? (await db.select({ value: count() }).from(users).where(sql`${users.role} IS NULL`))[0].value
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
