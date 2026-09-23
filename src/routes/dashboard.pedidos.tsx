import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "../components/dashboard-view";
import { getSalesDashboard } from "../server/users";

export const Route = createFileRoute("/dashboard/pedidos")({
	loader: () => getSalesDashboard(),
	component: () => <DashboardView data={Route.useLoaderData()} page="orders" />,
});
