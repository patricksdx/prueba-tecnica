Welcome to your new TanStack Start app!

# Getting Started

To run this application:

```bash
bun install
bun --bun run dev
```

# Building For Production

To build this application for production:

```bash
bun --bun run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.

### Removing Tailwind CSS

If you prefer not to use Tailwind CSS:

1. Remove the demo pages in `src/routes/demo/`
2. Replace the Tailwind import in `src/styles.css` with your own styles
3. Remove `tailwindcss()` from the plugins array in `vite.config.ts`
4. Remove `@tailwindcss/vite` and `tailwindcss` from `package.json`

## Linting & Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The following scripts are available:


```bash
bun --bun run lint
bun --bun run format
bun --bun run check
```


## Deploy with Nitro

This project uses Nitro as a generic server adapter, so it can run on any Node-compatible host.

```bash
npm run build
node dist/server/index.mjs
```

The build output is a self-contained Node server. To deploy, push the `dist/` directory to your host (Render, Fly.io, your own VPS, etc.) and run the server command above.

For host-specific presets (Vercel, Netlify, Cloudflare, AWS Lambda, etc.) and tuning, see https://v3.nitro.build/deploy.



## Routing

This project uses [TanStack Router](https://tanstack.com/router) with file-based routing. Routes are managed as files in `src/routes`.

### Adding A Route

To add a new route to your application just add a new file in the `./src/routes` directory.

TanStack will automatically generate the content of the route file for you.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/react-router`.

```tsx
import { Link } from "@tanstack/react-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent).

### Using A Layout

In the File Based Routing setup the layout is located in `src/routes/__root.tsx`. Anything you add to the root route will appear in all the routes. The route content will appear in the JSX where you render `{children}` in the `shellComponent`.

Here is an example layout that includes a header:

```tsx
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts).

## Server Functions

TanStack Start provides server functions that allow you to write server-side code that seamlessly integrates with your client components.

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// Use in a component
function MyComponent() {
  const [time, setTime] = useState('')
  
  useEffect(() => {
    getServerTime().then(setTime)
  }, [])
  
  return <div>Server time: {time}</div>
}
```

## API Routes

You can create API routes by using the `server` property in your route definitions:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters).


# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.


# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

For TanStack Start specific documentation, visit [TanStack Start](https://tanstack.com/start).
# Dashboard Acme

La ruta `/` contiene solamente el inicio de sesión de Clerk. El dashboard vive en `/dashboard` y exige una sesión válida. Al entrar, el servidor consulta al usuario en Clerk y sincroniza su ID, correo y nombre en PostgreSQL usando Drizzle.

## Configuración

Define estas variables en el `.env` local (no se sube a Git):

- `VITE_CLERK_PUBLISHABLE_KEY`: clave pública de la aplicación Clerk.
- `CLERK_SECRET_KEY`: clave secreta de Clerk, solo para el servidor.
- `DATABASE_URL`: cadena de conexión PostgreSQL.
- `CLERK_ADMIN_IDS`: IDs de Clerk separados por coma para promover al primer administrador.

Configura `CLERK_ADMIN_IDS` con el ID Clerk del primer administrador: todos los registros nuevos comienzan sin rol y quedan en `/espera`; desde administración se les puede asignar `Lectura`, `Administrador` o devolverlos a espera. Activa Google como proveedor social desde la configuración de Clerk para que se ofrezca en el modal de acceso. Ejecuta `bun run dev` para iniciar después de preparar la base de datos.

### Esquema y migraciones (Drizzle Kit)

Las tablas se crean con migraciones, no durante las consultas de la web. Con `DATABASE_URL` configurada:

```bash
bun run db:reset        # Primera transición: borra usuarios y ventas anteriores y recrea el esquema
bun run datos:registrar # Opcional: vuelve a cargar las ventas desde el Excel
bun run dev
```

`db:reset` borra los registros de `users` y `sales_lines` y el historial de migraciones de Drizzle en esa base. La siguiente cuenta que inicie sesión se registrará de nuevo; asegúrate de definir `CLERK_ADMIN_IDS` para recuperar el acceso de administrador. Para una base nueva o futuras versiones usa `bun run db:migrate` sin borrar datos. Si cambias `src/server/schema.ts`, genera otra migración con `bun run db:generate` y aplícala con `bun run db:migrate`.

### Datos de ventas del Excel

La web no importa registros automáticamente. Para cargar manualmente `src/assets/detalle_pedidos_2026.xlsx` en la base indicada por `DATABASE_URL` ejecuta `bun run datos:registrar`. Los registros existentes no se duplican si ejecutas el comando otra vez. Para borrar solamente los registros de ventas (`sales_lines`) y conservar los usuarios (`users`), ejecuta `bun run datos:eliminar`. Después puedes volver a importar el Excel para revisar los detalles en el dashboard.

Las tablas utilizan shadcn/ui y TanStack Table v9: búsqueda, ordenación, paginación y filtro de fecha para pedidos. El número de pedido abre un Sheet con su detalle y tiene menú contextual al hacer clic derecho.

El dashboard incluye un resumen con ventas totales, pedidos completados, ticket medio y unidades vendidas; gráficos mensuales y accesos a las vistas de pedidos, productos, vendedores y, para administradores, usuarios. Usa Card, Chart, Tabs, Sidebar, Badge y Sheet de shadcn/ui.

Las ventas, los pedidos y los perfiles de usuario se consultan desde PostgreSQL.

## Despliegue con Docker Compose

1. Copia `.env.example` a `.env` y configura `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL` y `CLERK_ADMIN_IDS`. `APP_PORT` permite cambiar el puerto publicado (por defecto, `3000`).
2. Para recrear la base actual desde cero, ejecuta `docker compose run --rm datos bun run db:reset` (elimina usuarios y ventas). Si ya está vacía, usa `docker compose run --rm datos bun run db:migrate`.
3. Si quieres cargar los datos del Excel, ejecuta `docker compose run --rm datos bun run datos:registrar`.
4. Ejecuta `docker compose up --build -d` y abre `http://localhost:3000` (o el puerto indicado en `APP_PORT`).

`DATABASE_URL` debe apuntar a una instancia PostgreSQL accesible desde el contenedor. Si PostgreSQL corre en la máquina anfitriona, usa `host.docker.internal` como host de la conexión en lugar de `localhost`; en otro servidor, usa su dirección accesible desde Docker. La base de datos debe permitir crear tablas e índices. Para borrar solo ventas y conservar usuarios usa `docker compose run --rm datos bun run datos:eliminar`. El servicio de mantenimiento solo se inicia al ejecutar uno de esos comandos.

La clave pública `VITE_CLERK_PUBLISHABLE_KEY` se incorpora al cliente durante el build: si cambia, ejecuta de nuevo `docker compose up --build -d`. Las otras variables se pasan al contenedor al arrancar.
