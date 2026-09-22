import { SignInButton, Show } from "@clerk/tanstack-react-start";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowRight, Command, ShieldCheck } from "lucide-react";
import { auth } from "@clerk/tanstack-react-start/server";

const redirectIfSignedIn = createServerFn({ method: "GET" }).handler(
	async () => {
		const { isAuthenticated } = await auth();
		if (isAuthenticated) throw redirect({ to: "/dashboard" });
	},
);

export const Route = createFileRoute("/")({
	beforeLoad: () => redirectIfSignedIn(),
	component: LoginPage,
});

function LoginPage() {
	return (
		<main className="login-page">
			<div className="login-card">
				<div className="login-brand">
					<span className="brand-mark">
						<Command size={18} />
					</span>
					<span>Acme Inc.</span>
				</div>
				<div className="login-icon">
					<ShieldCheck size={22} />
				</div>
				<p className="login-eyebrow">BIENVENIDO DE NUEVO</p>
				<h1>Inicia sesión</h1>
				<p className="login-description">
					Accede a tu espacio de trabajo de forma segura.
				</p>
				<div className="login-action">
					{import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? (
						<Show when="signed-out">
							<SignInButton mode="modal" forceRedirectUrl="/dashboard">
								<button type="button" className="login-submit">
									Continuar <ArrowRight size={16} />
								</button>
							</SignInButton>
						</Show>
					) : (
						<div className="login-config-note">
							Configura Clerk con las claves del archivo `.env` para iniciar
							sesión.
						</div>
					)}
				</div>
				<p className="login-security">
					<ShieldCheck size={14} /> Autenticación segura con Clerk
				</p>
			</div>
			<footer className="login-footer">
				© 2026 Acme Inc. · Acceso privado
			</footer>
		</main>
	);
}
