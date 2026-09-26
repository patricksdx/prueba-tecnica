import { UserButton } from "@clerk/tanstack-react-start";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	ArrowRight,
	Boxes,
	CircleCheck,
	Command,
	LayoutDashboard,
	Package,
	ReceiptText,
	ShieldCheck,
	ShoppingBag,
	TrendingUp,
	UsersRound,
} from "lucide-react";
import { useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	XAxis,
	YAxis,
} from "recharts";
import {
	type AppRole,
	changeUserRole,
	assignSellerToOrder,
	getOrderDetails,
} from "../server/users";
import type {
	OrderLineDetail,
	SalesDashboardDto,
} from "../types/sales";
import { DataTable } from "./data-table";
import {
	currency,
	type ManagedUser,
	type Order,
	orderColumns,
	sellerColumns,
	shortDate,
	userColumns,
} from "./sales-columns";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "./ui/chart";
import { Label } from "./ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "./ui/sheet";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "./ui/sidebar";
import { Tabs, TabsContent } from "./ui/tabs";

type SalesData = SalesDashboardDto;
type OrderDetails = OrderLineDetail[];
export type Page =
	| "overview"
	| "orders"
	| "products"
	| "sellers"
	| "reconciliation"
	| "users";
const paths = {
	overview: "/dashboard",
	orders: "/dashboard/pedidos",
	products: "/dashboard/productos",
	sellers: "/dashboard/vendedores",
	reconciliation: "/dashboard/conciliacion",
	users: "/dashboard/usuarios",
} as const;

const chartConfig = {
	sales: { label: "Ventas", color: "var(--chart-1)" },
	units: { label: "Unidades", color: "var(--chart-2)" },
} satisfies ChartConfig;

