import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
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
		s = parts.length === 2 && parts[1].length <= 2 ? parts.join(".") : parts.join("");
	}
	const n = Number(s);
	if (!Number.isFinite(n)) return { ok: false, cents: null };
	return { ok: true, cents: Math.round(n * 100) };
}

function parseQuantity(value: unknown): { ok: boolean; qty: number } {
	if (value == null || String(value).trim() === "") return { ok: false, qty: 0 };
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
	if (s === "cancelo" || s === "canceló" || s === "cancelado") return "cancelled";
	return "unknown";
}

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
		const report = await db.transaction(async (tx) => {
			const out: string[] = [];
			// Idempotencia por hash.
			const existing = await tx
				.select({ kind: importBatches.sourceKind, sha: importBatches.sha256 })
				.from(importBatches);
			const hasDetail = existing.some(
				(r) => r.kind === "order_detail" && r.sha === detailSha,
			);
			const hasControl = existing.some(
				(r) => r.kind === "sales_control" && r.sha === controlSha,
			);

			// ---------- DETALLE ----------
			let detailRejected = 0;
			const detailRejects: Reject[] = [];
			if (hasDetail) {
				out.push("Detalle: archivo ya importado (mismo sha), se omite.");
			} else {
				const wb = XLSX.read(detailBuf, { type: "buffer", cellDates: true });
				// Resumen -> reported_summaries (declarado, no canónico).
				const resumenSheet = wb.Sheets.Resumen;
				const summaries: typeof reportedSummaries.$inferInsert[] = [];
				if (resumenSheet) {
					const rows = XLSX.utils.sheet_to_json<unknown[]>(resumenSheet, {
						header: 1,
						defval: "",
					});
					for (let i = 1; i < rows.length; i++) {
						const r = rows[i];
						const label = asText(r[0]);
						if (!label) continue;
						if (/^total$/i.test(label)) {
							const t = parseMoneyToCents(r[3] ?? r[1], true);
							summaries.push({
								id: randomUUID(),
								kind: "detail_grand_total",
								period: "2026",
								reportedTotalCents: t.cents ?? 0,
								rawLabel: label,
								sourceSheet: "Resumen",
								sourceRow: i + 1,
							});
							continue;
						}
						const count = parseQuantity(r[2]);
						const total = parseMoneyToCents(r[3], true);
						summaries.push({
							id: randomUUID(),
							kind: "detail_seller",
							period: "2026",
							reportedOrders: count.ok ? count.qty : null,
							reportedTotalCents: total.cents ?? 0,
							rawLabel: `${label} | ${asText(r[1])}`,
							sourceSheet: "Resumen",
							sourceRow: i + 1,
						});
					}
				}

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
				rows.forEach((row, index) => {
					const excelRow = index + 2;
					const orderNo = asText(row.pedido);
					if (!orderNo) {
						detailRejected++;
						detailRejects.push({ source: "Detalle", row: excelRow, reason: "pedido vacío" });
						return;
					}
					const orderDate = parseDateOnly(row.fecha);
					if (!orderDate) {
						detailRejected++;
						detailRejects.push({ source: "Detalle", row: excelRow, reason: `fecha inválida: ${asText(row.fecha)}` });
						return;
					}
					const qty = parseQuantity(row.cantidad);
					if (!qty.ok) {
						detailRejected++;
						detailRejects.push({ source: "Detalle", row: excelRow, reason: `cantidad inválida: ${asText(row.cantidad)}` });
						return;
					}
					const unit = parseMoneyToCents(row.precio_unit, true);
					if (!unit.ok) {
						detailRejected++;
						detailRejects.push({ source: "Detalle", row: excelRow, reason: `precio_unit inválido: ${asText(row.precio_unit)}` });
						return;
					}
					const tot = parseMoneyToCents(row.total_pen, true);
					if (!tot.ok) {
						detailRejected++;
						detailRejects.push({ source: "Detalle", row: excelRow, reason: `total inválido: ${asText(row.total_pen)}` });
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

				const batchId = randomUUID();
				await tx.insert(importBatches).values({
					id: batchId,
					sourceKind: "order_detail",
					fileName: "detalle_pedidos_2026.xlsx",
					sha256: detailSha,
					rowsRead: rows.length,
					rowsImported: parsed.length,
					rowsRejected: detailRejected,
				});

				// Sellers: conocidos + códigos/nombres del detalle.
				const sellerByCode = new Map<string, { id: string }>();
				const sellerByName = new Map<string, { id: string }>();
				const existingSellers = await tx.select().from(sellers);
				for (const s of existingSellers) {
					if (s.externalCode) sellerByCode.set(s.externalCode, s);
					if (s.name) sellerByName.set(s.name.toUpperCase(), s);
				}
				const ensureSeller = async (code: string | null, name: string | null, control: string | null) => {
					if (code) {
						const hit = sellerByCode.get(code);
						if (hit) return hit;
					}
					if (!code && name) {
						const hit = sellerByName.get(name.toUpperCase());
						if (hit) return hit;
					}
					if (!code && !name && !control) return null;
					const id = randomUUID();
					await tx
						.insert(sellers)
						.values({ id, externalCode: code, controlName: control, name: name ?? control ?? code ?? "Desconocido" })
						.onConflictDoNothing();
					const rec = { id };
					if (code) sellerByCode.set(code, rec);
					if (name) sellerByName.set(name.toUpperCase(), rec);
					return rec;
				};
				for (const [control, info] of Object.entries(KNOWN_SELLERS))
					await ensureSeller(info.code, info.name, control);
				for (const p of parsed) await ensureSeller(p.sellerCode, p.sellerName, null);

				// Customers por nombre (detalle no trae DNI).
				const customerByName = new Map<string, string>();
				const existingCustomers = await tx.select().from(customers);
				for (const c of existingCustomers) {
					if (c.name) customerByName.set(c.name.toUpperCase(), c.id);
				}
				const ensureCustomerByName = async (name: string | null) => {
					if (!name) return null;
					const key = name.toUpperCase();
					const hit = customerByName.get(key);
					if (hit) return hit;
					const id = randomUUID();
					await tx.insert(customers).values({ id, name }).onConflictDoNothing();
					customerByName.set(key, id);
					return id;
				};
				for (const p of parsed) await ensureCustomerByName(p.customerName);

				// Products por SKU normalizado.
				const productBySku = new Map<string, string>();
				const existingProducts = await tx.select().from(products);
				for (const p of existingProducts) productBySku.set(p.sku, p.id);
				for (const p of parsed) {
					if (!p.skuNorm || productBySku.has(p.skuNorm)) continue;
					const id = randomUUID();
					await tx
						.insert(products)
						.values({ id, sku: p.skuNorm, canonicalName: p.description || null, brand: p.brand, category: p.category })
						.onConflictDoNothing();
					productBySku.set(p.skuNorm, id);
				}

				// Orders: upsert por external_no. line_no secuencial por pedido.
				const lineCounter = new Map<string, number>();
				const orderCache = new Map<string, { id: string; sellerId: string | null; customerId: string | null }>();
				for (const p of parsed) {
					let cached = orderCache.get(p.orderNo);
					if (!cached) {
						const sellerRec = p.sellerCode
							? sellerByCode.get(p.sellerCode) ?? null
							: p.sellerName
								? (sellerByName.get(p.sellerName.toUpperCase()) ?? null)
								: null;
						const customerId = p.customerName
							? (customerByName.get(p.customerName.toUpperCase()) ?? null)
							: null;
						const id = `ord-${p.orderNo}`;
						await tx
							.insert(salesOrders)
							.values({
								id,
								externalNo: p.orderNo,
								normalizedNo: p.normalizedNo,
								orderDate: p.orderDate,
								sellerId: sellerRec?.id ?? null,
								customerId,
								customerName: p.customerName,
								channel: p.channel,
								status: p.status,
								payment: asText((rows[p.excelRow - 2] as Record<string, unknown>).medio_pago) || null,
								district: asText((rows[p.excelRow - 2] as Record<string, unknown>).distrito) || null,
								batchId,
								sourceSheet: "Detalle",
								sourceRow: p.excelRow,
							})
							.onConflictDoUpdate({
								target: salesOrders.externalNo,
								set: {
									orderDate: p.orderDate,
									sellerId: sellerRec?.id ?? null,
									customerId,
									customerName: p.customerName,
									channel: p.channel,
									status: p.status,
									batchId,
									sourceRow: p.excelRow,
								},
							});
						cached = { id, sellerId: sellerRec?.id ?? null, customerId };
						orderCache.set(p.orderNo, cached);
					}
					const n = (lineCounter.get(p.orderNo) ?? 0) + 1;
					lineCounter.set(p.orderNo, n);
					await tx
						.insert(salesOrderLines)
						.values({
							id: `${cached.id}:L${n}`,
							orderId: cached.id,
							lineNo: n,
							productId: p.skuNorm ? (productBySku.get(p.skuNorm) ?? null) : null,
							skuRaw: p.skuRaw,
							skuNormalized: p.skuNorm,
							description: p.description,
							brandSnapshot: p.brand,
							categorySnapshot: p.category,
							quantity: p.quantity,
							unitPrice: p.unitPrice,
							lineTotal: p.lineTotal,
							sourceRow: p.excelRow,
						})
						.onConflictDoUpdate({
							target: [salesOrderLines.orderId, salesOrderLines.lineNo],
							set: {
								productId: p.skuNorm ? (productBySku.get(p.skuNorm) ?? null) : null,
								skuRaw: p.skuRaw,
								skuNormalized: p.skuNorm,
								description: p.description,
								brandSnapshot: p.brand,
								categorySnapshot: p.category,
								quantity: p.quantity,
								unitPrice: p.unitPrice,
								lineTotal: p.lineTotal,
							sourceRow: p.excelRow,
						},
					});
				}
				if (summaries.length) {
					for (let o = 0; o < summaries.length; o += 400) {
						await tx.insert(reportedSummaries).values(
							summaries.slice(o, o + 400).map((s) => ({ ...s, batchId })),
						);
					}
				}
				out.push(
					`Detalle: leídas ${rows.length}, importadas ${parsed.length}, rechazadas ${detailRejected}.`,
				);
				for (const r of detailRejects.slice(0, 20))
					out.push(`  Rechazada Detalle fila ${r.row}: ${r.reason}`);
			}

			// ---------- CONTROL ----------
			if (hasControl) {
				out.push("Control: archivo ya importado (mismo sha), se omite.");
			} else {
				const wb = XLSX.read(controlBuf, { type: "buffer", cellDates: true });
				const batchId = randomUUID();
				const controlRejects: Reject[] = [];
				let controlImported = 0;
				let controlRead = 0;

				await tx.insert(importBatches).values({
					id: batchId,
					sourceKind: "sales_control",
					fileName: "control_ventas_2026.xlsx",
					sha256: controlSha,
					rowsRead: 0,
					rowsImported: 0,
					rowsRejected: 0,
				});

				// Refresca mapas de vendedores/clientes.
				const sellerRows = await tx.select().from(sellers);
				const sellerByControl = new Map<string, string>();
				for (const s of sellerRows) if (s.controlName) sellerByControl.set(s.controlName, s.id);
				for (const [control, info] of Object.entries(KNOWN_SELLERS)) {
					if (!sellerByControl.has(control)) {
						const id = randomUUID();
						await tx.insert(sellers).values({ id, externalCode: info.code, controlName: control, name: info.name }).onConflictDoNothing();
						sellerByControl.set(control, id);
					}
				}
				const customerRows = await tx.select().from(customers);
				const customerByDoc = new Map<string, string>();
				for (const c of customerRows) if (c.documentNo) customerByDoc.set(c.documentNo, c.id);
				const ensureCustomerByDoc = async (doc: string | null, name: string | null) => {
					if (!doc) return null;
					const hit = customerByDoc.get(doc);
					if (hit) return hit;
					const id = randomUUID();
					await tx.insert(customers).values({ id, documentNo: doc, name }).onConflictDoNothing();
					customerByDoc.set(doc, id);
					return id;
				};

				type ControlRow = {
					id: string;
					entryDate: string;
					sellerId: string | null;
					documentRaw: string | null;
					customerId: string | null;
					externalRaw: string | null;
					normalizedNo: string | null;
					amountCents: number | null;
					rawStatus: string | null;
					normalizedStatus: string;
					batchId: string;
					sourceSheet: string;
					sourceRow: number;
					sourceBlock: string;
				};
				const entries: ControlRow[] = [];
				const monthSheets = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO"];
				const BASES = [0, 5, 10, 15, 20, 25];
				for (const sheetName of monthSheets) {
					const sh = wb.Sheets[sheetName];
					if (!sh) continue;
					const grid = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, defval: "" });
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
							const emptyRow =
								(dCell == null || String(dCell).trim() === "") &&
								!dni && (amtRaw == null || String(amtRaw).trim() === "") && !ordRaw && !obs;
							if (emptyRow) continue;
							controlRead++;
							const excelRow = i + 1;
							const parsedDate = parseDateOnly(dCell);
							if (parsedDate) carry = parsedDate;
							const entryDate = parsedDate ?? carry;
							if (!entryDate) {
								controlRejects.push({ source: `${sheetName}/${block}`, row: excelRow, reason: "fecha ausente" });
								continue;
							}
							const amt = amtRaw == null || String(amtRaw).trim() === ""
								? { ok: true, cents: null as number | null }
								: parseMoneyToCents(amtRaw, true);
							if (!amt.ok) {
								controlRejects.push({ source: `${sheetName}/${block}`, row: excelRow, reason: `importe inválido: ${asText(amtRaw)}` });
								continue;
							}
							const customerId = await ensureCustomerByDoc(dni || null, null);
							entries.push({
								id: `ctl-${sheetName}-${block}-${excelRow}`,
								entryDate,
								sellerId: sellerByControl.get(block) ?? null,
								documentRaw: dni || null,
								customerId,
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
							controlImported++;
						}
					}
				}
				// Concilia order_id por número normalizado.
				const orderMap = new Map<string, string>();
				const allOrders = await tx.select({ id: salesOrders.id, norm: salesOrders.normalizedNo }).from(salesOrders);
				for (const o of allOrders) if (!orderMap.has(o.norm)) orderMap.set(o.norm, o.id);
				for (let o = 0; o < entries.length; o += 400) {
					await tx.insert(salesControlEntries).values(
						entries.slice(o, o + 400).map((e) => ({
							...e,
							orderId: e.normalizedNo ? (orderMap.get(e.normalizedNo) ?? null) : null,
						})),
					).onConflictDoNothing();
				}

				// Totales declarados.
				const totSheet = wb.Sheets.Totales;
				if (totSheet) {
					const grid = XLSX.utils.sheet_to_json<unknown[]>(totSheet, { header: 1, defval: "" });
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
							sellerId: control ? (sellerByControl.get(control) ?? null) : null,
							period: month && MONTHS_ES[month] ? `2026-${MONTHS_ES[month]}` : null,
							reportedTotalCents: val.cents ?? 0,
							rawLabel: label,
							batchId,
							sourceSheet: "Totales",
							sourceRow: i + 1,
						});
					});
					for (let o = 0; o < toInsert.length; o += 400)
						await tx.insert(reportedSummaries).values(toInsert.slice(o, o + 400));
				}

				// Adelantos (filas anónimas se conservan tal cual, sin fill-down).
				const advSheet = wb.Sheets.Adelanto;
				let advImported = 0;
				if (advSheet) {
					const grid = XLSX.utils.sheet_to_json<unknown[]>(advSheet, { header: 1, defval: "" });
					const toInsert: typeof customerAdvances.$inferInsert[] = [];
					for (let i = 1; i < grid.length; i++) {
						const r = grid[i];
						const dni = asText(r[0]);
						const cli = asText(r[1]);
						const adv = r[2];
						const falta = r[3];
						const obs = asText(r[4]);
						if (!dni && !cli && (adv == null || String(adv).trim() === "") && (falta == null || String(falta).trim() === "") && !obs) continue;
						const a = parseMoneyToCents(adv, true);
						const f = parseMoneyToCents(falta, true);
						if (!a.ok || !f.ok) {
							controlRejects.push({ source: "Adelanto", row: i + 1, reason: "adelanto/falta inválido" });
							continue;
						}
						const customerId = await ensureCustomerByDoc(dni || null, cli || null);
						toInsert.push({
							id: randomUUID(),
							customerId,
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
					for (let o = 0; o < toInsert.length; o += 400)
						await tx.insert(customerAdvances).values(toInsert.slice(o, o + 400));
				}
				out.push(`Control: leídas ${controlRead}, entradas ${controlImported}, adelantos ${advImported}, rechazadas ${controlRejects.length}.`);
				for (const r of controlRejects.slice(0, 20))
					out.push(`  Rechazada ${r.source} fila ${r.row}: ${r.reason}`);
			}
			return out;
		});
		for (const line of report) console.log(line);
	} finally {
		await client.end();
	}
}

await main();
