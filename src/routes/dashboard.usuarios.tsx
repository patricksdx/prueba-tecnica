import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardView } from "../components/dashboard-view";
import { getSalesDashboard } from "../server/users";

export const Route = createFileRoute("/dashboard/usuarios")({
	loader: async () => {
		const data = await getSalesDashboard();
		if (data.user.role !== "admin") throw redirect({ to: "/dashboard" });
		return data;
	},
	component: () => <DashboardView data={Route.useLoaderData()} page="users" />,
});
