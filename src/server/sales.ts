import { randomUUID } from "node:crypto";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type {
	AdvanceDto,
	DashboardOrder,
	MonthSales,
	OrderLineDetail,
	ProductSummary,
	ReconciliationDiff,
	ReconciliationDto,
	ReportedSummaryDto,
	SalesDashboardDto,
	SellerOption,
	SellerSummary,
} from "../types/sales";
import {
	customerAdvances,
	reportedSummaries,
	salesLines,
	salesOrderLines,
	salesOrders,
	sellers,
	users,
} from "./schema";
import type { AppRole } from "./users";

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

type RawRow = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

async function legacyDashboard(
	db: ReturnType<typeof drizzle>,
	user: NonNullable<Awaited<ReturnType<typeof syncCurrentUser>>>,
): Promise<SalesDashboardDto> {
	const rows = await db
		.select()
		.from(salesLines)
		.orderBy(desc(salesLines.orderDate));
	const completed = rows.filter((row) => row.status === "Completada");
	const months: MonthSales[] = Array.from({ length: 12 }, (_, index) => ({
		month: monthNames[index],
		sales: 0,
		units: 0,
	}));
	const products = new Map<string, ProductSummary>();
	const sellerMap = new Map<string, SellerSummary & { set: Set<string> }>();
	const orders = new Map<string, DashboardOrder>();
	for (const row of rows) {
		const existing = orders.get(row.orderNo);
		if (existing) {
			existing.total += row.total;
			existing.count += 1;
			if (!existing.customer && row.customer) existing.customer = row.customer;
		} else {
			orders.set(row.orderNo, {
				orderNo: row.orderNo,
				date: row.orderDate,
				customer: row.customer,
				seller: row.seller,
				status: row.status,
				total: row.total,
				channel: row.channel,
				count: 1,
				payment: row.payment,
				district: row.district,
			});
		}
	}
	for (const row of completed) {
		const monthIndex = Number(row.orderDate.slice(5, 7)) - 1;
		if (monthIndex >= 0 && monthIndex < 12) {
			months[monthIndex].sales += row.total;
			months[monthIndex].units += row.quantity;
		}
		const key = row.sku || "(sin sku)";
		const product = products.get(key) ?? {
			sku: key,
			product: row.product || key,
			quantity: 0,
			sales: 0,
		};
		product.quantity += row.quantity;
		product.sales += row.total;
		products.set(key, product);
		const seller = sellerMap.get(row.seller) ?? {
			name: row.seller,
			sales: 0,
			orders: 0,
			set: new Set<string>(),
		};
		seller.sales += row.total;
		seller.set.add(row.orderNo);
		sellerMap.set(row.seller, seller);
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
		sellers: [...sellerMap.values()]
			.map(({ set, ...seller }) => ({ ...seller, orders: set.size }))
			.sort((a, b) => b.sales - a.sales),
		sellerOptions: await db
			.select({ id: sellers.id, name: sellers.name })
			.from(sellers)
			.orderBy(sellers.name),
		orders: [...orders.values()].sort((a, b) => b.date.localeCompare(a.date)),
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
		reconciliation: {
			matched: 0,
			onlyControl: 0,
			onlyDetail: 0,
			cancelledControl: 0,
			amountDiffs: [],
			advances: [],
			summaries: [],
		},
	};
}

