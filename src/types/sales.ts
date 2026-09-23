export type DashboardOrder = {
	orderNo: string;
	date: string;
	customer: string;
	seller: string;
	status: string;
	total: number;
	channel: string;
	count: number;
	payment: string;
	district: string;
};

export type ProductSummary = {
	sku: string;
	product: string;
	quantity: number;
	sales: number;
};

export type SellerSummary = {
	name: string;
	sales: number;
	orders: number;
};

export type MonthSales = {
	month: string;
	sales: number;
	units: number;
};

export type ManagedUserDto = {
	clerkId: string;
	email: string;
	name: string;
	role: "admin" | "reader" | null;
	createdAt: Date;
};

export type OrderLineDetail = {
	id: string;
	product: string;
	sku: string;
	quantity: number;
	unitPrice: number;
	total: number;
	brand: string;
	category: string;
};

export type ReconciliationDiff = {
	orderNo: string;
	seller: string;
	date: string;
	controlAmount: number | null;
	detailTotal: number;
	status: string;
};

export type AdvanceDto = {
	document: string;
	customer: string;
	advance: number;
	outstanding: number;
	note: string;
};

export type ReportedSummaryDto = {
	kind: string;
	period: string;
	orders: number | null;
	total: number;
	label: string;
	sheet: string;
};

export type ReconciliationDto = {
	matched: number;
	onlyControl: number;
	onlyDetail: number;
	cancelledControl: number;
	amountDiffs: ReconciliationDiff[];
	advances: AdvanceDto[];
	summaries: ReportedSummaryDto[];
};

export type SalesDashboardDto = {
	user: {
		clerkId: string;
		email: string;
		name: string;
		role: "admin" | "reader" | null;
	};
	totalSales: number;
	completedOrders: number;
	unitsSold: number;
	pendingUsers: number;
	monthlySales: MonthSales[];
	products: ProductSummary[];
	sellers: SellerSummary[];
	orders: DashboardOrder[];
	managedUsers: ManagedUserDto[];
	reconciliation: ReconciliationDto;
};
