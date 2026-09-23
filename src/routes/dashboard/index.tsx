import { DashboardView } from "#/components/dashboard-view";
import { getSalesDashboard } from "#/server/users";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/")({
	loader: () => getSalesDashboard(),
	component: () => <DashboardView data={Route.useLoaderData()} page="overview" />,
});
