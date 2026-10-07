# PixelIA

Director creativo asistido por IA de **PIXELES**. Cada usuario tiene sus **Pixels** (workspaces):
uno por cada marca (**Pixel Enterprise**: estudia el ADN de la marca y lo materializa en un personaje
3D) y uno personal (**Pixel Personal**: tu director creativo personal, con su propio ADN, avatar y
chat). Ver `docs/WORKSPACES.md`, `docs/PERSONAL.md` y, para la identidad visual, `CLAUDE.md` ›
Identidad visual.

> Estado: **MVP 0.1 — base técnica, autenticación y empresas listas.** Ver [`docs/BACKLOG.md`](./docs/BACKLOG.md).

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
#    a) Local instalado:  mongod --dbpath ./data   (o el servicio del sistema)
#    b) Docker:           docker run -d --name pixel-mongo -p 27017:27017 mongo:7
#    c) Atlas:            pon la URI mongodb+srv://... en apps/api/.env

# 4. Desarrollo: contracts (watch) + API + web
npm run dev
```

- Web: http://localhost:5173 (crea una cuenta en `/register`)
- API: http://localhost:4000/api/health (también accesible desde la web vía proxy en `/api/health`)

Define `JWT_SECRET` en `apps/api/.env` (≥ 32 caracteres; obligatorio en producción). Para generarlo:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Sin él, en desarrollo se
usa un secreto de desarrollo y la API lo avisa en el log.

**IA**: sin configuración, Pixel responde en **modo demo** (reglas locales a partir del ADN, sin
modelo de lenguaje). Para respuestas reales con Claude, añade `ANTHROPIC_API_KEY` en `apps/api/.env`
(opcional `AI_MODEL`, por defecto `claude-opus-5-5`). La prueba con el modelo real
(`apps/api/test/chat.live.test.ts`) solo corre cuando esa clave existe.

La API arranca aunque MongoDB no esté disponible: `/api/health` responde `503` con
`"status": "degraded"` y reintenta la conexión cada 5 s. El header de la web muestra ese estado.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Compila contracts y levanta contracts (watch), API (`tsx watch`) y web (Vite) |
| `npm run typecheck` | TypeScript en todos los workspaces |
| `npm run lint` | ESLint |
| `npm run test` | Vitest en todos los workspaces (la API usa un MongoDB efímero; la primera vez descarga ~100 MB) |
| `npm run build` | Build de producción: contracts → api → web |
| `npm run format` | Prettier |
| `npm run migrate:workspaces` | Migra empresas anteriores a los workspaces (`-- --dry-run` para simular). Ver `docs/WORKSPACE-MIGRATION.md` |
| `npm run start -w @pixel/api` | API compilada (`dist/`) tras `npm run build` |

## Estructura

```
apps/web            React + Vite + Tailwind (shell y pantallas)
apps/api            Express + Mongoose (módulos: auth, companies, brand-dna, avatars, conversations, creative-memory)
packages/contracts  Schemas Zod y tipos compartidos
docs/               MVP, arquitectura, entidades, backlog
```

## Documentación

- [`CLAUDE.md`](./CLAUDE.md) — reglas de trabajo y principios arquitectónicos.
- [`docs/MVP.md`](./docs/MVP.md) — alcance, flujo completo y criterios de éxito.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — arquitectura, capa de IA, API, seguridad, riesgos.
- [`docs/ENTITIES.md`](./docs/ENTITIES.md) — entidades y reglas de aislamiento.
- [`docs/BACKLOG.md`](./docs/BACKLOG.md) — backlog técnico por etapas.
- [`docs/WORKSPACES.md`](./docs/WORKSPACES.md) — Workspaces: Enterprise y Personal.
- [`docs/PERSONAL.md`](./docs/PERSONAL.md) — Pixel Personal: perfil, ADN personal, avatar y chat.
- [`docs/WORKSPACE-MIGRATION.md`](./docs/WORKSPACE-MIGRATION.md) — migración Company → Workspace.
