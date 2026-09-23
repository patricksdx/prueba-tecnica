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
		<main className="min-h-screen bg-background">
			<header className="flex min-h-16 items-center justify-between border-b px-5 py-3 lg:px-12">
				<a className="inline-flex items-center gap-2.5 text-sm font-semibold text-foreground no-underline" href="/">
					<span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
						<Command size={17} />
					</span>{" "}
					Panel de ventas
				</a>
				<UserButton />
			</header>
			<section className="mx-auto mt-20 w-[calc(100%-2rem)] max-w-[400px] rounded-lg border bg-card p-8 text-center text-card-foreground">
				<div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-muted">
					<Clock3 size={25} />
				</div>
				<p className="text-xs font-semibold tracking-widest text-muted-foreground">ACCESO PENDIENTE</p>
				<h1 className="mt-2 text-2xl font-semibold">Tu cuenta está en espera</h1>
				<p className="my-5 text-sm text-muted-foreground">
					Hola {user.name || user.email}. Un administrador debe asignarte un rol
					antes de que puedas consultar las ventas.
				</p>
				<div className="grid gap-1.5 rounded-lg border p-3 text-left text-xs">
					<span className="text-muted-foreground">Cuenta registrada</span>
					<strong>{user.email}</strong>
					<span className="text-muted-foreground">Sin rol asignado</span>
				</div>
			</section>
		</main>
	);
}
