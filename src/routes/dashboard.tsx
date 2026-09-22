import { UserButton } from "@clerk/tanstack-react-start"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Activity, ArrowRight, Boxes, CircleCheck,
  Command, LayoutDashboard, Package, ReceiptText, ShieldCheck, ShoppingBag,
  TrendingUp, UsersRound,
} from "lucide-react"
import { DataTable } from "../components/data-table"
import { currency, shortDate, orderColumns, sellerColumns, userColumns, type Order } from "../components/sales-columns"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../components/ui/chart"
import { Separator } from "../components/ui/separator"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "../components/ui/sidebar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../components/ui/sheet"
import { Tabs, TabsContent } from "../components/ui/tabs"
import { changeUserRole, getOrderDetails, getSalesDashboard, type AppRole } from "../server/users"

export const Route = createFileRoute("/dashboard")({ loader: () => getSalesDashboard(), component: Dashboard })
type OrderDetails = Awaited<ReturnType<typeof getOrderDetails>>
type Page = "overview" | "orders" | "products" | "sellers" | "users"

const chartConfig = {
  sales: { label: "Ventas", color: "var(--chart-1)" },
  units: { label: "Unidades", color: "var(--chart-2)" },
} satisfies ChartConfig

const compactCurrency = (cents: number) => new Intl.NumberFormat("es-PE", {
  style: "currency", currency: "PEN", notation: "compact", maximumFractionDigits: 1,
}).format(cents / 100)

