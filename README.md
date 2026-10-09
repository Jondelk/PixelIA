# PixelIA

Director creativo asistido por IA de **PIXELES**. Cada usuario tiene sus **Pixels** (workspaces):
uno por cada marca (**Pixel Enterprise**: estudia el ADN de la marca y lo materializa en un personaje
3D) y uno personal (**Pixel Personal**: tu director creativo personal, con su propio ADN, avatar y
chat). Todos organizan su trabajo con las mismas Operations: proyectos, tareas y contenido, aislados
por Pixel. Ver `docs/WORKSPACES.md`, `docs/PERSONAL.md`, `docs/ENTERPRISE-OPERATIONS.md` y, para
la identidad visual, `CLAUDE.md` › Identidad visual.

> Estado: **MVP 0.1 — Pixel Enterprise y Pixel Personal funcionales sobre Workspaces.** Estado real,
> última etapa y siguiente paso en [`docs/PIXEL_ESTADO.md`](./docs/PIXEL_ESTADO.md); etapas en
> [`docs/BACKLOG.md`](./docs/BACKLOG.md).

## Requisitos

- Node.js **22.12 o superior** (`nvm use` lee `.nvmrc`).
- npm 10+.
- MongoDB 6+ local, o un clúster de MongoDB Atlas.

## Puesta en marcha local

```bash
# 1. Dependencias de todo el monorepo
npm install

# 2. Variables de entorno (editar si hace falta, p. ej. MONGODB_URI para Atlas)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. MongoDB (elige una opción)
#    a) Local instalado:  mkdir -p ~/pixel-mongo && mongod --dbpath ~/pixel-mongo   (o el servicio del sistema)
#    b) Docker:           docker run -d --name pixel-mongo -p 27017:27017 mongo:7
#    c) Atlas:            pon la URI mongodb+srv://... en apps/api/.env

# 4. Desarrollo: contracts (watch) + API + web
npm run dev
```

- Web: http://localhost:5173 (crea una cuenta en `/register`)
- API: http://localhost:4000/api/health (también accesible desde la web vía proxy en `/api/health`)

Define `JWT_SECRET` en `apps/api/.env` (≥ 32 caracteres; obligatorio en producción). Para generarlo:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Solo si la variable no
existe, en desarrollo se usa un secreto de desarrollo y la API lo avisa en el log.

> ⚠️ `apps/api/.env.example` trae `JWT_SECRET=` y `AI_PROVIDER=` **vacíos**, y una variable vacía no
> valida: si copias el archivo sin tocarlo, la API (y `migrate:workspaces`) no arranca con «Variables
> de entorno inválidas». Da un valor a `JWT_SECRET` y borra la línea `AI_PROVIDER=` (o ponle `demo` o
> `anthropic`). Ver `docs/PIXEL_ESTADO.md` §11.

**IA**: sin `ANTHROPIC_API_KEY` y sin la variable `AI_PROVIDER` (ni siquiera vacía), Pixel responde
en **modo demo** (reglas locales a partir del ADN, sin modelo de lenguaje). Para respuestas reales
con Claude, añade `ANTHROPIC_API_KEY` en `apps/api/.env` y no fijes `AI_PROVIDER=demo`: si la
variable existe, manda ella (opcional `AI_MODEL`, por defecto `claude-opus-5-5`). Las pruebas con el
modelo real (`apps/api/test/chat.live.test.ts` y `contentPlanning.live.test.ts`) solo corren si
`ANTHROPIC_API_KEY` está en el entorno del proceso (p. ej. `ANTHROPIC_API_KEY=... npm run test`): los
tests no cargan `apps/api/.env`. **Pendiente**: ejecutar la del Content Planner y ajustar su prompt
(`docs/CONTENT-PLANNER.md §10`).

**Zona horaria**: `DEFAULT_TIMEZONE` (IANA, por defecto `America/Bogota`) define el "hoy" del Daily
Director para los Pixels que aún no tienen una propia.

La API arranca aunque MongoDB no esté disponible: `/api/health` responde `503` con
`"status": "degraded"` y reintenta la conexión cada 5 s. El header de la web muestra ese estado.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Compila contracts y levanta contracts (watch), API (`tsx watch`) y web (Vite) |
| `npm run typecheck` | TypeScript en todos los workspaces |
| `npm run lint` | ESLint |
| `npm run test` | Vitest en contracts, API y web. La API levanta un MongoDB efímero (mongodb-memory-server): el binario se descarga en `npm install`, o en la primera ejecución si aquella descarga falló. Sin red: `MONGOMS_SYSTEM_BINARY=/ruta/a/mongod` o `MONGODB_URI_TEST=<uri>` (`docs/PIXEL_ESTADO.md` §15) |
| `npm run build` | Build de producción: contracts → api → web |
| `npm run format` | Prettier |
| `npm run migrate:workspaces` | Migra empresas anteriores a los workspaces (`-- --dry-run` para simular). Ver `docs/WORKSPACE-MIGRATION.md` |
| `npm run start -w @pixel/api` | API compilada (`dist/`) tras `npm run build` |

## Estructura

```
apps/web            React + Vite + Tailwind (shell y pantallas)
apps/api            Express + Mongoose (módulos: health, auth, workspaces, companies, brand-dna, personal, avatars, conversations, creative-memory, operations, content-plans, daily-director, campaigns)
packages/contracts  Schemas Zod y tipos compartidos
docs/               Estado real (PIXEL_ESTADO), MVP, arquitectura, entidades, backlog, workspaces, migración, Pixel Personal, Operations, Content Planner y Daily Director
```

## Documentación

- [`CLAUDE.md`](./CLAUDE.md) — reglas de trabajo y principios arquitectónicos.
- [`docs/PIXEL_ESTADO.md`](./docs/PIXEL_ESTADO.md) — estado real del proyecto, decisiones y siguiente paso (continuidad entre sesiones).
- [`docs/MVP.md`](./docs/MVP.md) — alcance, flujo completo y criterios de éxito.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura, capa de IA, API, seguridad, riesgos.
- [`docs/ENTITIES.md`](./docs/ENTITIES.md) — entidades y reglas de aislamiento.
- [`docs/BACKLOG.md`](./docs/BACKLOG.md) — backlog técnico por etapas.
- [`docs/WORKSPACES.md`](./docs/WORKSPACES.md) — Workspaces: Enterprise y Personal.
- [`docs/PERSONAL.md`](./docs/PERSONAL.md) — Pixel Personal: perfil, ADN personal, avatar y chat.
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) — Shared Operations: proyectos, tareas y contenido de cualquier Pixel.
- [`docs/ENTERPRISE-OPERATIONS.md`](./docs/ENTERPRISE-OPERATIONS.md) — Operations en un Pixel de empresa: gating, aislamiento, Inicio y chat.
- [`docs/CAMPAIGNS.md`](./docs/CAMPAIGNS.md) — Campaign Manager: estrategia de campaña desde el BrandDNA, piezas y conversión a Operations.
- [`docs/CONTENT-PLANNER.md`](./docs/CONTENT-PLANNER.md) — Content Planner: estrategia de contenido con PersonalDNA y proyectos.
- [`docs/DAILY-DIRECTOR.md`](./docs/DAILY-DIRECTOR.md) — Daily Director: la dirección del día en Inicio.
- [`docs/WORKSPACE-MIGRATION.md`](./docs/WORKSPACE-MIGRATION.md) — migración Company → Workspace.
