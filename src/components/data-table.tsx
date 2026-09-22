import { useState } from "react";
import {
	useTable,
	type ColumnDef,
	type RowData,
	type SortingState,
} from "@tanstack/react-table";
import { Button } from "./ui/button";
import { Calendar } from "./ui/calendar";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "./ui/context-menu";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { CalendarDays } from "lucide-react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import { features, type DataTableFeatures } from "./data-table-features";

type DataTableProps<TData extends RowData> = {
	columns: ColumnDef<DataTableFeatures, TData>[];
	data: TData[];
	filterColumn?: string;
	filterPlaceholder?: string;
	dateColumn?: string;
	onRowClick?: (row: TData) => void;
	emptyMessage?: string;
};

export function DataTable<TData extends RowData>({
	columns,
	data,
	filterColumn,
	filterPlaceholder = "Buscar...",
	dateColumn,
	onRowClick,
	emptyMessage = "No hay resultados.",
}: DataTableProps<TData>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const table = useTable({
		features,
		data,
		columns,
		onSortingChange: setSorting,
		state: { sorting },
	});

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				{filterColumn && (
					<Input
						aria-label={filterPlaceholder}
						placeholder={filterPlaceholder}
						className="max-w-xs"
						value={
							(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""
						}
						onChange={(event) =>
							table.getColumn(filterColumn)?.setFilterValue(event.target.value)
						}
					/>
				)}
				{dateColumn && (
					<>
						<Popover>
							<PopoverTrigger asChild>
								<Button type="button" variant="outline" size="sm">
									<CalendarDays />
									{(table.getColumn(dateColumn)?.getFilterValue() as string) ||
										"Filtrar fecha"}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-auto p-0" align="start">
								<Calendar
									mode="single"
									selected={
										table.getColumn(dateColumn)?.getFilterValue()
											? new Date(
													`${table.getColumn(dateColumn)?.getFilterValue()}T12:00:00`,
												)
											: undefined
									}
									onSelect={(date) =>
										table
											.getColumn(dateColumn)
											?.setFilterValue(
												date
													? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
													: "",
											)
									}
								/>
							</PopoverContent>
						</Popover>
						{Boolean(table.getColumn(dateColumn)?.getFilterValue()) && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => table.getColumn(dateColumn)?.setFilterValue("")}
							>
								Limpiar fecha
							</Button>
						)}
					</>
				)}
			</div>
			<div className="rounded-lg border border-border bg-card">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((group) => (
							<TableRow key={group.id}>
								{group.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder ? null : (
											<table.FlexRender header={header} />
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getAllCells().map((cell) => (
										<TableCell key={cell.id}>
											{onRowClick && cell.column.id === "orderNo" ? (
												<ContextMenu>
													<ContextMenuTrigger asChild>
														<button
															type="button"
															className="font-medium text-left hover:underline"
															onClick={() => onRowClick(row.original)}
															aria-label={`Ver pedido ${cell.getValue()}`}
														>
															<table.FlexRender cell={cell} />
														</button>
													</ContextMenuTrigger>
													<ContextMenuContent>
														<ContextMenuItem
															onSelect={() => onRowClick(row.original)}
														>
															Ver detalle
														</ContextMenuItem>
														<ContextMenuItem
															onSelect={() =>
																void navigator.clipboard.writeText(
																	String(cell.getValue()),
																)
															}
														>
															Copiar número
														</ContextMenuItem>
													</ContextMenuContent>
												</ContextMenu>
											) : (
												<table.FlexRender cell={cell} />
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-20 text-center text-muted-foreground"
								>
									{emptyMessage}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
			<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
				<span>
					{table.getFilteredRowModel().rows.length} registros · Página{" "}
					{table.state.pagination.pageIndex + 1} de{" "}
					{Math.max(1, table.getPageCount())}
				</span>
				<div className="flex gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
					>
						Anterior
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
					>
						Siguiente
					</Button>
				</div>
			</div>
		</div>
	);
}
