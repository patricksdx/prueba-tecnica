import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as XLSX from "xlsx";
import { ensureSchema } from "../src/server/ensure-schema";
import { salesLines } from "../src/server/schema";

type ImportedSale = typeof salesLines.$inferInsert;

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
	const workbookPath = resolve(import.meta.dir, "../src/assets/detalle_pedidos_2026.xlsx");
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

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("Falta configurar DATABASE_URL.");
	const rows = await parseSalesWorkbook();
	const client = postgres(connectionString, { max: 2, connect_timeout: 10 });
	try {
		const db = drizzle(client);
		await ensureSchema(db);
		const inserted = await db.transaction(async (tx) => {
			let total = 0;
			for (let offset = 0; offset < rows.length; offset += 400) {
				const batch = await tx
					.insert(salesLines)
					.values(rows.slice(offset, offset + 400))
					.onConflictDoNothing()
					.returning({ id: salesLines.id });
				total += batch.length;
			}
			return total;
		});
		console.log(`Filas del Excel: ${rows.length}. Registros nuevos: ${inserted}. Ya existentes: ${rows.length - inserted}.`);
	} finally {
		await client.end();
	}
}

await main();