export async function fetchSalesDashboard(): Promise<SalesDashboardDto> {
	const user = await syncCurrentUser();
	if (!user) throw new Error("Sin sesión.");
	if (!user.role) throw new Error("Sin rol.");
	return withDatabase(async (db) => {
		const [{ value: orderCount }] = await db
			.select({ value: count() })
			.from(salesOrders);
		if (orderCount === 0) return legacyDashboard(db, user);

		const months: MonthSales[] = Array.from({ length: 12 }, (_, index) => ({
			month: monthNames[index],
			sales: 0,
			units: 0,
		}));

		const metricRows = (await db.execute(sql`
			SELECT
				COALESCE(SUM(CASE WHEN o.status = 'Completada' THEN l.line_total_cents ELSE 0 END), 0)::int AS sales,
				COALESCE(SUM(CASE WHEN o.status = 'Completada' THEN l.quantity ELSE 0 END), 0)::int AS units,
				COUNT(DISTINCT CASE WHEN o.status = 'Completada' THEN o.id END)::int AS completed_orders
			FROM sales_orders o
			LEFT JOIN sales_order_lines l ON l.order_id = o.id
		`)) as unknown as RawRow[];

		const monthRows = (await db.execute(sql`
			SELECT TO_CHAR(o.order_date, 'YYYY-MM') AS ym,
				COALESCE(SUM(l.line_total_cents), 0)::int AS sales,
				COALESCE(SUM(l.quantity), 0)::int AS units
			FROM sales_orders o
			JOIN sales_order_lines l ON l.order_id = o.id
			WHERE o.status = 'Completada'
			GROUP BY 1
		`)) as unknown as RawRow[];
		for (const r of monthRows) {
			const ym = String(r.ym ?? "");
			const m = Number(ym.slice(5, 7)) - 1;
			if (m >= 0 && m < 12) {
				months[m].sales += num(r.sales);
				months[m].units += num(r.units);
			}
		}

		const productRows = (await db.execute(sql`
			SELECT COALESCE(NULLIF(l.sku_normalized, ''), NULLIF(l.sku_raw, ''), '(sin sku)') AS sku,
				MAX(COALESCE(p.canonical_name, NULLIF(l.description, ''), '(sin nombre)')) AS product,
				COALESCE(SUM(l.quantity), 0)::int AS quantity,
				COALESCE(SUM(l.line_total_cents), 0)::int AS sales
			FROM sales_order_lines l
			JOIN sales_orders o ON o.id = l.order_id
			LEFT JOIN products p ON p.id = l.product_id
			WHERE o.status = 'Completada'
			GROUP BY 1
			ORDER BY quantity DESC
			LIMIT 10
		`)) as unknown as RawRow[];
		const products: ProductSummary[] = productRows.map((r) => ({
			sku: String(r.sku),
			product: String(r.product),
			quantity: num(r.quantity),
			sales: num(r.sales),
		}));

		const sellerRows = (await db.execute(sql`
			SELECT COALESCE(s.name, 'Sin vendedor') AS name,
				COALESCE(SUM(l.line_total_cents), 0)::int AS sales,
				COUNT(DISTINCT o.id)::int AS orders
			FROM sales_orders o
			LEFT JOIN sellers s ON s.id = o.seller_id
			LEFT JOIN sales_order_lines l ON l.order_id = o.id
			WHERE o.status = 'Completada'
			GROUP BY 1
			ORDER BY sales DESC
		`)) as unknown as RawRow[];
		const sellerList: SellerSummary[] = sellerRows.map((r) => ({
			name: String(r.name),
			sales: num(r.sales),
			orders: num(r.orders),
		}));
		const sellerOptions: SellerOption[] = await db
			.select({ id: sellers.id, name: sellers.name })
			.from(sellers)
			.orderBy(sellers.name);

		const orderRows = (await db.execute(sql`
			SELECT o.external_no AS order_no, o.order_date AS date,
				COALESCE(o.customer_name, '') AS customer,
				COALESCE(s.name, 'Sin vendedor') AS seller,
				COALESCE(o.status, '') AS status,
				COALESCE(ot.total, 0)::int AS total,
				COALESCE(o.channel, '') AS channel,
				COALESCE(ot.cnt, 0)::int AS count,
				COALESCE(o.payment, '') AS payment,
				COALESCE(o.district, '') AS district
			FROM sales_orders o
			LEFT JOIN sellers s ON s.id = o.seller_id
			LEFT JOIN (
				SELECT order_id, SUM(line_total_cents) AS total, COUNT(*) AS cnt,
					MIN(line_no) AS first_line
				FROM sales_order_lines GROUP BY order_id
			) ot ON ot.order_id = o.id
			ORDER BY o.order_date DESC, o.external_no DESC
			LIMIT 5000
		`)) as unknown as RawRow[];
		const orders: DashboardOrder[] = orderRows.map((r) => ({
			orderNo: String(r.order_no),
			date: String(r.date),
			customer: String(r.customer ?? ""),
			seller: String(r.seller ?? ""),
			status: String(r.status ?? ""),
			total: num(r.total),
			channel: String(r.channel ?? ""),
			count: num(r.count),
			payment: String(r.payment ?? ""),
			district: String(r.district ?? ""),
		}));

		// Conciliación: Detalle manda; Control solo compara.
		const reconRows = (await db.execute(sql`
			SELECT
				(SELECT COUNT(*)::int FROM sales_control_entries WHERE order_id IS NOT NULL) AS matched,
				(SELECT COUNT(*)::int FROM sales_control_entries WHERE order_id IS NULL AND normalized_no IS NOT NULL) AS only_control,
				(SELECT COUNT(*)::int FROM sales_orders o WHERE NOT EXISTS (
					SELECT 1 FROM sales_control_entries c WHERE c.normalized_no = o.normalized_no
				)) AS only_detail,
				(SELECT COUNT(*)::int FROM sales_control_entries WHERE normalized_status = 'cancelled') AS cancelled
		`)) as unknown as RawRow[];
		const recon = reconRows[0] ?? {};

		const diffRows = (await db.execute(sql`
			SELECT o.external_no AS order_no,
				COALESCE(s.name, 'Sin vendedor') AS seller,
				o.order_date AS date,
				c.amount_cents AS control_amount,
				COALESCE(ot.total, 0)::int AS detail_total,
				COALESCE(c.raw_status, '') AS status
			FROM sales_control_entries c
			JOIN sales_orders o ON o.id = c.order_id
			LEFT JOIN sellers s ON s.id = o.seller_id
			LEFT JOIN (
				SELECT order_id, SUM(line_total_cents) AS total
				FROM sales_order_lines GROUP BY order_id
			) ot ON ot.order_id = o.id
			WHERE c.amount_cents IS NOT NULL
				AND ot.total IS NOT NULL
				AND c.amount_cents != ot.total
			ORDER BY o.order_date DESC
			LIMIT 100
		`)) as unknown as RawRow[];
		const amountDiffs: ReconciliationDiff[] = diffRows.map((r) => ({
			orderNo: String(r.order_no),
			seller: String(r.seller ?? ""),
			date: String(r.date ?? ""),
			controlAmount: r.control_amount == null ? null : num(r.control_amount),
			detailTotal: num(r.detail_total),
			status: String(r.status ?? ""),
		}));

		const advRows = await db
			.select({
				document: customerAdvances.documentRaw,
				customer: customerAdvances.customerRaw,
				advance: customerAdvances.advanceCents,
				outstanding: customerAdvances.outstandingCents,
				note: customerAdvances.note,
			})
			.from(customerAdvances)
			.orderBy(customerAdvances.sourceRow)
			.limit(100);
		const advances: AdvanceDto[] = advRows.map((r) => ({
			document: r.document ?? "",
			customer: r.customer ?? "",
			advance: r.advance,
			outstanding: r.outstanding,
			note: r.note ?? "",
		}));

		const sumRows = await db
			.select({
				kind: reportedSummaries.kind,
				period: reportedSummaries.period,
				orders: reportedSummaries.reportedOrders,
				total: reportedSummaries.reportedTotalCents,
				label: reportedSummaries.rawLabel,
				sheet: reportedSummaries.sourceSheet,
			})
			.from(reportedSummaries)
			.orderBy(reportedSummaries.sourceSheet, reportedSummaries.sourceRow)
			.limit(200);
		const summaries: ReportedSummaryDto[] = sumRows.map((r) => ({
			kind: r.kind,
			period: r.period ?? "",
			orders: r.orders,
			total: r.total,
			label: r.label ?? "",
			sheet: r.sheet ?? "",
		}));

		const reconciliation: ReconciliationDto = {
			matched: num(recon.matched),
			onlyControl: num(recon.only_control),
			onlyDetail: num(recon.only_detail),
			cancelledControl: num(recon.cancelled),
			amountDiffs,
			advances,
			summaries,
		};

		const m = metricRows[0] ?? {};
		return {
			user,
			totalSales: num(m.sales),
			completedOrders: num(m.completed_orders),
			unitsSold: num(m.units),
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
			products,
			sellers: sellerList,
			sellerOptions,
			orders,
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
			reconciliation,
		};
	});
}

