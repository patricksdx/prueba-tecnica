import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as XLSX from "xlsx";
import {
	customerAdvances,
	customers,
	importBatches,
	products,
	reportedSummaries,
	salesControlEntries,
	salesOrderLines,
	salesOrders,
	sellers,
} from "../src/server/schema";

const DETAIL_PATH = fileURLToPath(
	new URL("../src/assets/detalle_pedidos_2026.xlsx", import.meta.url),
);
const CONTROL_PATH = fileURLToPath(
	new URL("../src/assets/control_ventas_2026.xlsx", import.meta.url),
);

const KNOWN_SELLERS: Record<string, { code: string; name: string }> = {
	BRUNO: { code: "UL5", name: "Aguilar Herrera Bruno" },
	LUCIANA: { code: "UL4", name: "Rojas Chávez Luciana" },
	ALESSANDRA: { code: "UL23", name: "Cruz Huamán Alessandra" },
	THIAGO: { code: "UL24", name: "Mendoza Paredes Thiago" },
	VALERIA: { code: "UL18", name: "Chávez Rojas Valeria" },
	GABRIEL: { code: "UL13", name: "Ríos Pacheco Gabriel" },
};

const MONTHS_ES: Record<string, string> = {
	enero: "01",
	febrero: "02",
	marzo: "03",
	abril: "04",
	mayo: "05",
	junio: "06",
	julio: "07",
	agosto: "08",
	septiembre: "09",
	setiembre: "09",
	octubre: "10",
	noviembre: "11",
	diciembre: "12",
};

const BATCH_SIZE = 500;

type Reject = { source: string; row: number; reason: string };

function asText(value: unknown): string {
	return value == null ? "" : String(value).trim();
}

