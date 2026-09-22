import { createColumnHelper } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Button } from "./ui/button";
import type { DataTableFeatures } from "./data-table-features";
import type { getSalesDashboard, AppRole } from "../server/users";

type SalesData = Awaited<ReturnType<typeof getSalesDashboard>>;
export type Seller = SalesData["sellers"][number];
export type Order = SalesData["orders"][number];
export type ManagedUser = SalesData["managedUsers"][number];

export const currency = (cents: number) =>
	new Intl.NumberFormat("es-PE", {
		style: "currency",
		currency: "PEN",
		maximumFractionDigits: 2,
	}).format(cents / 100);
export const shortDate = (date: string) =>
	new Intl.DateTimeFormat("es-PE", {
		dateStyle: "medium",
		timeZone: "UTC",
	}).format(new Date(`${date}T00:00:00Z`));

function sortHeader(
	title: string,
	column: {
		toggleSorting: (desc?: boolean) => void;
		getIsSorted: () => false | "asc" | "desc";
	},
) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="-ml-2"
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{title}
			<ArrowUpDown className="ml-1 size-3.5" />
		</Button>
	);
}

const seller = createColumnHelper<DataTableFeatures, Seller>();
export const sellerColumns = seller.columns([
	seller.accessor("name", {
		header: ({ column }) => sortHeader("Vendedor", column),
		cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
	}),
	seller.accessor("orders", {
		header: ({ column }) => sortHeader("Pedidos", column),
		cell: ({ row }) => row.original.orders.toLocaleString("es-PE"),
	}),
	seller.accessor("sales", {
		header: ({ column }) => sortHeader("Ventas", column),
		cell: ({ row }) => (
			<span className="font-medium">{currency(row.original.sales)}</span>
		),
	}),
]);

const order = createColumnHelper<DataTableFeatures, Order>();
export const orderColumns = order.columns([
	order.accessor("orderNo", {
		header: ({ column }) => sortHeader("Pedido", column),
	}),
	order.accessor("date", {
		header: ({ column }) => sortHeader("Fecha", column),
		filterFn: "includesString",
		cell: ({ row }) => shortDate(row.original.date),
	}),
	order.accessor("customer", {
		header: "Cliente",
		cell: ({ row }) => row.original.customer || "—",
	}),
	order.accessor("seller", { header: "Vendedor" }),
	order.accessor("status", {
		header: "Estado",
		cell: ({ row }) => (
			<span className="rounded-full bg-muted px-2 py-1 text-xs">
				{row.original.status}
			</span>
		),
	}),
	order.accessor("total", {
		header: ({ column }) => sortHeader("Total", column),
		cell: ({ row }) => (
			<span className="font-medium">{currency(row.original.total)}</span>
		),
	}),
]);

const managedUser = createColumnHelper<DataTableFeatures, ManagedUser>();
export function userColumns(
	currentUserId: string,
	saving: string | null,
	updateRole: (id: string, role: AppRole | null) => void,
) {
	return managedUser.columns([
		managedUser.accessor("name", {
			header: "Usuario",
			cell: ({ row }) => row.original.name || "Sin nombre",
		}),
		managedUser.accessor("email", { header: "Correo" }),
		managedUser.accessor("createdAt", {
			header: "Alta",
			cell: ({ row }) =>
				new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(
					new Date(row.original.createdAt),
				),
		}),
		managedUser.accessor("role", {
			header: "Rol",
			cell: ({ row }) => (
				<>
					<label className="sr-only" htmlFor={`role-${row.original.clerkId}`}>
						Rol de {row.original.name || row.original.email}
					</label>
					<select
						id={`role-${row.original.clerkId}`}
						className="h-8 rounded-md border border-input bg-background px-2 text-xs"
						value={row.original.role ?? "pending"}
						disabled={
							saving === row.original.clerkId ||
							currentUserId === row.original.clerkId
						}
						onChange={(event) =>
							updateRole(
								row.original.clerkId,
								event.target.value === "pending"
									? null
									: (event.target.value as AppRole),
							)
						}
					>
						<option value="pending">En espera</option>
						<option value="reader">Lectura</option>
						<option value="admin">Administrador</option>
					</select>
				</>
			),
		}),
	]);
}
