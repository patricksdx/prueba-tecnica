# Panel de ventas — Acme Inc.

Aplicación interna de visualización y conciliación de ventas construida con **TanStack Start (React + Vite + Nitro)**, autenticación con **Clerk**, base de datos **PostgreSQL** con **Drizzle ORM**, UI con **shadcn/ui + Tailwind CSS v4**, tablas con **TanStack Table** y gráficos con **Recharts**.

- `/` — solo inicio de sesión (modal de Clerk, con Google como proveedor social).
- `/dashboard` — resumen y vistas comerciales. Requiere sesión válida con rol asignado.
- `/espera` — página para usuarios recién registrados sin rol.
- `/dashboard/pedidos`, `/productos`, `/vendedores`, `/conciliacion` — vistas de detalle.
- `/dashboard/usuarios` — solo administradores, asignación de roles.

Al iniciar sesión, el servidor consulta al usuario en Clerk y lo sincroniza en PostgreSQL (`id`, correo y nombre). Los registros nuevos quedan con `role = NULL` (en espera). El primer administrador se promueve con `CLERK_ADMIN_IDS`; desde `/dashboard/usuarios` se asigna `admin`, `reader` o se devuelve a espera.

## Stack

- TanStack Start / Router / Server Functions
- Clerk `@clerk/tanstack-react-start` (auth + `UserButton`, `SignInButton`)
- PostgreSQL + `postgres-js` + Drizzle ORM + Drizzle Kit
- Tailwind CSS v4 + shadcn/ui (Card, Chart, Tabs, Sidebar, Badge, Sheet, etc.)
- TanStack Table v9, Recharts, `xlsx`, `date-fns`, `lucide-react`
- Biome (lint/format), Bun, Docker + Docker Compose

## Requisitos

- Bun 1.x
- PostgreSQL accesible (local o remoto)
- Cuenta/app en Clerk con Google habilitado como proveedor social
- Los Excel de origen en `src/assets/`:
  - `detalle_pedidos_2026.xlsx` (hojas `Detalle` y `Resumen`)
  - `control_ventas_2026.xlsx` (hojas mensuales, `Totales` y `Adelanto`)

## Configuración

1. Copia el ejemplo de entorno:

   ```bash
   cp .env.example .env
   ```

2. Variables (` .env` no se sube a Git):

   | Variable | Requerida | Descripción |
   |---|---|---|
   | `VITE_CLERK_PUBLISHABLE_KEY` | Sí | Clave pública de Clerk (se incrusta en el cliente durante el build). |
   | `CLERK_SECRET_KEY` | Sí | Clave secreta de Clerk, solo servidor. |
   | `DATABASE_URL` | Sí | Conexión PostgreSQL, ej. `postgresql://usuario:contraseña@host:5432/base_de_datos`. |
   | `CLERK_ADMIN_IDS` | Para bootstrap | IDs de Clerk separados por coma que se promueven a `admin` al iniciar sesión. |
   | `APP_PORT` | No (defecto `3000`) | Puerto publicado en el flujo Docker documentado. |

3. Instala dependencias:

   ```bash
   bun install
   ```

## Base de datos (Drizzle Kit)

El esquema vive en `src/server/schema.ts`, las migraciones en `drizzle/`, la configuración en `drizzle.config.ts`.

```bash
bun run db:generate   # genera una migración desde cambios en src/server/schema.ts
bun run db:migrate    # aplica migraciones a DATABASE_URL (no borra datos)
bun run db:reset      # reinicia: borra users + tablas comerciales + historial Drizzle y re-aplica migraciones
```

`db:reset` (`scripts/reiniciar-base.ts` + `migrate`) elimina `users`, `sales_orders`, `sales_order_lines`, `sellers`, `customers`, `products`, `sales_control_entries`, `customer_advances`, `reported_summaries` y la histórica `sales_lines`. Úsalo para recrear la base actual desde cero. Después del reset, la siguiente cuenta que inicie sesión se registra de nuevo: define `CLERK_ADMIN_IDS` para recuperar el acceso admin.

Tablas principales:

- `users` (`clerk_id` único, `role`: `admin | reader | NULL`).
- Canónica de ventas: `sales_orders` + `sales_order_lines` (identidad estable por `(pedido, nro. línea)`).
- Dimensiones: `sellers`, `customers`, `products`.
- Seguimiento/conciliación (no suman al dashboard): `sales_control_entries`, `customer_advances`, `reported_summaries`.
- Control de idempotencia: `import_batches` (hash SHA-256 por archivo).
- Histórica denormalizada en transición: `sales_lines`.

## Datos de ventas (Excel)

La web no importa automáticamente. Los scripts usan `DATABASE_URL`:

