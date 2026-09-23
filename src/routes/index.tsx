import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowRight, Command, ShieldCheck } from "lucide-react";
import { SignInButton, Show } from "@clerk/tanstack-react-start";
import { Button } from "../components/ui/button";
import { getSessionUser } from "../server/users";

export const Route = createFileRoute("/")({
	beforeLoad: async () => {
		const user = await getSessionUser();
		if (user) throw redirect({ to: user.role ? "/dashboard" : "/espera" });
	},
	component: LoginPage,
});

function LoginPage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted p-5">
			<div className="w-full max-w-[400px] rounded-lg border bg-card p-8 text-card-foreground">
				<div className="inline-flex items-center gap-2.5 text-sm font-semibold">
					<span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
						<Command size={18} />
					</span>
					<span>Acme Inc.</span>
				</div>
				<div className="mt-7 mb-3 grid size-11 place-items-center rounded-lg bg-muted">
					<ShieldCheck size={22} />
				</div>
				<p className="mt-3 mb-1 text-[11px] tracking-widest text-muted-foreground">BIENVENIDO DE NUEVO</p>
				<h1 className="text-2xl font-semibold">Inicia sesión</h1>
				<p className="mt-2 mb-5 text-sm text-muted-foreground">
					Accede a tu espacio de trabajo de forma segura.
				</p>
				<div className="w-full">
					{import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
						<Show when="signed-out">
							<SignInButton mode="modal" forceRedirectUrl="/dashboard">
								<Button type="button" className="w-full" size="lg">
									Continuar <ArrowRight size={16} />
								</Button>
							</SignInButton>
						</Show>
					) : (
						<div className="rounded-lg border p-3 text-xs">
							Configura Clerk con las claves del archivo `.env` para iniciar
							sesión.
						</div>
					)}
				</div>
				<p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
					<ShieldCheck size={14} /> Autenticación segura con Clerk
				</p>
			</div>
			<footer className="text-xs text-muted-foreground">
				© 2026 Acme Inc. · Acceso privado
			</footer>
		</main>
	);
}