function sha256Hex(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

/** "S/ 1,252", "1,234.56", 193 -> céntimos. null si vacío y allowEmpty. */
function parseMoneyToCents(
	value: unknown,
	allowEmpty = false,
): { ok: boolean; cents: number | null } {
	if (value == null || String(value).trim() === "") {
		return allowEmpty ? { ok: true, cents: null } : { ok: false, cents: null };
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return { ok: false, cents: null };
		return { ok: true, cents: Math.round(value * 100) };
	}
	let s = String(value).trim().replace(/^s\/?\s*/i, "").replace(/\s+/g, "");
	// "1,252" sin punto decimal es miles; "1,234.56" miles+decimal; "69,90" decimal con coma.
	if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
	else if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
	else if (s.includes(",") && !s.includes(".")) {
		const parts = s.split(",");
		s =
			parts.length === 2 && parts[1].length <= 2
				? parts.join(".")
				: parts.join("");
	}
	const n = Number(s);
	if (!Number.isFinite(n)) return { ok: false, cents: null };
	return { ok: true, cents: Math.round(n * 100) };
}

function parseQuantity(value: unknown): { ok: boolean; qty: number } {
	if (value == null || String(value).trim() === "")
		return { ok: false, qty: 0 };
	const n = typeof value === "number" ? value : Number(String(value).trim());
	if (!Number.isFinite(n) || n < 0) return { ok: false, qty: 0 };
	return { ok: true, qty: Math.round(n) };
}

function parseDateOnly(value: unknown): string | null {
	if (value instanceof Date && !Number.isNaN(value.valueOf()))
		return value.toISOString().slice(0, 10);
	if (typeof value === "number" && Number.isFinite(value)) {
		const d = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
		if (Number.isNaN(d.valueOf())) return null;
		return d.toISOString().slice(0, 10);
	}
	if (value == null || String(value).trim() === "") return null;
	// Acepta "2026-01-01" y "2026-01-01 0:00:00".
	const s = String(value).trim().slice(0, 10);
	if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return s;
	const parsed = new Date(String(value));
	if (Number.isNaN(parsed.valueOf())) return null;
	return parsed.toISOString().slice(0, 10);
}

/** Normaliza pedido para conciliación: mayúsculas, sin espacios; "1002762" -> "UP1002762". */
function normalizeOrderNo(raw: string): string {
	const s = raw.trim().toUpperCase().replace(/\s+/g, "");
	if (!s) return "";
	if (/^\d+$/.test(s)) return `UP${s}`;
	return s;
}

function normalizeSku(raw: string): string {
	return raw.trim().replace(/^\/+\s*/, "").trim().toUpperCase();
}

function normalizeControlStatus(raw: string): string {
	const s = raw.trim().toLowerCase();
	if (!s) return "recorded";
	if (s === "anulado") return "cancelled";
	if (s === "cancelo" || s === "canceló" || s === "cancelado")
		return "cancelled";
	return "unknown";
}

// IDs deterministas: la reimportación actualiza en vez de duplicar.
const sellerIdFor = (
	code: string | null,
	name: string | null,
	control: string | null,
): { id: string; name: string } | null => {
	if (code) return { id: `sel-code-${code}`, name: name ?? code };
	if (name) return { id: `sel-name-${name.toUpperCase()}`, name };
	if (control) {
		const known = KNOWN_SELLERS[control];
		return { id: `sel-ctl-${control}`, name: known?.name ?? control };
	}
	return null;
};

async function main() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error("Falta configurar DATABASE_URL.");
	const detailBuf = await readFile(DETAIL_PATH);
	const controlBuf = await readFile(CONTROL_PATH);
	const detailSha = sha256Hex(detailBuf);
	const controlSha = sha256Hex(controlBuf);

	const client = postgres(connectionString, { max: 2, connect_timeout: 10 });
	try {
		const db = drizzle(client);
		const existing = await db
			.select({ kind: importBatches.sourceKind, sha: importBatches.sha256 })
			.from(importBatches);
		const hasDetail = existing.some(
			(r) => r.kind === "order_detail" && r.sha === detailSha,
		);
		const hasControl = existing.some(
			(r) => r.kind === "sales_control" && r.sha === controlSha,
		);

		// ---------- DETALLE ----------
		if (hasDetail) {
			console.log("Detalle: archivo ya importado (mismo sha), se omite.");
		} else {
			const wb = XLSX.read(detailBuf, { type: "buffer", cellDates: true });
			const sheet = wb.Sheets.Detalle;
			if (!sheet) throw new Error("No se encontró la pestaña Detalle.");
			const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
				defval: "",
			});
			type ParsedLine = {
				excelRow: number;
				orderNo: string;
				normalizedNo: string;
				orderDate: string;
				sellerCode: string | null;
				sellerName: string | null;
				customerName: string | null;
				channel: string | null;
				status: string;
				payment: string | null;
				district: string | null;
				skuRaw: string | null;
				skuNorm: string | null;
				description: string;
				brand: string | null;
				category: string | null;
				quantity: number;
				unitPrice: number | null;
				lineTotal: number | null;
			};
			const parsed: ParsedLine[] = [];
			const rejects: Reject[] = [];
			rows.forEach((row, index) => {
				const excelRow = index + 2;
				const orderNo = asText(row.pedido);
				if (!orderNo) {
					rejects.push({ source: "Detalle", row: excelRow, reason: "pedido vacío" });
					return;
				}
				const orderDate = parseDateOnly(row.fecha);
				if (!orderDate) {
					rejects.push({
						source: "Detalle",
						row: excelRow,
						reason: `fecha inválida: ${asText(row.fecha)}`,
					});
					return;
				}
				const qty = parseQuantity(row.cantidad);
				if (!qty.ok) {
					rejects.push({
						source: "Detalle",
						row: excelRow,
						reason: `cantidad inválida: ${asText(row.cantidad)}`,
					});
					return;
				}
				const unit = parseMoneyToCents(row.precio_unit, true);
				if (!unit.ok) {
					rejects.push({
						source: "Detalle",
						row: excelRow,
						reason: `precio_unit inválido: ${asText(row.precio_unit)}`,
					});
					return;
				}
				const tot = parseMoneyToCents(row.total_pen, true);
				if (!tot.ok) {
					rejects.push({
						source: "Detalle",
						row: excelRow,
						reason: `total inválido: ${asText(row.total_pen)}`,
					});
					return;
				}
				const skuRaw = asText(row.sku);
				const skuNorm = skuRaw ? normalizeSku(skuRaw) : "";
				parsed.push({
					excelRow,
					orderNo,
					normalizedNo: normalizeOrderNo(orderNo),
					orderDate,
					sellerCode: asText(row.codigo) || null,
					sellerName: asText(row.vendedor) || null,
					customerName: asText(row.cliente) || null,
					channel: asText(row.canal) || null,
					status: asText(row.estado),
					payment: asText(row.medio_pago) || null,
					district: asText(row.distrito) || null,
					skuRaw: skuRaw || null,
					skuNorm: skuNorm || null,
					description: asText(row.producto),
					brand: asText(row.marca) || null,
					category: asText(row.categoria) || null,
					quantity: qty.qty,
					unitPrice: unit.cents,
					lineTotal: tot.cents,
				});
			});
			console.log(
				`Detalle: parseadas ${parsed.length}, rechazadas ${rejects.length}.`,
			);

			const batchId = randomUUID();
			await db.transaction(async (tx) => {
				await tx.insert(importBatches).values({
					id: batchId,
					sourceKind: "order_detail",
					fileName: "detalle_pedidos_2026.xlsx",
					sha256: detailSha,
					rowsRead: rows.length,
					rowsImported: parsed.length,
					rowsRejected: rejects.length,
				});

				// Sellers (conocidos + detalle).
				const sellerRows = new Map<
					string,
					{ id: string; externalCode: string | null; controlName: string | null; name: string }
				>();
				for (const [control, info] of Object.entries(KNOWN_SELLERS)) {
					sellerRows.set(`sel-code-${info.code}`, {
						id: `sel-code-${info.code}`,
						externalCode: info.code,
						controlName: control,
						name: info.name,
					});
				}
				for (const p of parsed) {
					const s = sellerIdFor(p.sellerCode, p.sellerName, null);
					if (!s || sellerRows.has(s.id)) continue;
					sellerRows.set(s.id, {
						id: s.id,
						externalCode: p.sellerCode,
						controlName: null,
						name: s.name,
					});
				}
				const sellerList = [...sellerRows.values()];
				for (let o = 0; o < sellerList.length; o += BATCH_SIZE) {
					await tx
						.insert(sellers)
						.values(sellerList.slice(o, o + BATCH_SIZE))
						.onConflictDoNothing();
				}
				console.log(`Detalle: vendedores ${sellerList.length}.`);

				// Customers por nombre.
				const customerRows = new Map<string, { id: string; name: string }>();
				for (const p of parsed) {
					if (!p.customerName) continue;
					const id = `cus-n-${p.customerName.toUpperCase()}`;
					if (!customerRows.has(id))
						customerRows.set(id, { id, name: p.customerName });
				}
				const customerList = [...customerRows.values()];
				for (let o = 0; o < customerList.length; o += BATCH_SIZE) {
					await tx
						.insert(customers)
						.values(customerList.slice(o, o + BATCH_SIZE))
						.onConflictDoNothing();
				}
				console.log(`Detalle: clientes ${customerList.length}.`);

				// Products por SKU normalizado.
				const productRows = new Map<
					string,
					{ id: string; sku: string; canonicalName: string | null; brand: string | null; category: string | null }
				>();
				for (const p of parsed) {
					if (!p.skuNorm || productRows.has(`prd-${p.skuNorm}`)) continue;
					productRows.set(`prd-${p.skuNorm}`, {
						id: `prd-${p.skuNorm}`,
						sku: p.skuNorm,
						canonicalName: p.description || null,
						brand: p.brand,
						category: p.category,
					});
				}
				const productList = [...productRows.values()];
				for (let o = 0; o < productList.length; o += BATCH_SIZE) {
					await tx
						.insert(products)
						.values(productList.slice(o, o + BATCH_SIZE))
						.onConflictDoNothing();
				}
				console.log(`Detalle: productos ${productList.length}.`);

				// Orders + lines: line_no secuencial por pedido.
				const lineCounter = new Map<string, number>();
				const orderValues = new Map<string, typeof salesOrders.$inferInsert>();
				const lineValues: typeof salesOrderLines.$inferInsert[] = [];
				for (const p of parsed) {
					if (!orderValues.has(p.orderNo)) {
						const s = sellerIdFor(p.sellerCode, p.sellerName, null);
						orderValues.set(p.orderNo, {
							id: `ord-${p.orderNo}`,
							externalNo: p.orderNo,
							normalizedNo: p.normalizedNo,
							orderDate: p.orderDate,
							sellerId: s?.id ?? null,
							customerId: p.customerName
								? `cus-n-${p.customerName.toUpperCase()}`
								: null,
							customerName: p.customerName,
							channel: p.channel,
							status: p.status,
							payment: p.payment,
							district: p.district,
							batchId,
							sourceSheet: "Detalle",
							sourceRow: p.excelRow,
						});
					}
					const n = (lineCounter.get(p.orderNo) ?? 0) + 1;
					lineCounter.set(p.orderNo, n);
					lineValues.push({
						id: `ord-${p.orderNo}:L${n}`,
						orderId: `ord-${p.orderNo}`,
						lineNo: n,
						productId: p.skuNorm ? `prd-${p.skuNorm}` : null,
						skuRaw: p.skuRaw,
						skuNormalized: p.skuNorm,
						description: p.description,
						brandSnapshot: p.brand,
						categorySnapshot: p.category,
						quantity: p.quantity,
						unitPrice: p.unitPrice,
						lineTotal: p.lineTotal,
						sourceRow: p.excelRow,
					});
				}
				const orderList = [...orderValues.values()];
				for (let o = 0; o < orderList.length; o += BATCH_SIZE) {
					await tx
						.insert(salesOrders)
						.values(orderList.slice(o, o + BATCH_SIZE))
						.onConflictDoUpdate({
							target: salesOrders.externalNo,
							set: {
								orderDate: sql`excluded.order_date`,
								sellerId: sql`excluded.seller_id`,
								customerId: sql`excluded.customer_id`,
								customerName: sql`excluded.customer_name`,
								channel: sql`excluded.channel`,
								status: sql`excluded.status`,
								payment: sql`excluded.payment`,
								district: sql`excluded.district`,
								batchId: sql`excluded.batch_id`,
								sourceRow: sql`excluded.source_row`,
							},
						});
					if (o % 2000 === 0)
						console.log(`Detalle: pedidos ${Math.min(o + BATCH_SIZE, orderList.length)}/${orderList.length}.`);
				}
				for (let o = 0; o < lineValues.length; o += BATCH_SIZE) {
					await tx
						.insert(salesOrderLines)
						.values(lineValues.slice(o, o + BATCH_SIZE))
						.onConflictDoUpdate({
							target: [salesOrderLines.orderId, salesOrderLines.lineNo],
							set: {
								productId: sql`excluded.product_id`,
								skuRaw: sql`excluded.sku_raw`,
								skuNormalized: sql`excluded.sku_normalized`,
								description: sql`excluded.description`,
								brandSnapshot: sql`excluded.brand_snapshot`,
								categorySnapshot: sql`excluded.category_snapshot`,
								quantity: sql`excluded.quantity`,
								unitPrice: sql`excluded.unit_price_cents`,
								lineTotal: sql`excluded.line_total_cents`,
								sourceRow: sql`excluded.source_row`,
							},
						});
					if (o % 2000 === 0)
						console.log(`Detalle: líneas ${Math.min(o + BATCH_SIZE, lineValues.length)}/${lineValues.length}.`);
				}

				// Resumen declarado -> reported_summaries (reemplaza versión anterior).
				await tx.delete(reportedSummaries).where(
					sql`${reportedSummaries.kind} IN ('detail_seller', 'detail_grand_total')`,
				);
				const resumenSheet = wb.Sheets.Resumen;
				if (resumenSheet) {
					const grid = XLSX.utils.sheet_to_json<unknown[]>(resumenSheet, {
						header: 1,
						defval: "",
					});
					const toInsert: typeof reportedSummaries.$inferInsert[] = [];
					for (let i = 1; i < grid.length; i++) {
						const r = grid[i];
						const label = asText(r[0]);
						if (!label) continue;
						if (/^total$/i.test(label)) {
							const t = parseMoneyToCents(r[3] ?? r[1], true);
							toInsert.push({
								id: randomUUID(),
								kind: "detail_grand_total",
								period: "2026",
								reportedTotalCents: t.cents ?? 0,
								rawLabel: label,
								batchId,
								sourceSheet: "Resumen",
								sourceRow: i + 1,
							});
							continue;
						}
						const cnt = parseQuantity(r[2]);
						const tot = parseMoneyToCents(r[3], true);
						toInsert.push({
							id: randomUUID(),
							kind: "detail_seller",
							period: "2026",
							reportedOrders: cnt.ok ? cnt.qty : null,
							reportedTotalCents: tot.cents ?? 0,
							rawLabel: `${label} | ${asText(r[1])}`,
							batchId,
							sourceSheet: "Resumen",
							sourceRow: i + 1,
						});
					}
					if (toInsert.length) await tx.insert(reportedSummaries).values(toInsert);
				}
			});
			console.log(
				`Detalle OK: pedidos ${new Set(parsed.map((p) => p.orderNo)).size}, líneas ${parsed.length}.`,
			);
			for (const r of rejects.slice(0, 20))
				console.log(`  Rechazada Detalle fila ${r.row}: ${r.reason}`);
		}

		// ---------- CONTROL ----------
		if (hasControl) {
			console.log("Control: archivo ya importado (mismo sha), se omite.");
		} else {
			const wb = XLSX.read(controlBuf, { type: "buffer", cellDates: true });
			const batchId = randomUUID();
			await db.transaction(async (tx) => {
				await tx.insert(importBatches).values({
					id: batchId,
					sourceKind: "sales_control",
					fileName: "control_ventas_2026.xlsx",
					sha256: controlSha,
					rowsRead: 0,
					rowsImported: 0,
					rowsRejected: 0,
				});

				// Vendedores conocidos (mismo id determinista que en detalle).
				for (const [control, info] of Object.entries(KNOWN_SELLERS)) {
					await tx
						.insert(sellers)
						.values({
							id: `sel-code-${info.code}`,
							externalCode: info.code,
							controlName: control,
							name: info.name,
						})
						.onConflictDoUpdate({
							target: sellers.externalCode,
							set: { controlName: sql`excluded.control_name`, name: sql`excluded.name` },
						});
				}
				const sellerIdByControl = new Map<string, string>(
					Object.entries(KNOWN_SELLERS).map(([c, i]) => [c, `sel-code-${i.code}`]),
				);

				type Entry = typeof salesControlEntries.$inferInsert;
				const entries: Entry[] = [];
				const rejects: Reject[] = [];
				let controlRead = 0;
				const customerDocs = new Map<string, { id: string; documentNo: string }>();
				const monthSheets = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO"];
				const BASES = [0, 5, 10, 15, 20, 25];
				for (const sheetName of monthSheets) {
					const sh = wb.Sheets[sheetName];
					if (!sh) continue;
					const grid = XLSX.utils.sheet_to_json<unknown[]>(sh, {
						header: 1,
						defval: "",
					});
					const headerNames = (grid[0] ?? []).map((v) => asText(v).toUpperCase());
					for (const base of BASES) {
						const block = asText(headerNames[base + 1]);
						if (!block) continue;
						let carry: string | null = null;
						for (let i = 3; i < grid.length; i++) {
							const r = grid[i] ?? [];
							const dCell = r[base];
							const dni = asText(r[base + 1]);
							const amtRaw = r[base + 2];
							const ordRaw = asText(r[base + 3]);
							const obs = asText(r[base + 4]);
							if (
								(dCell == null || String(dCell).trim() === "") &&
								!dni &&
								(amtRaw == null || String(amtRaw).trim() === "") &&
								!ordRaw &&
								!obs
							)
								continue;
							controlRead++;
							const excelRow = i + 1;
							const parsedDate = parseDateOnly(dCell);
							if (parsedDate) carry = parsedDate;
							const entryDate = parsedDate ?? carry;
							if (!entryDate) {
								rejects.push({ source: `${sheetName}/${block}`, row: excelRow, reason: "fecha ausente" });
								continue;
							}
							const amt =
								amtRaw == null || String(amtRaw).trim() === ""
									? { ok: true, cents: null as number | null }
									: parseMoneyToCents(amtRaw, true);
							if (!amt.ok) {
								rejects.push({
									source: `${sheetName}/${block}`,
									row: excelRow,
									reason: `importe inválido: ${asText(amtRaw)}`,
								});
								continue;
							}
							if (dni && !customerDocs.has(dni))
								customerDocs.set(dni, { id: `cus-d-${dni}`, documentNo: dni });
							entries.push({
								id: `ctl-${sheetName}-${block}-${excelRow}`,
								entryDate,
								sellerId: sellerIdByControl.get(block) ?? null,
								documentRaw: dni || null,
								customerId: dni ? `cus-d-${dni}` : null,
								externalRaw: ordRaw || null,
								normalizedNo: ordRaw ? normalizeOrderNo(ordRaw) : null,
								amountCents: amt.cents,
								rawStatus: obs || null,
								normalizedStatus: normalizeControlStatus(obs),
								batchId,
								sourceSheet: sheetName,
								sourceRow: excelRow,
								sourceBlock: block,
							});
						}
					}
				}
				console.log(`Control: entradas parseadas ${entries.length} (leídas ${controlRead}).`);

				const docList = [...customerDocs.values()];
				for (let o = 0; o < docList.length; o += BATCH_SIZE) {
					await tx
						.insert(customers)
						.values(docList.slice(o, o + BATCH_SIZE).map((d) => ({ id: d.id, documentNo: d.documentNo })))
						.onConflictDoNothing();
				}

				// Concilia order_id por número normalizado (una sola consulta).
				const orderMap = new Map<string, string>();
				const allOrders = await tx
					.select({ id: salesOrders.id, norm: salesOrders.normalizedNo })
					.from(salesOrders);
				for (const o of allOrders) if (!orderMap.has(o.norm)) orderMap.set(o.norm, o.id);

				// Reemplaza la versión anterior del control (IDs estables).
				await tx.delete(salesControlEntries);
				for (let o = 0; o < entries.length; o += BATCH_SIZE) {
					await tx.insert(salesControlEntries).values(
						entries.slice(o, o + BATCH_SIZE).map((e) => ({
							...e,
							orderId: e.normalizedNo ? (orderMap.get(e.normalizedNo) ?? null) : null,
						})),
					);
					if (o % 2000 === 0)
						console.log(`Control: insertadas ${Math.min(o + BATCH_SIZE, entries.length)}/${entries.length}.`);
				}

				// Totales declarados (reemplaza versión anterior).
				await tx.delete(reportedSummaries).where(
					sql`${reportedSummaries.kind} = 'control_monthly'`,
				);
				const totSheet = wb.Sheets.Totales;
				if (totSheet) {
					const grid = XLSX.utils.sheet_to_json<unknown[]>(totSheet, {
						header: 1,
						defval: "",
					});
					const toInsert: typeof reportedSummaries.$inferInsert[] = [];
					grid.forEach((r, i) => {
						const label = asText(r[0]);
						if (!label) return;
						const val = parseMoneyToCents(r[1], true);
						const m = label.match(/total\s+(?:general\s+)?(\w+)(?:\s+(\w+))?/i);
						const control = m ? m[1].toUpperCase() : null;
						const month = m?.[2]?.toLowerCase();
						toInsert.push({
							id: randomUUID(),
							kind: "control_monthly",
							sellerId: control ? (sellerIdByControl.get(control) ?? null) : null,
							period: month && MONTHS_ES[month] ? `2026-${MONTHS_ES[month]}` : null,
							reportedTotalCents: val.cents ?? 0,
							rawLabel: label,
							batchId,
							sourceSheet: "Totales",
							sourceRow: i + 1,
						});
					});
					if (toInsert.length) await tx.insert(reportedSummaries).values(toInsert);
				}

				// Adelantos (filas anónimas tal cual, sin fill-down; reemplaza anterior).
				await tx.delete(customerAdvances);
				const advSheet = wb.Sheets.Adelanto;
				let advImported = 0;
				if (advSheet) {
					const grid = XLSX.utils.sheet_to_json<unknown[]>(advSheet, {
						header: 1,
						defval: "",
					});
					const toInsert: typeof customerAdvances.$inferInsert[] = [];
					for (let i = 1; i < grid.length; i++) {
						const r = grid[i];
						const dni = asText(r[0]);
						const cli = asText(r[1]);
						const adv = r[2];
						const falta = r[3];
						const obs = asText(r[4]);
						if (
							!dni && !cli &&
							(adv == null || String(adv).trim() === "") &&
							(falta == null || String(falta).trim() === "") &&
							!obs
						)
							continue;
						const a = parseMoneyToCents(adv, true);
						const f = parseMoneyToCents(falta, true);
						if (!a.ok || !f.ok) {
							rejects.push({ source: "Adelanto", row: i + 1, reason: "adelanto/falta inválido" });
							continue;
						}
						if (dni && !customerDocs.has(dni)) {
							customerDocs.set(dni, { id: `cus-d-${dni}`, documentNo: dni });
							await tx
								.insert(customers)
								.values({ id: `cus-d-${dni}`, documentNo: dni, name: cli || null })
								.onConflictDoNothing();
						}
						toInsert.push({
							id: randomUUID(),
							customerId: dni ? `cus-d-${dni}` : null,
							documentRaw: dni || null,
							customerRaw: cli || null,
							advanceCents: a.cents ?? 0,
							outstandingCents: f.cents ?? 0,
							note: obs || null,
							batchId,
							sourceRow: i + 1,
						});
						advImported++;
					}
					if (toInsert.length) await tx.insert(customerAdvances).values(toInsert);
				}
				console.log(`Control OK: entradas ${entries.length}, adelantos ${advImported}, rechazadas ${rejects.length}.`);
				for (const r of rejects.slice(0, 20))
					console.log(`  Rechazada ${r.source} fila ${r.row}: ${r.reason}`);
			});
		}
	} finally {
		await client.end();
	}
}

await main();