function Dashboard() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [page, setPage] = useState<Page>("overview")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [details, setDetails] = useState<OrderDetails>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState("")
  const maxProduct = data.products[0]?.quantity || 1
  const maxSeller = data.sellers[0]?.sales || 1
  const navigation = [
    { value: "overview", label: "Resumen", icon: LayoutDashboard },
    { value: "orders", label: "Pedidos", icon: ReceiptText },
    { value: "products", label: "Productos", icon: Boxes },
    { value: "sellers", label: "Vendedores", icon: UsersRound },
    ...(data.user.role === "admin" ? [{ value: "users", label: "Usuarios", icon: ShieldCheck }] : []),
  ] as const
  const titles: Record<Page, string> = {
    overview: "Resumen general", orders: "Pedidos", products: "Productos",
    sellers: "Vendedores", users: "Usuarios y permisos",
  }

  async function openOrder(order: Order) {
    setSelectedOrder(order)
    setDetails([])
    setLoading(true)
    setError("")
    try { setDetails(await getOrderDetails({ data: order.orderNo })) }
    catch { setError("No se pudo cargar el detalle del pedido.") }
    finally { setLoading(false) }
  }

  async function updateRole(clerkId: string, role: AppRole | null) {
    setSaving(clerkId)
    setError("")
    try {
      await changeUserRole({ data: { clerkId, role } })
      await router.invalidate()
    } catch { setError("No se pudo actualizar el rol. Verifica tus permisos.") }
    finally { setSaving(null) }
  }

  const orderTable = <DataTable columns={orderColumns} data={data.orders} filterColumn="orderNo" filterPlaceholder="Buscar pedido..." dateColumn="date" onRowClick={(order) => void openOrder(order)} />

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Command className="size-5" /></div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-bold">Acme Analytics</p><p className="text-[11px] text-muted-foreground">Panel de ventas</p></div>
          </div>
        </SidebarHeader>
        <Separator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>ESPACIO DE TRABAJO</SidebarGroupLabel>
            <SidebarGroupContent><SidebarMenu>
              {navigation.map(({ value, label, icon: Icon }) => <SidebarMenuItem key={value}><SidebarMenuButton type="button" isActive={page === value} onClick={() => setPage(value as Page)}><Icon /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}
            </SidebarMenu></SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t p-3"><div className="flex items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-xs group-data-[collapsible=icon]:hidden"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{(data.user.name || data.user.email).slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate font-medium">{data.user.name || "Usuario"}</p><p className="truncate text-muted-foreground">{data.user.email}</p></div></div></SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3"><SidebarTrigger type="button" /><Separator orientation="vertical" className="h-5" /><span className="text-sm text-muted-foreground">Espacio de trabajo</span><span className="text-muted-foreground/50">/</span><span className="text-sm font-medium">{titles[page]}</span></div>
          <div className="flex items-center gap-3"><Badge variant="outline" className="hidden sm:inline-flex">{data.user.role === "admin" ? "Administrador" : "Solo lectura"}</Badge><UserButton /></div>
        </header>
        <Tabs value={page} onValueChange={(value) => setPage(value as Page)} className="w-full">
          <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-7 sm:px-7 lg:px-9">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Panel comercial · 2026</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{titles[page]}</h1><p className="mt-2 text-sm text-muted-foreground">Información de pedidos y ventas sincronizada con PostgreSQL.</p></div><Badge variant="secondary" className="gap-2 px-3 py-2"><Activity className="size-3.5" /> Datos de ventas</Badge></div>
            {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</div>}

            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric title="Ventas totales" value={currency(data.totalSales)} hint="Pedidos completados" icon={TrendingUp} />
                <Metric title="Pedidos completados" value={data.completedOrders.toLocaleString("es-PE")} hint={`${data.orders.length.toLocaleString("es-PE")} pedidos registrados`} icon={CircleCheck} />
                <Metric title="Ticket promedio" value={currency(data.completedOrders ? Math.round(data.totalSales / data.completedOrders) : 0)} hint="Por pedido completado" icon={ShoppingBag} />
                <Metric title="Unidades vendidas" value={data.unitsSold.toLocaleString("es-PE")} hint="Productos en ventas completadas" icon={Package} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
                <Card><CardHeader><CardTitle>Evolución de ventas</CardTitle><CardDescription>Ingresos mensuales en soles · 2026</CardDescription></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-[280px] w-full aspect-auto"><AreaChart accessibilityLayer data={data.monthlySales} margin={{ left: 4, right: 12, top: 12 }}><defs><linearGradient id="sales-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="month" tickFormatter={(label: string) => label.slice(0, 3)} tickLine={false} axisLine={false} /><YAxis tickFormatter={(value: number) => compactCurrency(value)} tickLine={false} axisLine={false} width={65} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => currency(Number(value))} />} /><Area type="monotone" dataKey="sales" stroke="var(--color-sales)" strokeWidth={2.5} fill="url(#sales-gradient)" /></AreaChart></ChartContainer></CardContent></Card>
                <Card><CardHeader><CardTitle>Productos destacados</CardTitle><CardDescription>Los SKU con más unidades vendidas</CardDescription></CardHeader><CardContent className="space-y-4">{data.products.slice(0, 5).map((product, index) => <div key={product.sku} className="flex items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={product.product}>{product.product || "Sin nombre"}</p><p className="text-xs text-muted-foreground">{product.sku}</p></div><span className="shrink-0 text-sm font-semibold">{product.quantity.toLocaleString("es-PE")}</span></div>)}<Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setPage("products")}>Ver todos los productos <ArrowRight className="size-4" /></Button></CardContent></Card>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Card><CardHeader><CardTitle>Unidades por mes</CardTitle><CardDescription>Volumen mensual de productos vendidos</CardDescription></CardHeader><CardContent><ChartContainer config={chartConfig} className="h-[220px] w-full aspect-auto"><BarChart accessibilityLayer data={data.monthlySales}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickFormatter={(label: string) => label.slice(0, 3)} tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} width={40} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="units" fill="var(--color-units)" radius={[4, 4, 0, 0]} /></BarChart></ChartContainer></CardContent></Card>
                <Card><CardHeader><CardTitle>Mejores vendedores</CardTitle><CardDescription>Clasificación por ventas completadas</CardDescription></CardHeader><CardContent className="space-y-4">{data.sellers.slice(0, 5).map((seller, index) => <div key={seller.name} className="space-y-1.5"><div className="flex items-center justify-between gap-2 text-sm"><span className="truncate"><span className="mr-2 text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>{seller.name}</span><span className="shrink-0 font-semibold">{compactCurrency(seller.sales)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${seller.sales / (data.sellers[0]?.sales || 1) * 100}%` }} /></div></div>)}</CardContent></Card>
              </div>
              <Card><CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Pedidos recientes</CardTitle><CardDescription>Últimas operaciones registradas</CardDescription></div><Button type="button" variant="outline" size="sm" onClick={() => setPage("orders")}>Ver pedidos <ArrowRight className="size-4" /></Button></CardHeader><CardContent><DataTable columns={orderColumns} data={data.orders.slice(0, 10)} onRowClick={(order) => void openOrder(order)} /></CardContent></Card>
            </TabsContent>

            <TabsContent value="orders"><Card><CardHeader><CardTitle>Todos los pedidos</CardTitle><CardDescription>Busca, filtra por fecha y abre un pedido para ver su detalle.</CardDescription></CardHeader><CardContent>{orderTable}</CardContent></Card></TabsContent>
            <TabsContent value="products"><Card><CardHeader><CardTitle>Productos más vendidos</CardTitle><CardDescription>Ranking de productos por unidades vendidas, agrupados por SKU.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2">{data.products.map((product, index) => <div key={product.sku} className="flex gap-4 rounded-lg border p-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold">{index + 1}</span><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium" title={product.product}>{product.product || "Producto sin nombre"}</p><p className="mt-1 text-xs text-muted-foreground">SKU {product.sku}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${product.quantity / maxProduct * 100}%` }} /></div><div className="mt-2 flex justify-between text-xs"><span>{product.quantity.toLocaleString("es-PE")} unidades</span><span className="font-medium">{currency(product.sales)}</span></div></div></div>)}</div></CardContent></Card></TabsContent>
            <TabsContent value="sellers"><Card><CardHeader><CardTitle>Rendimiento por vendedor</CardTitle><CardDescription>Pedidos e ingresos de cada vendedor en ventas completadas.</CardDescription></CardHeader><CardContent><DataTable columns={sellerColumns} data={data.sellers} filterColumn="name" filterPlaceholder="Buscar vendedor..." /><div className="mt-6 grid gap-3 md:grid-cols-2">{data.sellers.slice(0, 6).map((seller) => <div key={seller.name} className="flex items-center gap-3 text-sm"><span className="w-36 truncate" title={seller.name}>{seller.name}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${seller.sales / maxSeller * 100}%` }} /></div><span className="text-xs font-medium">{compactCurrency(seller.sales)}</span></div>)}</div></CardContent></Card></TabsContent>
            {data.user.role === "admin" && <TabsContent value="users"><div className="space-y-4">{data.pendingUsers > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">{data.pendingUsers} {data.pendingUsers === 1 ? "usuario espera" : "usuarios esperan"} la asignación de un rol.</div>}<Card><CardHeader><CardTitle>Gestión de usuarios</CardTitle><CardDescription>Las cuentas nuevas quedan en espera hasta recibir un rol de lectura o administración.</CardDescription></CardHeader><CardContent><DataTable columns={userColumns(data.user.clerkId, saving, (id, role) => void updateRole(id, role))} data={data.managedUsers} filterColumn="email" filterPlaceholder="Buscar correo..." /></CardContent></Card></div></TabsContent>}
          </div>
        </Tabs>
      </SidebarInset>

      <Sheet open={Boolean(selectedOrder)} onOpenChange={(open) => { if (!open) setSelectedOrder(null) }}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Detalle del pedido</SheetTitle><SheetDescription>{selectedOrder?.orderNo}</SheetDescription></SheetHeader>{selectedOrder && <div className="space-y-5 px-4 pb-6 text-sm"><div className="grid grid-cols-2 gap-3 rounded-lg border p-4"><div><p className="text-xs text-muted-foreground">Fecha</p><strong>{shortDate(selectedOrder.date)}</strong></div><div><p className="text-xs text-muted-foreground">Estado</p><strong>{selectedOrder.status}</strong></div><div><p className="text-xs text-muted-foreground">Cliente</p><strong>{selectedOrder.customer || "No indicado"}</strong></div><div><p className="text-xs text-muted-foreground">Vendedor</p><strong>{selectedOrder.seller}</strong></div><div className="col-span-2"><p className="text-xs text-muted-foreground">Canal</p><strong>{selectedOrder.channel || "No indicado"}</strong></div></div><h3 className="font-semibold">Productos</h3>{loading ? <p className="text-muted-foreground">Cargando detalle…</p> : <div className="divide-y rounded-lg border">{details.map((item) => <div key={item.id} className="flex justify-between gap-3 p-3"><div><p className="font-medium">{item.product || "Producto"}</p><p className="text-xs text-muted-foreground">SKU {item.sku} · {item.quantity} uds. · {currency(item.unitPrice)} / ud.</p></div><strong className="whitespace-nowrap">{currency(item.total)}</strong></div>)}</div>}<div className="flex justify-between border-t pt-4 font-semibold"><span>Total</span><span>{currency(selectedOrder.total)}</span></div></div>}</SheetContent></Sheet>
    </SidebarProvider>
  )
}

function Metric({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: typeof TrendingUp }) {
  return <Card><CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardDescription>{title}</CardDescription><span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span></div></CardHeader><CardContent><div className="text-2xl font-bold tracking-tight">{value}</div><p className="mt-1 text-xs text-muted-foreground">{hint}</p></CardContent></Card>
}
