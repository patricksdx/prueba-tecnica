import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
	Activity,
	ArrowDownRight,
	ArrowRight,
	ArrowUpRight,
	BarChart3,
	Bell,
	ChevronDown,
	CircleHelp,
	Command,
	CreditCard,
	Download,
	LayoutDashboard,
	LifeBuoy,
	Plus,
	Search,
	Settings2,
	ShoppingBag,
	Users,
} from "lucide-react";
import { Show, UserButton } from "@clerk/tanstack-react-start";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { saveClerkUser } from "../server/users";

const requireUser = createServerFn({ method: "GET" }).handler(async () => {
	const { isAuthenticated, userId } = await auth();
	if (!isAuthenticated || !userId) {
		throw redirect({ to: "/" });
	}

	const clerkUser = await (await clerkClient()).users.getUser(userId);
	const user = await saveClerkUser({
		clerkId: clerkUser.id,
		email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
		name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" "),
	});

	return user;
});

export const Route = createFileRoute("/dashboard")({
	beforeLoad: () => requireUser(),
	component: Dashboard,
});

const stats = [
	{
		label: "Ingresos totales",
		value: "$45,231.89",
		change: "+20.1%",
		positive: true,
		icon: CreditCard,
		note: "respecto al mes pasado",
	},
	{
		label: "Suscripciones",
		value: "+2,350",
		change: "+180.1%",
		positive: true,
		icon: Users,
		note: "respecto al mes pasado",
	},
	{
		label: "Ventas",
		value: "+12,234",
		change: "+19%",
		positive: true,
		icon: ShoppingBag,
		note: "respecto al mes pasado",
	},
	{
		label: "Activos ahora",
		value: "+573",
		change: "-4.5%",
		positive: false,
		icon: Activity,
		note: "respecto a la última hora",
	},
];

const transactions = [
	{
		initials: "OM",
		name: "Olivia Martin",
		email: "olivia.martin@email.com",
		amount: "+$1,999.00",
		tone: "violet",
	},
	{
		initials: "JL",
		name: "Jackson Lee",
		email: "jackson.lee@email.com",
		amount: "+$39.00",
		tone: "blue",
	},
	{
		initials: "IN",
		name: "Isabella Nguyen",
		email: "isabella.nguyen@email.com",
		amount: "+$299.00",
		tone: "pink",
	},
	{
		initials: "WK",
		name: "William Kim",
		email: "william.kim@email.com",
		amount: "+$99.00",
		tone: "amber",
	},
	{
		initials: "SD",
		name: "Sofia Davis",
		email: "sofia.davis@email.com",
		amount: "+$39.00",
		tone: "green",
	},
];