export async function assignOrderSeller(
	orderNo: string,
	sellerId: string,
): Promise<{ orderNo: string; seller: string }> {
	return withDatabase(async (db) => {
		const [seller] = await db
			.select({ id: sellers.id, name: sellers.name })
			.from(sellers)
			.where(eq(sellers.id, sellerId))
			.limit(1);
		if (!seller) throw new Error("No se encontró el vendedor.");

		const [updated] = await db
			.update(salesOrders)
			.set({ sellerId: seller.id })
			.where(
				and(
					eq(salesOrders.externalNo, orderNo),
					isNull(salesOrders.sellerId),
				),
			)
			.returning({ orderNo: salesOrders.externalNo });
		if (updated) return { orderNo: updated.orderNo, seller: seller.name };

		const [legacyUpdated] = await db
			.update(salesLines)
			.set({ seller: seller.name })
			.where(eq(salesLines.orderNo, orderNo))
			.returning({ orderNo: salesLines.orderNo });
		if (!legacyUpdated) throw new Error("No se encontró el pedido.");
		return { orderNo: legacyUpdated.orderNo, seller: seller.name };
	});
}

export async function fetchOrderDetails(
	orderNo: string,
): Promise<OrderLineDetail[]> {
	return withDatabase(async (db) => {
		const found = await db
			.select({ id: salesOrders.id })
			.from(salesOrders)
			.where(eq(salesOrders.externalNo, orderNo))
			.limit(1);
		if (found.length) {
			const rows = await db
				.select({
					id: salesOrderLines.id,
					product: salesOrderLines.description,
					skuRaw: salesOrderLines.skuRaw,
					skuNormalized: salesOrderLines.skuNormalized,
					quantity: salesOrderLines.quantity,
					unitPrice: salesOrderLines.unitPrice,
					total: salesOrderLines.lineTotal,
					brand: salesOrderLines.brandSnapshot,
					category: salesOrderLines.categorySnapshot,
				})
				.from(salesOrderLines)
				.where(eq(salesOrderLines.orderId, found[0].id))
				.orderBy(salesOrderLines.lineNo);
			return rows.map((r) => ({
				id: r.id,
				product: r.product || "Producto",
				sku: r.skuNormalized || r.skuRaw || "—",
				quantity: r.quantity,
				unitPrice: r.unitPrice ?? 0,
				total: r.total ?? 0,
				brand: r.brand ?? "",
				category: r.category ?? "",
			}));
		}
		// Fallback histórico.
		const rows = await db
			.select()
			.from(salesLines)
			.where(eq(salesLines.orderNo, orderNo))
			.orderBy(salesLines.sku);
		return rows.map((r) => ({
			id: r.id,
			product: r.product || "Producto",
			sku: r.sku || "—",
			quantity: r.quantity,
			unitPrice: r.unitPrice,
			total: r.total,
			brand: r.brand,
			category: r.category,
		}));
	});
}