```bash
bun run datos:registrar  # carga los dos Excel (idempotente por hash)
bun run datos:eliminar   # borra solo registros comerciales, conserva users
```

- `detalle_pedidos_2026.xlsx` (`Detalle`, `Resumen`): única fuente canónica. Cada pedido va a `sales_orders` y sus productos a `sales_order_lines`. Reimportar actualiza correcciones sin duplicar.
- `control_ventas_2026.xlsx` (mensuales, `Totales`, `Adelanto`): solo seguimiento y conciliación. Va a `sales_control_entries`, `customer_advances` y `reported_summaries`; nunca se suma al dashboard.

Reglas aplicadas por `scripts/registrar-datos.ts`:

- SKU normalizado (se ignora un `/` inicial accidental pero se conserva el original).
- Vendedor/cliente desconocido como `NULL` (`Sin vendedor` / `No indicado` solo en pantalla).
- Fechas o importes inválidos rechazan la fila con reporte en consola, sin inventar valores.
- Cada archivo se registra por hash en `import_batches` para no duplicar la misma versión.
- Las filas anónimas de `Adelanto` se conservan tal cual, sin heredar cliente.

## Desarrollo

```bash
bun run dev      # Vite dev en http://localhost:3000
bun run build    # build de producción (Nitro preset node-server → .output/)
bun run preview  # previsualiza el build
```

Consultas de ventas, pedidos y perfiles salen de PostgreSQL vía Server Functions (`src/server/users.ts`, `src/server/sales.ts`).

Funcionalidad del dashboard (`src/components/dashboard-view.tsx` y `src/components/features/`):

- Resumen: ventas totales, pedidos completados, ticket medio y unidades vendidas + gráficos mensuales.
- Pedidos: TanStack Table con búsqueda, ordenación, paginación y filtro de fecha. El nº de pedido abre un Sheet con detalle (marca, categoría, medio de pago, distrito) y menú contextual con clic derecho.
- Productos, vendedores, conciliación control vs. detalle y administración de usuarios.

## Calidad de código

```bash
bun run lint    # biome lint
bun run format  # biome format
bun run check   # biome check
```

## Despliegue con Docker Compose

`Dockerfile` tiene etapa `build` (Bun → `bun run build` → `.output/`) y etapa `datos` (Bun + scripts + assets para importaciones).

```bash
cp .env.example .env   # y configura las 4 variables (+ APP_PORT opcional)
docker compose run --rm datos bun run db:reset        # desde cero (borra usuarios y ventas)
# o bien, si la base ya está vacía:
docker compose run --rm datos bun run db:migrate
docker compose run --rm datos bun run datos:registrar # opcional, carga los Excel
docker compose up --build -d                          # app en http://localhost:3000 (o APP_PORT)
docker compose run --rm datos bun run datos:eliminar  # solo ventas, conserva users
```

Notas:

- `DATABASE_URL` debe ser accesible desde el contenedor. Si Postgres corre en el host, usa `host.docker.internal` en vez de `localhost`; en otro servidor, su dirección accesible desde Docker. La base debe permitir crear tablas e índices.
- `VITE_CLERK_PUBLISHABLE_KEY` se incorpora al cliente durante el build: si cambia, repite `docker compose up --build -d`.
- En producción la imagen ejecuta `node .output/server/index.mjs` (Nitro `node-server`).

## Estructura

```
src/
  routes/            # / (login), /espera, /dashboard/* (index, pedidos, productos, vendedores, conciliacion, usuarios)
  server/            # schema.ts, users.ts (auth + roles + dashboard), sales.ts (consultas)
  components/        # dashboard-view.tsx, data-table.tsx, sales-columns.tsx, ui/, features/, shared/
  assets/            # Excel de origen (detalle_pedidos_2026.xlsx, control_ventas_2026.xlsx)
  hooks/ lib/ types/ # utilidades, formato, tipos
scripts/             # registrar-datos.ts, eliminar-registros.ts, reiniciar-base.ts
drizzle/             # migraciones generadas por Drizzle Kit
```

## Scripts disponibles

| Script | Comando | Descripción |
|---|---|---|
| `dev` | `vite dev --host 0.0.0.0 --port 3000` | Servidor de desarrollo |
| `build` / `preview` | `vite build` / `vite preview` | Build y preview Nitro |
| `db:generate` | `drizzle-kit generate` | Nueva migración desde `schema.ts` |
| `db:migrate` | `drizzle-kit migrate` | Aplica migraciones |
| `db:reset` | `reiniciar-base.ts && db:migrate` | Borra y recrea esquema |
| `datos:registrar` | `bun scripts/registrar-datos.ts` | Importa ambos Excel |
| `datos:eliminar` | `bun scripts/eliminar-registros.ts` | Borra datos comerciales |
| `lint` / `format` / `check` | `biome ...` | Lint y formato |