function Dashboard() {
	const user = Route.useRouteContext();
	return (
		<div className="dashboard-shell">
			<aside className="sidebar">
				<a className="brand" href="#inicio">
					<span className="brand-mark">
						<Command size={17} />
					</span>
					<span>Acme Inc.</span>
					<ChevronDown size={15} className="muted-icon" />
				</a>
				<div className="workspace-label">Workspace</div>
				<nav className="side-nav" aria-label="Navegación principal">
					<a className="side-link active" href="#overview">
						<LayoutDashboard size={17} /> Overview
					</a>
					<a className="side-link" href="#analytics">
						<BarChart3 size={17} /> Analytics
					</a>
					<a className="side-link" href="#customers">
						<Users size={17} /> Customers
					</a>
					<a className="side-link" href="#orders">
						<ShoppingBag size={17} /> Orders{" "}
						<span className="nav-count">12</span>
					</a>
				</nav>
				<div className="workspace-label section-label">Settings</div>
				<nav className="side-nav">
					<a className="side-link" href="#settings">
						<Settings2 size={17} /> General
					</a>
					<a className="side-link" href="#billing">
						<CreditCard size={17} /> Billing
					</a>
				</nav>
				<div className="sidebar-bottom">
					<a className="side-link" href="#help">
						<CircleHelp size={17} /> Help center
					</a>
					<a className="side-link" href="#support">
						<LifeBuoy size={17} /> Support
					</a>
				</div>
				<div className="profile-card">
					<div className="profile-avatar">
						{user.name.slice(0, 2).toUpperCase()}
					</div>
					<div className="profile-copy">
						<strong>{user.name || "Usuario"}</strong>
						<span>{user.email}</span>
					</div>
					<ChevronDown size={15} className="muted-icon" />
				</div>
			</aside>

			<main className="dashboard-main">
				<header className="topbar">
					<div className="breadcrumbs">
						<span>Workspace</span>
						<span className="crumb-separator">/</span>
						<strong>Overview</strong>
					</div>
					<div className="top-actions">
						<button
							type="button"
							className="icon-button search-button"
							aria-label="Buscar"
						>
							<Search size={17} />
							<span>Search</span>
							<kbd>⌘ K</kbd>
						</button>
						<button
							type="button"
							className="icon-button notification-button"
							aria-label="Notificaciones"
						>
							<Bell size={17} />
							<i />
						</button>
						<div className="auth-slot">
							<Show when="signed-in">
								<UserButton />
							</Show>
						</div>
					</div>
				</header>

				<div className="content-wrap">
					<div className="page-heading">
						<div>
							<p className="eyebrow">Tuesday, October 24, 2024</p>
							<h1>Overview</h1>
							<p className="page-subtitle">
								Aquí tienes un resumen de lo que está pasando.
							</p>
						</div>
						<button type="button" className="primary-button">
							<Plus size={16} /> Crear reporte
						</button>
					</div>

					<section className="stats-grid" aria-label="Métricas principales">
						{stats.map(
							({ label, value, change, positive, icon: Icon, note }) => (
								<article className="stat-card" key={label}>
									<div className="stat-top">
										<span>{label}</span>
										<Icon size={17} />
									</div>
									<div className="stat-value">{value}</div>
									<div className="stat-foot">
										<span className={positive ? "trend up" : "trend down"}>
											{positive ? (
												<ArrowUpRight size={14} />
											) : (
												<ArrowDownRight size={14} />
											)}
											{change}
										</span>
										<span>{note}</span>
									</div>
								</article>
							),
						)}
					</section>

					<section className="analytics-grid">
						<article className="panel revenue-panel">
							<div className="panel-heading">
								<div>
									<h2>Ingresos</h2>
									<p>Ingresos de los últimos 6 meses</p>
								</div>
								<button type="button" className="select-button">
									Últimos 6 meses <ChevronDown size={14} />
								</button>
							</div>
							<div className="chart-summary">
								<div>
									<span className="chart-label">Ingresos totales</span>
									<strong>$45,231.89</strong>
								</div>
								<span className="trend up">
									<ArrowUpRight size={14} /> +20.1%
								</span>
							</div>
							<div className="chart">
								<div className="chart-y">
									<span>$10k</span>
									<span>$8k</span>
									<span>$6k</span>
									<span>$4k</span>
									<span>$2k</span>
									<span>$0</span>
								</div>
								<div className="chart-area">
									<div className="grid-lines">
										<i />
										<i />
										<i />
										<i />
										<i />
										<i />
									</div>
									<svg
										viewBox="0 0 720 220"
										preserveAspectRatio="none"
										role="img"
										aria-label="Gráfica de ingresos en tendencia ascendente"
									>
										<defs>
											<linearGradient
												id="chartFill"
												x1="0"
												x2="0"
												y1="0"
												y2="1"
											>
												<stop
													offset="0%"
													stopColor="#18181b"
													stopOpacity=".12"
												/>
												<stop
													offset="100%"
													stopColor="#18181b"
													stopOpacity="0"
												/>
											</linearGradient>
										</defs>
										<path
											d="M0 178 C35 169 45 159 75 166 S118 145 145 153 S187 122 218 137 S260 105 290 120 S330 117 364 89 S407 99 436 78 S470 90 507 66 S552 72 582 49 S628 57 654 32 S692 43 720 17 L720 220 L0 220Z"
											fill="url(#chartFill)"
										/>
										<path
											d="M0 178 C35 169 45 159 75 166 S118 145 145 153 S187 122 218 137 S260 105 290 120 S330 117 364 89 S407 99 436 78 S470 90 507 66 S552 72 582 49 S628 57 654 32 S692 43 720 17"
											fill="none"
											stroke="#18181b"
											strokeWidth="2.5"
											vectorEffect="non-scaling-stroke"
										/>
									</svg>
									<div className="chart-x">
										<span>May</span>
										<span>Jun</span>
										<span>Jul</span>
										<span>Aug</span>
										<span>Sep</span>
										<span>Oct</span>
									</div>
								</div>
							</div>
						</article>

						<article className="panel sales-panel">
							<div className="panel-heading">
								<div>
									<h2>Ventas recientes</h2>
									<p>Has realizado 265 ventas este mes.</p>
								</div>
								<button
									type="button"
									className="more-button"
									aria-label="Más opciones"
								>
									···
								</button>
							</div>
							<div className="transaction-list">
								{transactions.map((transaction) => (
									<div className="transaction" key={transaction.email}>
										<div className={`transaction-avatar ${transaction.tone}`}>
											{transaction.initials}
										</div>
										<div className="transaction-person">
											<strong>{transaction.name}</strong>
											<span>{transaction.email}</span>
										</div>
										<strong className="transaction-amount">
											{transaction.amount}
										</strong>
									</div>
								))}
							</div>
							<button type="button" className="outline-button">
								Ver todas las ventas <ArrowRight size={15} />
							</button>
						</article>
					</section>

					<section className="panel activity-panel">
						<div className="panel-heading">
							<div>
								<h2>Actividad reciente</h2>
								<p>Un vistazo a la actividad de tu cuenta.</p>
							</div>
							<button type="button" className="select-button">
								<Download size={14} /> Exportar
							</button>
						</div>
						<div className="activity-row">
							<span className="activity-dot" />
							<div>
								<strong>Nuevo cliente registrado</strong>
								<p>Emma Wilson se unió a tu plan Pro.</p>
							</div>
							<time>Hace 12 min</time>
						</div>
						<div className="activity-row">
							<span className="activity-dot muted-dot" />
							<div>
								<strong>Pago recibido</strong>
								<p>Pago de $299.00 recibido de Isabella Nguyen.</p>
							</div>
							<time>Hace 48 min</time>
						</div>
					</section>
					<footer className="dashboard-footer">
						© 2024 Acme Inc. <span>Privacidad · Términos</span>
					</footer>
				</div>
			</main>
		</div>
	);
}
