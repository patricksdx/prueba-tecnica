import { UserButton } from "@clerk/tanstack-react-start";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Clock3, Command } from "lucide-react";
import { getSessionUser } from "../server/users";

export const Route = createFileRoute("/espera")({
	beforeLoad: async () => {
		const user = await getSessionUser();
		if (!user) throw redirect({ to: "/" });
		if (user.role) throw redirect({ to: "/dashboard" });
		return { user };
	},
	component: WaitingPage,
});

function WaitingPage() {
	const { user } = Route.useRouteContext();
	return (
		<main className="waiting-page">
			<header className="waiting-header">
				<a className="sales-brand" href="/">
					<span className="brand-mark">
						<Command size={17} />
					</span>{" "}
					Panel de ventas
				</a>
				<UserButton />
			</header>
			<section className="waiting-card">
				<div className="waiting-icon">
					<Clock3 size={25} />
				</div>
				<p className="sales-eyebrow">ACCESO PENDIENTE</p>
				<h1>Tu cuenta está en espera</h1>
				<p>
					Hola {user.name || user.email}. Un administrador debe asignarte un rol
					antes de que puedas consultar las ventas.
				</p>
				<div className="waiting-user">
					<span>Cuenta registrada</span>
					<strong>{user.email}</strong>
					<span>Sin rol asignado</span>
				</div>
			</section>
		</main>
	);
}