const compactCurrency = (cents: number) =>
	new Intl.NumberFormat("es-PE", {
		style: "currency",
		currency: "PEN",
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(cents / 100);

export function DashboardView({ data, page }: { data: SalesData; page: Page }) {
	const router = useRouter();
	const navigate = useNavigate();
	const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
	const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
	const [details, setDetails] = useState<OrderDetails>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState<string | null>(null);
	const [sellerSelection, setSellerSelection] = useState("");
	const [error, setError] = useState("");
	const [role, setRole] = useState<"pending" | AppRole>("pending");
	const maxProduct = data.products[0]?.quantity || 1;
	const maxSeller = data.sellers[0]?.sales || 1;
	const navigation = [
		{ value: "overview", label: "Resumen", icon: LayoutDashboard },
		{ value: "orders", label: "Pedidos", icon: ReceiptText },
		{ value: "products", label: "Productos", icon: Boxes },
		{ value: "sellers", label: "Vendedores", icon: UsersRound },
		{ value: "reconciliation", label: "Conciliación", icon: Activity },
		...(data.user.role === "admin"
			? [{ value: "users", label: "Usuarios", icon: ShieldCheck }]
			: []),
	] as const;
	const titles: Record<Page, string> = {
		overview: "Resumen general",
		orders: "Pedidos",
		products: "Productos",
		sellers: "Vendedores",
		reconciliation: "Conciliación control vs detalle",
		users: "Usuarios y permisos",
	};

	async function openOrder(order: Order) {
		setSelectedOrder(order);
		setSellerSelection("");
		setDetails([]);
		setLoading(true);
		setError("");
		try {
			setDetails(await getOrderDetails({ data: order.orderNo }));
		} catch {
			setError("No se pudo cargar el detalle del pedido.");
		} finally {
			setLoading(false);
		}
	}

	async function updateRole(clerkId: string, role: AppRole | null) {
		if (clerkId === data.user.clerkId) return;
		setSaving(clerkId);
		setError("");
		try {
			await changeUserRole({ data: { clerkId, role } });
			await router.invalidate();
			setSelectedUser(null);
		} catch {
			setError("No se pudo actualizar el rol. Verifica tus permisos.");
		} finally {
			setSaving(null);
		}
	}

	async function assignSeller() {
		if (!selectedOrder || !sellerSelection) return;
		setSaving(selectedOrder.orderNo);
		setError("");
		try {
			const result = await assignSellerToOrder({
				data: { orderNo: selectedOrder.orderNo, sellerId: sellerSelection },
			});
			setSelectedOrder({ ...selectedOrder, seller: result.seller });
			setSellerSelection("");
			await router.invalidate();
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "No se pudo asignar el vendedor.",
			);
		} finally {
			setSaving(null);
		}
	}

	function openUser(user: ManagedUser) {
		setSelectedUser(user);
		setRole(user.role ?? "pending");
		setError("");
	}

	function goTo(page: Page) {
		void navigate({ to: paths[page] });
	}

	const orderTable = (
		<DataTable
			columns={orderColumns}
			data={data.orders}
			filterColumn="orderNo"
			filterPlaceholder="Buscar pedido..."
			dateColumn="date"
			onRowClick={(order) => void openOrder(order)}
		/>
	);

	return (
		<SidebarProvider>
			<Sidebar collapsible="icon" className="border-r border-sidebar-border">
				<SidebarHeader className="p-4">
					<div className="flex items-center gap-3 overflow-hidden">
						<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<Command className="size-5" />
						</div>
						<div className="min-w-0 group-data-[collapsible=icon]:hidden">
							<p className="truncate text-sm font-bold">Acme Analytics</p>
							<p className="text-[11px] text-muted-foreground">
								Panel de ventas
							</p>
						</div>
					</div>
				</SidebarHeader>
				<Separator />
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>ESPACIO DE TRABAJO</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{navigation.map(({ value, label, icon }) => (
									<NavigationItem
										key={value}
										value={value as Page}
										label={label}
										icon={icon}
										current={page}
									/>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter className="border-t p-3">
					<div className="flex items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-xs group-data-[collapsible=icon]:hidden">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">
							{(data.user.name || data.user.email).slice(0, 2).toUpperCase()}
						</span>
						<div className="min-w-0">
							<p className="truncate font-medium">
								{data.user.name || "Usuario"}
							</p>
							<p className="truncate text-muted-foreground">
								{data.user.email}
							</p>
						</div>
					</div>
				</SidebarFooter>
			</Sidebar>

			<SidebarInset>
				<header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-7">
					<div className="flex items-center gap-3">
						<SidebarTrigger type="button" />
						<Separator orientation="vertical" className="h-5" />
						<span className="text-sm text-muted-foreground">
							Espacio de trabajo
						</span>
						<span className="text-muted-foreground/50">/</span>
						<span className="text-sm font-medium">{titles[page]}</span>
					</div>
					<div className="flex items-center gap-3">
						<Badge variant="outline" className="hidden sm:inline-flex">
							{data.user.role === "admin" ? "Administrador" : "Solo lectura"}
						</Badge>
						<UserButton />
					</div>
				</header>
				<Tabs value={page} className="w-full">
					<div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-7 sm:px-7 lg:px-9">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">
									Panel comercial · 2026
								</p>
								<h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
									{titles[page]}
								</h1>
								<p className="mt-2 text-sm text-muted-foreground">
									Información de pedidos y ventas sincronizada con PostgreSQL.
								</p>
							</div>
							<Badge variant="secondary" className="gap-2 px-3 py-2">
								<Activity className="size-3.5" /> Datos de ventas
							</Badge>
						</div>
						{error && (
							<div
								className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
								role="alert"
							>
								{error}
							</div>
						)}

						<TabsContent value="overview" className="space-y-6">
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
								<Metric
									title="Ventas totales"
									value={currency(data.totalSales)}
									hint="Pedidos completados"
									icon={TrendingUp}
								/>
								<Metric
									title="Pedidos completados"
									value={data.completedOrders.toLocaleString("es-PE")}
									hint={`${data.orders.length.toLocaleString("es-PE")} pedidos registrados`}
									icon={CircleCheck}
								/>
								<Metric
									title="Ticket promedio"
									value={currency(
										data.completedOrders
											? Math.round(data.totalSales / data.completedOrders)
											: 0,
									)}
									hint="Por pedido completado"
									icon={ShoppingBag}
								/>
								<Metric
									title="Unidades vendidas"
									value={data.unitsSold.toLocaleString("es-PE")}
									hint="Productos en ventas completadas"
									icon={Package}
								/>
							</div>

							<div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
								<Card>
									<CardHeader>
										<CardTitle>Evolución de ventas</CardTitle>
										<CardDescription>
											Ingresos mensuales en soles · 2026
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={chartConfig}
											className="h-[280px] w-full aspect-auto"
										>
											<AreaChart
												accessibilityLayer
												data={data.monthlySales}
												margin={{ left: 4, right: 12, top: 12 }}
											>
												<defs>
													<linearGradient
														id="sales-gradient"
														x1="0"
														y1="0"
														x2="0"
														y2="1"
													>
														<stop
															offset="5%"
															stopColor="var(--color-sales)"
															stopOpacity={0.25}
														/>
														<stop
															offset="95%"
															stopColor="var(--color-sales)"
															stopOpacity={0}
														/>
													</linearGradient>
												</defs>
												<CartesianGrid vertical={false} strokeDasharray="3 3" />
												<XAxis
													dataKey="month"
													tickFormatter={(label: string) => label.slice(0, 3)}
													tickLine={false}
													axisLine={false}
												/>
												<YAxis
													tickFormatter={(value: number) =>
														compactCurrency(value)
													}
													tickLine={false}
													axisLine={false}
													width={65}
												/>
												<ChartTooltip
													content={
														<ChartTooltipContent
															formatter={(value) => currency(Number(value))}
														/>
													}
												/>
												<Area
													type="monotone"
													dataKey="sales"
													stroke="var(--color-sales)"
													strokeWidth={2.5}
													fill="url(#sales-gradient)"
												/>
											</AreaChart>
										</ChartContainer>
									</CardContent>
								</Card>
								<Card>
									<CardHeader>
										<CardTitle>Productos destacados</CardTitle>
										<CardDescription>
											Los SKU con más unidades vendidas
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-4">
										{data.products.slice(0, 5).map((product, index) => (
											<div
												key={product.sku}
												className="flex items-center gap-3"
											>
												<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
													{index + 1}
												</span>
												<div className="min-w-0 flex-1">
													<p
														className="truncate text-sm font-medium"
														title={product.product}
													>
														{product.product || "Sin nombre"}
													</p>
													<p className="text-xs text-muted-foreground">
														{product.sku}
													</p>
												</div>
												<span className="shrink-0 text-sm font-semibold">
													{product.quantity.toLocaleString("es-PE")}
												</span>
											</div>
										))}
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="w-full"
											onClick={() => goTo("products")}
										>
											Ver todos los productos <ArrowRight className="size-4" />
										</Button>
									</CardContent>
								</Card>
							</div>

							<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
								<Card>
									<CardHeader>
										<CardTitle>Unidades por mes</CardTitle>
										<CardDescription>
											Volumen mensual de productos vendidos
										</CardDescription>
									</CardHeader>
									<CardContent>
										<ChartContainer
											config={chartConfig}
											className="h-[220px] w-full aspect-auto"
										>
											<BarChart accessibilityLayer data={data.monthlySales}>
												<CartesianGrid vertical={false} />
												<XAxis
													dataKey="month"
													tickFormatter={(label: string) => label.slice(0, 3)}
													tickLine={false}
													axisLine={false}
												/>
												<YAxis tickLine={false} axisLine={false} width={40} />
												<ChartTooltip content={<ChartTooltipContent />} />
												<Bar
													dataKey="units"
													fill="var(--color-units)"
													radius={[4, 4, 0, 0]}
												/>
											</BarChart>
										</ChartContainer>
									</CardContent>
								</Card>
								<Card>
									<CardHeader>
										<CardTitle>Mejores vendedores</CardTitle>
										<CardDescription>
											Clasificación por ventas completadas
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-4">
										{data.sellers.slice(0, 5).map((seller, index) => (
											<div key={seller.name} className="space-y-1.5">
												<div className="flex items-center justify-between gap-2 text-sm">
													<span className="truncate">
														<span className="mr-2 text-muted-foreground">
															{String(index + 1).padStart(2, "0")}
														</span>
														{seller.name}
													</span>
													<span className="shrink-0 font-semibold">
														{compactCurrency(seller.sales)}
													</span>
												</div>
												<div className="h-1.5 overflow-hidden rounded-full bg-muted">
													<div
														className="h-full rounded-full bg-primary"
														style={{
															width: `${(seller.sales / (data.sellers[0]?.sales || 1)) * 100}%`,
														}}
													/>
												</div>
											</div>
										))}
									</CardContent>
								</Card>
							</div>
							<Card>
								<CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
									<div>
										<CardTitle>Pedidos recientes</CardTitle>
										<CardDescription>
											Últimas operaciones registradas
										</CardDescription>
									</div>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => goTo("orders")}
									>
										Ver pedidos <ArrowRight className="size-4" />
									</Button>
								</CardHeader>
								<CardContent>
									<DataTable
										columns={orderColumns}
										data={data.orders.slice(0, 10)}
										onRowClick={(order) => void openOrder(order)}
									/>
								</CardContent>
							</Card>
						</TabsContent>

						<TabsContent value="orders">
							<Card>
								<CardHeader>
									<CardTitle>Todos los pedidos</CardTitle>
									<CardDescription>
										Busca, filtra por fecha y abre un pedido para ver su
										detalle.
									</CardDescription>
								</CardHeader>
								<CardContent>{orderTable}</CardContent>
							</Card>
						</TabsContent>
						<TabsContent value="products">
							<Card>
								<CardHeader>
									<CardTitle>Productos más vendidos</CardTitle>
									<CardDescription>
										Ranking de productos por unidades vendidas, agrupados por
										SKU.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="grid gap-3 md:grid-cols-2">
										{data.products.map((product, index) => (
											<div
												key={product.sku}
												className="flex gap-4 rounded-lg border p-4"
											>
												<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold">
													{index + 1}
												</span>
												<div className="min-w-0 flex-1">
													<p
														className="line-clamp-2 text-sm font-medium"
														title={product.product}
													>
														{product.product || "Producto sin nombre"}
													</p>
													<p className="mt-1 text-xs text-muted-foreground">
														SKU {product.sku}
													</p>
													<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
														<div
															className="h-full rounded-full bg-primary"
															style={{
																width: `${(product.quantity / maxProduct) * 100}%`,
															}}
														/>
													</div>
													<div className="mt-2 flex justify-between text-xs">
														<span>
															{product.quantity.toLocaleString("es-PE")}{" "}
															unidades
														</span>
														<span className="font-medium">
															{currency(product.sales)}
														</span>
													</div>
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						</TabsContent>
						<TabsContent value="sellers">
							<Card>
								<CardHeader>
									<CardTitle>Rendimiento por vendedor</CardTitle>
									<CardDescription>
										Pedidos e ingresos de cada vendedor en ventas completadas.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<DataTable
										columns={sellerColumns}
										data={data.sellers}
										filterColumn="name"
										filterPlaceholder="Buscar vendedor..."
									/>
									<div className="mt-6 grid gap-3 md:grid-cols-2">
										{data.sellers.slice(0, 6).map((seller) => (
											<div
												key={seller.name}
												className="flex items-center gap-3 text-sm"
											>
												<span className="w-36 truncate" title={seller.name}>
													{seller.name}
												</span>
												<div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
													<div
														className="h-full rounded-full bg-primary"
														style={{
															width: `${(seller.sales / maxSeller) * 100}%`,
														}}
													/>
												</div>
												<span className="text-xs font-medium">
													{compactCurrency(seller.sales)}
												</span>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						</TabsContent>
						<TabsContent value="reconciliation">
							<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
								<Metric
									title="Pedidos conciliados"
									value={data.reconciliation.matched.toLocaleString("es-PE")}
									hint="Existen en detalle y control"
									icon={CircleCheck}
								/>
								<Metric
									title="Solo en control"
									value={data.reconciliation.onlyControl.toLocaleString("es-PE")}
									hint="No están en el detalle"
									icon={Activity}
								/>
								<Metric
									title="Solo en detalle"
									value={data.reconciliation.onlyDetail.toLocaleString("es-PE")}
									hint="No aparecen en control"
									icon={ReceiptText}
								/>
								<Metric
									title="Anulados en control"
									value={data.reconciliation.cancelledControl.toLocaleString("es-PE")}
									hint="Marcados anulado/canceló"
									icon={ShieldCheck}
								/>
							</div>
							<div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
								<Card>
									<CardHeader>
										<CardTitle>Diferencias de importe</CardTitle>
										<CardDescription>
											El detalle manda; el control solo compara. Primeras 100
											coincidencias con distinto total.
										</CardDescription>
									</CardHeader>
									<CardContent>
										{data.reconciliation.amountDiffs.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												Sin diferencias entre control y detalle.
											</p>
										) : (
											<div className="divide-y rounded-lg border">
												{data.reconciliation.amountDiffs.map((diff) => (
													<div
														key={diff.orderNo}
														className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
													>
														<div>
															<p className="font-medium">{diff.orderNo}</p>
															<p className="text-xs text-muted-foreground">
																{diff.seller} · {diff.date}
																{diff.status ? ` · ${diff.status}` : ""}
															</p>
														</div>
														<div className="text-right text-xs">
															<p>
																Control:{" "}
																{diff.controlAmount == null
																	? "—"
																	: currency(diff.controlAmount)}
															</p>
															<p className="font-medium">
																Detalle: {currency(diff.detailTotal)}
															</p>
														</div>
													</div>
												))}
											</div>
										)}
									</CardContent>
								</Card>
								<Card>
									<CardHeader>
										<CardTitle>Adelantos</CardTitle>
										<CardDescription>
											Hoja Adelanto: registros tal cual, sin heredar cliente.
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-3">
										{data.reconciliation.advances.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												Sin adelantos registrados.
											</p>
										) : (
											data.reconciliation.advances.slice(0, 20).map((adv) => (
												<div
													key={`${adv.document}|${adv.customer}|${adv.advance}|${adv.outstanding}|${adv.note}`}
													className="flex justify-between gap-3 rounded-lg border p-3 text-sm"
												>
													<div>
														<p className="font-medium">
															{adv.customer || "Sin cliente"}
														</p>
														<p className="text-xs text-muted-foreground">
															DNI {adv.document || "—"}
															{adv.note ? ` · ${adv.note}` : ""}
														</p>
													</div>
													<div className="text-right text-xs">
														<p>Adelanto {currency(adv.advance)}</p>
														<p>Falta {currency(adv.outstanding)}</p>
													</div>
												</div>
											))
										)}
									</CardContent>
								</Card>
							</div>
							<Card className="mt-4">
								<CardHeader>
									<CardTitle>Totales declarados</CardTitle>
									<CardDescription>
										Hojas Totales y Resumen: se conservan para comparar, no
										reemplazan las ventas del detalle.
									</CardDescription>
								</CardHeader>
								<CardContent>
									{data.reconciliation.summaries.length === 0 ? (
										<p className="text-sm text-muted-foreground">
											Sin totales declarados.
										</p>
									) : (
										<div className="divide-y rounded-lg border">
											{data.reconciliation.summaries.slice(0, 40).map((sum) => (
												<div
													key={`${sum.sheet}|${sum.label}|${sum.period}|${sum.total}`}
													className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
												>
													<div>
														<p className="font-medium">{sum.label}</p>
														<p className="text-xs text-muted-foreground">
															{sum.sheet}
															{sum.period ? ` · ${sum.period}` : ""}
															{sum.orders != null ? ` · ${sum.orders} pedidos` : ""}
														</p>
													</div>
													<strong>{currency(sum.total)}</strong>
												</div>
											))}
										</div>
									)}
								</CardContent>
							</Card>
						</TabsContent>
						{data.user.role === "admin" && (
							<TabsContent value="users">
								<div className="space-y-4">
									{data.pendingUsers > 0 && (
										<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
											{data.pendingUsers}{" "}
											{data.pendingUsers === 1
												? "usuario espera"
												: "usuarios esperan"}{" "}
											la asignación de un rol.
										</div>
									)}
									<Card>
										<CardHeader>
											<CardTitle>Gestión de usuarios</CardTitle>
											<CardDescription>
												Las cuentas nuevas quedan en espera hasta recibir un rol
												de lectura o administración.
											</CardDescription>
										</CardHeader>
										<CardContent>
											<DataTable
												columns={userColumns}
												data={data.managedUsers}
												filterColumn="email"
												filterPlaceholder="Buscar correo..."
												onRowClick={openUser}
												rowClickMode="row"
											/>
										</CardContent>
									</Card>
								</div>
							</TabsContent>
						)}
					</div>
				</Tabs>
			</SidebarInset>

			<Sheet
				open={Boolean(selectedOrder)}
				onOpenChange={(open) => {
					if (!open) setSelectedOrder(null);
				}}
			>
				<SheetContent className="w-full overflow-y-auto sm:max-w-lg">
					<SheetHeader>
						<SheetTitle>Detalle del pedido</SheetTitle>
						<SheetDescription>{selectedOrder?.orderNo}</SheetDescription>
					</SheetHeader>
					{selectedOrder && (
						<div className="space-y-5 px-4 pb-6 text-sm">
							<div className="grid grid-cols-2 gap-3 rounded-lg border p-4">
								<div>
									<p className="text-xs text-muted-foreground">Fecha</p>
									<strong>{shortDate(selectedOrder.date)}</strong>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Estado</p>
									<strong>{selectedOrder.status}</strong>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Cliente</p>
									<strong>{selectedOrder.customer || "No indicado"}</strong>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Vendedor</p>
									<strong>{selectedOrder.seller}</strong>
								</div>
								{data.user.role === "admin" &&
									selectedOrder.seller === "Sin vendedor" && (
										<div className="col-span-2 space-y-2 border-t pt-3">
											<Label htmlFor="order-seller">Asignar vendedor</Label>
											<div className="flex flex-col gap-2 sm:flex-row">
												<Select
													value={sellerSelection}
													onValueChange={setSellerSelection}
													disabled={saving !== null}
												>
													<SelectTrigger id="order-seller" className="w-full">
														<SelectValue placeholder="Selecciona un vendedor" />
													</SelectTrigger>
													<SelectContent>
														{data.sellerOptions.map((seller) => (
															<SelectItem key={seller.id} value={seller.id}>
																{seller.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												<Button
													type="button"
													disabled={!sellerSelection || saving !== null}
													onClick={() => void assignSeller()}
												>
													{saving === selectedOrder.orderNo ? "Guardando..." : "Asignar"}
												</Button>
											</div>
										</div>
									)}
								<div>
									<p className="text-xs text-muted-foreground">Canal</p>
									<strong>{selectedOrder.channel || "No indicado"}</strong>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Líneas</p>
									<strong>{selectedOrder.count}</strong>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Medio de pago</p>
									<strong>{selectedOrder.payment || "No indicado"}</strong>
								</div>
								<div>
									<p className="text-xs text-muted-foreground">Distrito</p>
									<strong>{selectedOrder.district || "No indicado"}</strong>
								</div>
							</div>
							<h3 className="font-semibold">Productos</h3>
							{loading ? (
								<p className="text-muted-foreground">Cargando detalle…</p>
							) : (
								<div className="divide-y rounded-lg border">
									{details.map((item) => (
										<div
											key={item.id}
											className="flex justify-between gap-3 p-3"
										>
											<div>
												<p className="font-medium">
													{item.product || "Producto"}
												</p>
												<p className="text-xs text-muted-foreground">
													SKU {item.sku} · {item.quantity} uds. ·{" "}
													{currency(item.unitPrice)} / ud.
													{item.brand || item.category
														? ` · ${[item.brand, item.category].filter(Boolean).join(" / ")}`
														: ""}
													{item.unitPrice === 0 ? " · Precio 0" : ""}
												</p>
											</div>
											<strong className="whitespace-nowrap">
												{currency(item.total)}
											</strong>
										</div>
									))}
								</div>
							)}
							<div className="flex justify-between border-t pt-4 font-semibold">
								<span>Total</span>
								<span>{currency(selectedOrder.total)}</span>
							</div>
						</div>
					)}
				</SheetContent>
			</Sheet>
			<Sheet
				open={Boolean(selectedUser)}
				onOpenChange={(open) => {
					if (!open) setSelectedUser(null);
				}}
			>
				<SheetContent className="w-full sm:max-w-lg">
					<SheetHeader>
						<SheetTitle>{selectedUser?.name || "Usuario"}</SheetTitle>
						<SheetDescription>{selectedUser?.email}</SheetDescription>
					</SheetHeader>
					{selectedUser && (
						<div className="space-y-5 px-4 pb-6">
							<p className="text-sm text-muted-foreground">
								Alta:{" "}
								{new Intl.DateTimeFormat("es-PE", {
									dateStyle: "medium",
								}).format(new Date(selectedUser.createdAt))}
							</p>
							<div className="space-y-2">
								<Label htmlFor="user-role">Rol</Label>
								<Select
									value={role}
									onValueChange={(value) => setRole(value as typeof role)}
									disabled={
										selectedUser.clerkId === data.user.clerkId ||
										saving !== null
									}
								>
									<SelectTrigger id="user-role" className="w-full">
										<SelectValue placeholder="Selecciona un rol" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="pending">En espera</SelectItem>
										<SelectItem value="reader">Lectura</SelectItem>
										<SelectItem value="admin">Administrador</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{selectedUser.clerkId === data.user.clerkId && (
								<p className="text-sm text-muted-foreground">
									No puedes cambiar tu propio rol.
								</p>
							)}
							{error && (
								<p className="text-sm text-destructive" role="alert">
									{error}
								</p>
							)}
							<Button
								type="button"
								disabled={
									saving !== null ||
									role === (selectedUser.role ?? "pending") ||
									selectedUser.clerkId === data.user.clerkId
								}
								onClick={() =>
									void updateRole(
										selectedUser.clerkId,
										role === "pending" ? null : role,
									)
								}
							>
								{saving ? "Guardando..." : "Guardar rol"}
							</Button>
						</div>
					)}
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	);
}

function Metric({
	title,
	value,
	hint,
	icon: Icon,
}: {
	title: string;
	value: string;
	hint: string;
	icon: typeof TrendingUp;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between gap-2">
					<CardDescription>{title}</CardDescription>
					<span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
						<Icon className="size-4" />
					</span>
				</div>
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold tracking-tight">{value}</div>
				<p className="mt-1 text-xs text-muted-foreground">{hint}</p>
			</CardContent>
		</Card>
	);
}

function NavigationItem({
	value,
	label,
	icon: Icon,
	current,
}: {
	value: Page;
	label: string;
	icon: LucideIcon;
	current: Page;
}) {
	const { isMobile, setOpenMobile } = useSidebar();
	return (
		<SidebarMenuItem>
			<SidebarMenuButton asChild isActive={current === value}>
				<Link
					to={paths[value]}
					onClick={() => {
						if (isMobile) setOpenMobile(false);
					}}
				>
					<Icon />
					<span>{label}</span>
				</Link>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}
