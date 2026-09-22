import { UserButton } from "@clerk/tanstack-react-start"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { Command, Package, ShoppingCart } from "lucide-react"
import { DataTable } from "../components/data-table"
import { currency, shortDate, orderColumns, sellerColumns, userColumns, type Order } from "../components/sales-columns"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../components/ui/sheet"
import { changeUserRole, getOrderDetails, getSalesDashboard, type AppRole } from "../server/users"

export const Route = createFileRoute("/dashboard")({ loader: () => getSalesDashboard(), component: Dashboard })
type OrderDetails = Awaited<ReturnType<typeof getOrderDetails>>

function Dashboard() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [details, setDetails] = useState<OrderDetails>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState("")
  const maxSales = Math.max(...data.monthlySales.map((month) => month.sales), 1)

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

  return <div className="sales-app">
    <header className="sales-topbar">
      <a className="sales-brand" href="/dashboard"><span className="brand-mark"><Command size={17} /></span> Panel de ventas</a>
      <div className="sales-topbar-right"><span className="role-tag">{data.user.role === "admin" ? "Administrador" : "Solo lectura"}</span><UserButton /></div>
    </header>
    <main className="sales-content">
      <div className="sales-heading"><div><p className="sales-eyebrow">REPORTE COMERCIAL · 2026</p><h1 className="text-3xl font-semibold tracking-tight">Ventas</h1><p className="text-sm text-muted-foreground">Pedidos, productos y desempeño de vendedores.</p></div><span className="source-badge"><Package size={15} /> Datos de pedidos</span></div>
      {error && <div className="inline-error" role="alert">{error}</div>}

      <section className="sales-panel flex items-center gap-4" aria-label="Total de ventas"><span className="rounded-lg bg-muted p-3"><ShoppingCart size={22} /></span><div><p className="text-xs text-muted-foreground">Total de ventas completadas</p><strong className="text-3xl font-semibold tracking-tight">{currency(data.totalSales)}</strong><p className="text-xs text-muted-foreground">Suma de pedidos completados</p></div></section>

      <div className="sales-grid">
        <section className="sales-panel"><h2 className="font-semibold">Evolución de ventas mes a mes</h2><p className="mb-5 text-xs text-muted-foreground">Importes de pedidos completados · PEN</p><div className="monthly-chart" role="img" aria-label="Gráfica de ventas mensuales">{data.monthlySales.map((month) => <div className="month-column" key={month.month} title={`${month.month}: ${currency(month.sales)}`}><span className="month-value">{month.sales ? currency(month.sales) : "—"}</span><div className="month-bar-track"><div className="month-bar" style={{ height: `${month.sales ? Math.max(4, month.sales / maxSales * 100) : 0}%` }} /></div><span className="text-xs text-muted-foreground">{month.month.slice(0, 3)}</span></div>)}</div></section>
        <section className="sales-panel"><h2 className="font-semibold">Productos más vendidos</h2><p className="mb-3 text-xs text-muted-foreground">Ordenados por unidades · SKU</p><div className="space-y-2">{data.products.map((product, index) => <div key={product.sku} className="flex items-center gap-3 border-t pt-2 text-xs"><span className="text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="truncate font-medium" title={product.product}>{product.product || "Sin nombre"}</p><span className="text-muted-foreground">SKU {product.sku}</span></div><span className="whitespace-nowrap font-medium">{product.quantity} uds.</span></div>)}</div></section>
      </div>

      <section className="sales-panel"><h2 className="font-semibold">Ventas por vendedor</h2><p className="mb-4 text-xs text-muted-foreground">Ventas en pedidos completados</p><DataTable columns={sellerColumns} data={data.sellers} filterColumn="name" filterPlaceholder="Buscar vendedor..." /></section>
      <section className="sales-panel"><h2 className="font-semibold">Pedidos</h2><p className="mb-4 text-xs text-muted-foreground">Selecciona el número de pedido para ver su detalle · {data.orders.length} recientes</p><DataTable columns={orderColumns} data={data.orders} filterColumn="orderNo" filterPlaceholder="Buscar pedido..." onRowClick={(order) => void openOrder(order)} /></section>
      {data.user.role === "admin" && <section className="sales-panel"><h2 className="font-semibold">Usuarios y permisos</h2><p className="mb-4 text-xs text-muted-foreground">Las cuentas nuevas quedan en espera hasta que se les asigne un rol.</p><DataTable columns={userColumns(data.user.clerkId, saving, (id, role) => void updateRole(id, role))} data={data.managedUsers} filterColumn="email" filterPlaceholder="Buscar correo..." /></section>}
    </main>

    <Sheet open={Boolean(selectedOrder)} onOpenChange={(open) => { if (!open) setSelectedOrder(null) }}><SheetContent className="w-full overflow-y-auto sm:max-w-lg"><SheetHeader><SheetTitle>Detalle del pedido</SheetTitle><SheetDescription>{selectedOrder?.orderNo}</SheetDescription></SheetHeader>{selectedOrder && <div className="space-y-5 px-4 pb-6 text-sm"><div className="grid grid-cols-2 gap-3 rounded-lg border p-4"><div><p className="text-xs text-muted-foreground">Fecha</p><strong>{shortDate(selectedOrder.date)}</strong></div><div><p className="text-xs text-muted-foreground">Estado</p><strong>{selectedOrder.status}</strong></div><div><p className="text-xs text-muted-foreground">Cliente</p><strong>{selectedOrder.customer || "No indicado"}</strong></div><div><p className="text-xs text-muted-foreground">Vendedor</p><strong>{selectedOrder.seller}</strong></div><div className="col-span-2"><p className="text-xs text-muted-foreground">Canal</p><strong>{selectedOrder.channel || "No indicado"}</strong></div></div><h3 className="font-semibold">Productos</h3>{loading ? <p className="text-muted-foreground">Cargando detalle…</p> : <div className="divide-y rounded-lg border">{details.map((item) => <div key={item.id} className="flex justify-between gap-3 p-3"><div><p className="font-medium">{item.product || "Producto"}</p><p className="text-xs text-muted-foreground">SKU {item.sku} · {item.quantity} uds. · {currency(item.unitPrice)} / ud.</p></div><strong className="whitespace-nowrap">{currency(item.total)}</strong></div>)}</div>}<div className="flex justify-between border-t pt-4 font-semibold"><span>Total</span><span>{currency(selectedOrder.total)}</span></div></div>}</SheetContent></Sheet>
  </div>
}
