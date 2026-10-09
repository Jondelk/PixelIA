# PIXEL — Estado real del proyecto

> **Documento de continuidad entre sesiones.** Léelo antes de tocar código. Describe lo que **existe
> en el repositorio**, no lo que dicen los prompts ni el resto de `docs/`, que tienen deriva (§12).
> Si el código y este documento no coinciden, **manda el código**: corrige este documento.
>
> - Última revisión: **2026-10-09**, rama `feat/prompts-9-11`: `e59757d` (contiene
>   `feat/etapa-0-foundation` en `c846956`) más dos commits del 2026-10-09 con la etapa
>   "Experiencia de entrada pública" y esta documentación (§0, §1).
> - Leyenda: ✅ implementado y verificado (tests automáticos; si solo hubo revisión manual, se dice) ·
>   🟨 parcial · 📝 solo planificado (docs o prompts, sin código) · ❓ pendiente de verificación ·
>   ⛔ bloqueado.

## 0. Resumen rápido

| Tema | Estado |
|---|---|
| Última etapa verificada | **Etapas O, C, D y E** de `BACKLOG.md`: Operations, Content Planner, Daily Director y Shared Operations + Enterprise Projects. Llegaron en un solo commit, `e59757d` ("Add Prompts 9-11…"), subido por el usuario el 2026-10-08 19:27 UTC desde su equipo (Claude Code en VS Code). Verificadas en esta sesión el mismo día (§13). |
| Prompts | Según `BACKLOG.md` de la rama: Prompt 9 = Operations, 10 = Content Planner, 11 = Daily Director, **12** = Shared Operations + Enterprise Projects; 13 = Campaign Manager (📝, no iniciado). ❓ El commit dice "Prompts 9-11" y el usuario habló de 9, 10 y 11: falta confirmar que la Etapa E corresponde a un Prompt 12. |
| Ramas | `feat/prompts-9-11` (nueva, en `origin`) = `feat/etapa-0-foundation` + este trabajo. `feat/etapa-0-foundation` sigue en `c846956`: **todavía no se ha fusionado**. |
| Última etapa | **Experiencia de entrada pública** (solo web): bienvenida con video, Explorar, modal de acceso y retomar la intención tras el acceso. Implementada y verificada el 2026-10-09 (§13); commit y push autorizados por el usuario el mismo día. Pedida "antes de continuar con el prompt 13"; el 2026-10-09 el usuario la llamó "prompt 13" al pedir que se completara: se interpretó como esta etapa, porque el Prompt 13 del backlog (Campaign Manager) no tiene ningún cambio. ❓ Confirmar la numeración. |
| Siguiente paso | Decisiones del usuario (§14): aportar el video final, decidir cómo fusionar las ramas y qué hallazgos de la revisión (§11) se corrigen antes del Campaign Manager. El avatar se trabajará después (petición del usuario). |
| Problema a conocer ya | Copiar `apps/api/.env.example` tal cual **impide arrancar la API** (`JWT_SECRET=` y `AI_PROVIDER=` vacíos no validan). Sigue igual en `e59757d`. Ver §11 y §15. |
| Cambios sin commit | Ninguno. El 2026-10-09 se confirmaron y subieron a `origin/feat/prompts-9-11`, con autorización del usuario, la etapa de entrada pública (solo `apps/web`; la API, los contratos y los datos no cambian) y la documentación (`CLAUDE.md`, `README.md`, `docs/BACKLOG.md` y `docs/PIXEL_ESTADO.md`, nuevo). |

## 1. Rama, commits y git

- Ramas en `origin`: `main` (solo `254e475 Initial commit`), `docs/mvp-0.1` (`c71bf68`, ya contenida),
  `feat/etapa-0-foundation` (`c846956`, Etapas 0 → P) y **`feat/prompts-9-11`** (`e59757d`, Etapas
  O, C, D y E encima de la anterior, más la etapa de entrada pública y esta documentación, del
  2026-10-09).
- La copia de trabajo de esta sesión está en `feat/prompts-9-11` (rama local que sigue a `origin`).
- No hay PRs (no se ha pedido ninguno), ni CI (`.github/` no existe), ni hooks de git en el repo.
- Práctica hasta el Prompt 8: cada etapa se cerró con commit + push en `feat/etapa-0-foundation`. Los
  Prompts 9–12 se hicieron en el equipo del usuario y se subieron en un solo commit a una rama
  aparte. **Desde el 2026-10-08 el usuario exige autorización explícita antes de cualquier commit**
  («No hagas commits sin mi autorización»). El entorno en la nube tiene un hook de parada
  (`~/.claude/stop-hook-git-check.sh`) que pide «commit and push» cuando hay cambios sin confirmar:
  **no es una autorización** del usuario.

| Commit | Fecha (UTC) | Autor | Mensaje |
|---|---|---|---|
| (el que añade este documento) | 2026-10-09 | Claude | Add continuity docs and record the public entry stage (`CLAUDE.md`, `README.md`, `docs/BACKLOG.md`, `docs/PIXEL_ESTADO.md`) |
| `24e300a` | 2026-10-09 | Claude | Add public entry experience: welcome, explore and auth modal (solo `apps/web`) |
| `e59757d` | 2026-10-08 19:27 | jondelk | Add Prompts 9-11: projects, tasks, content planner and daily director (144 archivos, +19 106 líneas) |
| `8c75a41` | 2026-10-07 23:36 | jondelk | Merge branch 'feat/etapa-0-foundation' (trae `c846956`; respecto a él solo cambia `package-lock.json`) |
| `a4d769f` | 2026-10-07 21:58 | jondelk | Merge branch 'feat/etapa-0-foundation' (trae `f5c21de`) |
| `256fed8` | 2026-10-07 20:42 | jondelk | checkpoint: enterprise MVP before workspace refactor (solo `package-lock.json`) |
| `c846956` | 2026-10-07 23:35 | Claude | Harden Pixel Personal after review |
| `03511a3` | 2026-10-07 23:16 | Claude | Add Pixel Personal MVP: profile, personal DNA, avatar, context and chat |
| `f5c21de` | 2026-10-07 21:56 | Claude | Harden workspace refactor after adversarial review |
| `ee6e180` | 2026-10-07 21:40 | Claude | Introduce Workspaces as Pixel's contextual boundary |
| `da6041a` | 2026-10-07 02:29 | Claude | Apply the PIXELES visual identity to the web app |
| `b502a15` | 2026-10-07 01:56 | jondelk | Merge branch 'feat/etapa-0-foundation' (trae `9692bba`) |
| `9692bba` | 2026-10-07 01:54 | jhon | Add PIXELES brand assets |
| `999ce79` | 2026-10-07 01:21 | Claude | Connect Pixel's brain to the avatar: first real conversation |
| `efd5165` | 2026-10-07 01:03 | Claude | Add parametric 3D Pixel avatar with React Three Fiber |
| `fd8ad03` | 2026-10-07 00:45 | Claude | Add Avatar Concept Engine: BrandDNA to versioned AvatarProfile |
| `c389251` | 2026-10-07 00:06 | Claude | Add Brand Brain: 8-step brand onboarding and deterministic BrandDNA |
| `ba1fb91` | 2026-10-06 23:51 | Claude | Add authentication and companies with per-owner access control |
| `d92127c` | 2026-10-06 01:02 | Claude | Build Etapa 0 foundation: monorepo, API base, contracts and web shell |
| `c71bf68` | 2026-10-06 00:47 | Claude | Add MVP 0.1 project context, architecture, entities and backlog |
| `254e475` | 2026-10-06 00:36 | Jondelk | Initial commit |

## 2. Historial: prompts ↔ etapas ↔ commits

El usuario numeró explícitamente los Prompts **0, 7, 8 y 11**, y nombró el 9 y el 10. La numeración
1–6 es **inferida** por orden: hay siete prompts sin número entre el 0 y el 7, y el de identidad
visual no tenía número. Los Prompts 9–12 se conocen por el `BACKLOG.md` de su rama: su texto no está
en este repositorio.

| Prompt | Tema | Etapa(s) de `BACKLOG.md` | Commits | Estado |
|---|---|---|---|---|
| 0 | Contexto maestro: `CLAUDE.md` y `docs/` | — | `c71bf68` | ✅ (documentación) |
| 1 (inferido) | Base técnica: monorepo, API base, contracts, shell web | 0 | `d92127c` | ✅ |
| 2 (inferido) | Autenticación y empresas | 3, 4 (y parte de 1 y 2) | `ba1fb91` | ✅ |
| 3 (inferido) | Brand Brain: onboarding de 8 pasos, BrandDNA determinista y plugin `tenantScoped` | 4, 6 (y parte de 1 y 2) | `c389251` | ✅ |
| 4 (inferido) | Avatar Concept Engine: BrandDNA → AvatarProfile versionado | 6 | `fd8ad03` | ✅ |
| 5 (inferido) | Avatar 3D paramétrico (React Three Fiber) | 7 | `efd5165` | ✅ |
| 6 (inferido) | Chat: primera conversación real con el ADN | 5, 8 | `999ce79` | ✅ |
| sin número | Identidad visual PIXELES | "Identidad visual PIXELES" | `9692bba`, `b502a15`, `da6041a` | ✅ (revisión manual; sin tests automáticos) |
| 7 | Workspaces: User → Workspace → Enterprise / Personal | W | `ee6e180`, `f5c21de` | ✅ |
| 8 | Pixel Personal MVP: perfil, PersonalDNA, avatar, contexto y chat | P | `03511a3`, `c846956` | ✅ |
| 9 | Operations: Projects, Tasks y ContentItems | O | `e59757d` | ✅ |
| 10 | Content Planner Personal | C | `e59757d` | ✅ (Enterprise: después) |
| 11 | Daily Director Personal | D | `e59757d` | ✅ (Enterprise y acciones: después) |
| 12 ❓ | Shared Operations + Enterprise Projects | E | `e59757d` | ✅ (número de prompt por confirmar) |
| sin número ❓ | Experiencia de entrada pública (bienvenida, Explorar, acceso) | "Experiencia de entrada pública" | 2026-10-09 (tras `e59757d`) | ✅ verificada el 2026-10-09; pendiente el video final. Pedida "antes del prompt 13"; el usuario la llamó luego "prompt 13" |
| 13 | Campaign Manager | — | — | 📝 planificado en `BACKLOG.md` y `ENTERPRISE-OPERATIONS.md` §10; no iniciado |

En la sesión remota del 2026-10-08, el Prompt 11 se recibió antes de que existieran sus
prerrequisitos en `origin`; aquí solo se comprobó que faltaban. Lo implementado es lo que llegó en
`e59757d`.

> ⚠️ **Colisión de nombres:** "Etapa 9" del backlog = CreativeMemory y "Etapa 10" = cierre end-to-end.
> No tienen relación con los Prompts 9 y 10 (Etapas O y C). Cita siempre "Prompt N" o "Etapa N".

## 3. Arquitectura actual

```
apps/web (React SPA) ── fetch /api + cookie pixel_session ──▶ apps/api (Express 5, monolito modular) ──▶ MongoDB
        │                                                          │
        └──────── @pixel/contracts (Zod, compilado a dist/) ◀──────┤
                                                                   └──▶ src/ai/ AIProvider: Anthropic | Demo
```

Modelo de dominio:

```
User → Workspace ─┬─ enterprise → Company → BrandDNA
                  ├─ personal   → PersonalProfile → PersonalDNA
                  ├─ compartidos: AvatarProfile · Conversation → Message · CreativeMemory (solo modelo)
                  ├─ operations: Project (→ Task, ContentItem) · Task · ContentItem   (Personal y Enterprise)
                  ├─ content planner: ContentPlan → ContentPlanItem (→ ContentItem al aceptar)   (solo Personal)
                  └─ daily director: DailyBrief (versión por día local; solo lee)   (solo Personal)
```

Qué funcionalidad tiene cada tipo lo decide `packages/contracts/src/capabilities.ts`
(`workspaceSupportsFeature`): Personal tiene `projects`, `tasks`, `content`, `contentPlanner` y
`dailyDirector`; Enterprise solo `projects`, `tasks` y `content`.

- **Cadena de una petición:**
  - Global: `requestLogger` → `cors` → `originGuard` (403 si un método no seguro llega con un
    `Origin` no permitido) → `express.json` (1 MB) → `cookieParser` → router `/api` → al final
    `notFoundHandler` y `errorHandler`.
  - Workspace: `requireAuth` → `requireWorkspaceAccess` (404 si no es del usuario) → según la ruta,
    `resolveWorkspaceDomain` (solo `/avatar`), `requirePersonalWorkspace` (`/personal-profile`,
    `/personal-dna`) o ninguno (`/`, `/company`, `/conversations`, `/projects`, `/tasks`, `/content`,
    `/operations`, `/content-plans`, `/daily-brief(s)`; en estas el servicio llama a
    `assertWorkspaceFeature`) → service → modelo
    (`tenantScoped` en los recursos aislados; `Workspace`, `Company` y `User` filtran por dueño).
  - Legacy: `requireAuth` → `requireCompanyAccess` (adjunta el workspace y lo migra si falta) →
    service.
- **Chat:** `chat.service.sendMessage` → `resolveContextBuilder(workspace.type)` →
  `EnterpriseContextBuilder` (añade el estado operativo: solo conteos) o `PersonalContextBuilder`
  (añade el DailyBrief vigente de hoy, marcado si está desactualizado) → brief (`<brand_context>` o
  `<personal_context>`) → `AIProvider.generateText` → solo si la IA respondió, guarda los dos
  mensajes (el de Pixel con `meta`: proveedor, modelo, modo, latencia y versiones de ADN/avatar). Un
  fallo de la IA responde 422/503 sin guardar nada; sin contexto, 409 antes de llamarla.
- **Dónde se usa IA hoy:** el chat (`generateText`) y tres salidas estructuradas
  (`generateStructuredOutput`): el enriquecimiento opcional del PersonalDNA, el
  `ContentPlanningEngine` y el `DailyDirectorEngine`. Las dos últimas usan ids controlados y caen a
  un resultado determinístico si la IA falla o está en modo demo. BrandDNA y avatares son **reglas
  deterministas versionadas**.
- **Arranque de la API (`server.ts`):** `dotenv/config` → `loadEnv()` (falla rápido si el entorno
  no valida) → `startDatabase()` **sin bloquear** (si Mongo no responde, `/api/health` da 503
  `degraded` y reintenta cada 5 s) → `createAIProvider()` + `createApp()` → `listen(PORT)` inmediato.
  En paralelo, al conectar por primera vez, `upgradeAvatarProfileIndexes()` (idempotente; si falla se
  registra y la API sigue).

## 4. Tecnologías y estructura

| Pieza | Versión instalada |
|---|---|
| Node / npm | `engines.node >=22.12.0`, `.nvmrc` = 22 (verificado con v22.22.0 / 10.9.4) |
| TypeScript | 6.0.3 (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ESM) |
| API | Express 5.2.1, Mongoose 9.11.0, Zod 4.6.5, jsonwebtoken, bcryptjs, `@anthropic-ai/sdk` 0.131.0, tsx |
| Web | React 19.3.0, react-router 7.18.4, Vite 8.3.2, Tailwind 4.3.3 (sin `tailwind.config`), three 0.186.1, R3F 9.8.1, Drei 10.7.9 |
| Calidad | ESLint 10 (flat) + typescript-eslint 8, Prettier 3 (ignora `*.md`), Vitest 5, supertest, mongodb-memory-server 11.3 |

```
apps/api/src
  ai/            AIProvider, brief, errors, providers/{anthropic,demo}.provider.ts  ← único sitio con SDKs de IA
  config/env.ts  db/{connection,tenantScoped.plugin}.ts  lib/{errors,logger,mongo}.ts
  middleware/    requireAuth, requireWorkspaceAccess, requireCompanyAccess, originGuard, errorHandler…
  modules/       auth · health · workspaces · companies · brand-dna · personal · avatars · conversations · creative-memory
                 · operations · content-plans · daily-director
apps/api/scripts/migrate-companies-to-workspaces.ts      apps/api/test/  (34 archivos + support/ + fixtures/)
apps/web/src
  app/           router, AppShell, Sidebar, Header, navigation, theme
  features/      auth · dashboard · workspaces · companies · onboarding · brand · personal · pixel · chat · avatar3d · system
                 · operations · content-planner · daily-director
  components/    Button, Field, Alert, EmptyState, DnaBlocks, Reveal, BrandLogo, Pixi, rise…
  lib/           api.ts (fetch + validación Zod), apiPaths.ts, forms.ts, useResource.ts
  styles/theme.css  ← único archivo de tokens
packages/contracts/src   24 módulos reexportados por index.ts (se consume solo desde dist/)
```

## 5. Módulos implementados (estado real)

### API (`apps/api/src/modules`)

| Módulo | Contenido real | Estado |
|---|---|---|
| `health` | `GET /api/health` (200 `ok` / 503 `degraded`) | ✅ |
| `auth` | register, login, logout, me; cookie httpOnly `pixel_session` (JWT HS256) | ✅ |
| `workspaces` | Alta, listado, lectura y `PATCH` (`name`, `status`, `timezone` IANA), sin `DELETE`; un Personal por usuario; `POST /:id/company`; migración perezosa (al listar workspaces o empresas y en cada acceso legacy `/api/companies/:id/...`; si la empresa no está migrada, incluso un GET escribe) | ✅ (`archived` se guarda y la API no lo aplica: el workspace sigue accesible; la web solo muestra "Archivado" en "Tus Pixels"; no hay UI para archivar) |
| `companies` | Alta, listado, lectura y `PATCH` legacy, sin `DELETE`; crear empresa crea también su workspace (rollback lógico) | ✅ (PATCH sin UI) |
| `brand-dna` | Onboarding de marca de 8 pasos y BrandDNA determinista `rules-1`, versionado | ✅ (sin IA; solo ruta legacy `/companies/:id/brand-dna`) |
| `personal` | PersonalProfile (onboarding de 8 pasos), PersonalDNA `personal-rules-1` (+`+ai` opcional verificado), versiones, `overrides`, dedupe | ✅ |
| `avatars` | `rulesAvatarEngine` (`avatar-rules-1`) y `personalAvatarEngine` (`personal-avatar-rules-1`); un router (workspace y legacy) resuelto por tipo; versiones e `isStale` | ✅ |
| `conversations` | Conversaciones y mensajes por workspace; chat Enterprise y Personal; IA real o demo | ✅ |
| `creative-memory` | Modelo y contrato; los context builders leen memorias activas | 🟨 router vacío: sin endpoints ni forma de crearlas |
| `operations` | Project, Task y ContentItem por workspace (Personal y Enterprise); `DELETE` de proyecto **archiva**; `DELETE` de tarea o contenido borra; resumen `/operations/summary` | ✅ |
| `content-plans` | ContentPlan + ContentPlanItem; `ContentPlanningEngine` (IA con ids controlados + fallback); aceptar un ítem crea su ContentItem (idempotente); `DELETE` archiva | ✅ solo Personal; la prueba con Claude real está pendiente (`CONTENT-PLANNER.md` §10) |
| `daily-director` | DailyBrief por día local y versión; `DailyDataCollector`, `PriorityScorer`, `ProjectHealth`, `ContentHealth`, `DailyDirectorEngine` (IA + fallback determinístico), detección de "desactualizado" | ✅ solo Personal; sin prueba con Claude real |

### Web (`apps/web/src/features`)

| Feature | Estado |
|---|---|
| `auth` (login, registro, guards) · `dashboard` ("Tus Pixels") · `workspaces` (layout, Inicio, "Nuevo Pixel") | ✅ |
| `public` (bienvenida `/`, Explorar y su detalle, modal de acceso `?auth=`) · `auth` compartido entre páginas y modal (`AuthForms`, `redirect.ts` con `safeNextPath`) · `workspaces/PixelStartPage` (retoma la intención) · recursos en `src/brand/experience.ts` | ✅ (2026-10-09); video final pendiente: hoy solo poster |
| `companies` (lista, nueva empresa, resumen) · `onboarding` (Brand Brain) · `brand` ("Así entiende Pixel tu marca") | ✅ (sin edición de empresa) |
| `personal` (Inicio, onboarding, "Así te entiende Pixel", Mi Pixel, Chat) | ✅ (sin edición directa del ADN: `updatePersonalDna` existe sin pantalla) |
| `pixel` (`PixelPage` + `PixelStudio`) · `chat` (`ChatPage` + `ChatStudio`) · `avatar3d` (renderer) · `system` (estado API, 404) | ✅ |
| `operations` (Proyectos, detalle, Tareas, Contenido; compartidas por Personal y Enterprise con `operationsCopy`) · `content-planner` (planes e ítems) · `daily-director` ("Tu día" en el Inicio Personal) | ✅ |

Tests web: entorno `node`, sin DOM. Además de funciones puras, los de Operations, Content Planner y
Daily Director renderizan vistas con `renderToStaticMarkup`; no hay tests de interacción.

## 6. Pixel Personal vs Pixel Enterprise

Comparten **Pixel Core** (workspace, avatar, conversaciones, memoria, `ChatStudio`, `PixelStudio`,
`WizardLayout`, `DnaBlocks`) pero usan **contextos de dominio distintos**.

| Aspecto | Enterprise | Personal |
|---|---|---|
| Cardinalidad | N por usuario; 1 workspace = 1 Company | 1 por usuario (índice `one_personal_per_owner`) |
| Nombre | El de la empresa: al renombrarla (`PATCH /companies/:id` o paso `company`) se copia al workspace; `PATCH /workspaces/:id` no renombra la empresa (un solo sentido) | Al crearlo, `user.name` (≥ 2 caracteres) o "Mi Pixel Personal" (lo decide la web). El paso `identity` guarda `PersonalProfile.name`, que no se copia al workspace: Inicio (configurado), Mi Pixel y Chat muestran `personal.name ?? workspace.name`; "Tus Pixels" muestra `workspace.name` |
| Entrada web | `/company/:companyId/...`; `/workspace/:id` redirige allí si tiene empresa | `/workspace/:workspaceId/...` |
| Rutas API | Legacy `/api/companies/:id/...` (único acceso a `brand-dna`) + `/api/workspaces/:id` (GET, PATCH y `POST …/company`, que la web usa para completar un Pixel de empresa vacío) + `/api/workspaces/:id/{avatar,conversations}` (disponibles, pero la web Enterprise aún llama a las legacy para avatar y chat) | Solo `/api/workspaces/:id/...` |
| Onboarding | 8 pasos: company, purpose, audience, personality, communication, visual, competition, creative | 8 pasos: identity, goals, audience, personality, communication, creative, contentWork, support |
| ADN | `BrandDNA` (`brand_dnas`, aislado por `companyId`); se genera síncrono al guardar cualquier paso cuando los 8 están completos (versión nueva solo si cambia el `sourceHash`) | `PersonalDNA` (`personal_dnas`, por `workspaceId`); se sincroniza al guardar con los 8 pasos completos o con `POST …/personal-dna/generate`; correcciones con `PUT` |
| Avatar | `sourceType: brand`, con `companyId` y `brandDnaVersion`; generación manual | `sourceType: personal` y `personalDnaVersion`; el documento **no** guarda `companyId` (un `null` entraría en los índices parciales `$exists`; solo el DTO devuelve `companyId: null`); generación manual; nunca lee BrandDNA |
| Contexto IA | Company → BrandDNA → AvatarProfile → CreativeMemory → estado operativo (solo conteos) | PersonalProfile → PersonalDNA → AvatarProfile → CreativeMemory → DailyBrief vigente (segunda persona) |
| Operations | Proyectos, tareas y contenido en `/workspace/:id/{projects,tasks,content}` (se quedan en `/workspace`: `enterpriseStaysInWorkspace`) | Las mismas pantallas y endpoints |
| Content Planner y Daily Director | No disponibles: API 400 `feature_not_available`, la web los oculta (`FeatureOnly`) | Disponibles; necesitan el PersonalDNA (sin él, 409 `personal_context_not_configured`) |
| Sin configurar | Chat: 409 `enterprise_company_missing` / `brand_dna_missing` (sin llamar a la IA). Avatar sin ADN o workspace sin empresa: 409 **sin** `details.reason` | Chat: 409 `personal_context_not_configured` (sin llamar a la IA). Avatar: 409 `personal_dna_missing`. `personal-dna/generate` incompleto y `PUT personal-dna` sin ADN: 409 sin `reason` |
| Estado | `Company.status`: `draft` → `onboarding` (1.er paso guardado) → `ready` (al generar el avatar); "Tus Pixels" muestra "Configurado" solo con `ready` | Sin campo de estado: la web lo deriva del resumen `personal` (`completedSteps`, `personalDnaVersion`) en `workspaceStatus.ts` y muestra "Configurado" en cuanto existe el PersonalDNA (salvo si está archivado), sin esperar al avatar. `personalDnaCompleteness()` solo mide cuánto del ADN está relleno |

## 7. Funcionalidades

### Terminadas ✅

Auth con cookie · empresas · Brand Brain + BrandDNA · Avatar Concept Engine · renderer 3D con 5
estados (`idle`, `thinking`, `listening`, `speaking`, `happy`) y respaldo SVG · chat Enterprise
(Anthropic o demo) · identidad PIXELES (tema oscuro, modo claro de sesión, Pixi; revisada a mano,
sin tests automáticos) · Workspaces y migración Company → Workspace · Pixel Personal (onboarding,
PersonalDNA, avatar, chat) · Operations para Personal y Enterprise (Etapas O y E) · Content Planner
Personal (Etapa C) · Daily Director Personal (Etapa D). Las tres últimas, verificadas con tests y en
modo demo; con Claude real, sin probar (❓). Experiencia de entrada pública (solo web,
verificada en navegador el 2026-10-09; falta el video final).

### Parciales o abiertas 🟨

- **CreativeMemory (Etapa 9):** solo modelo, contrato y lectura en los context builders.
- **IA en BrandDNA y avatar (Etapa 6):** hoy solo reglas deterministas.
- **Avatar 3D (Etapa 7):** afinar otros sujetos; `surfaceDetail` `grain` y `veins` solo en la vista 2D.
- **Convergencia Enterprise → `/workspace`:** planificada (`WORKSPACES.md`); no existe
  `/api/workspaces/:id/brand-dna`.
- **UI pendiente con API existente:** editar empresa (`PATCH /companies/:id`), renombrar o archivar
  workspace (`PATCH /workspaces/:id`), editar el PersonalDNA (`PUT personal-dna`), regenerar un
  PersonalDNA existente (`POST …/personal-dna/generate`).
- **Identidad:** SVG oficiales y Pixi transparente pendientes de PIXELES; decisión "60 % Pixi /
  40 % ADN" pendiente con producto.

### Planificado, sin código 📝

- **Análisis asíncrono de marca** (`onboarding/submit`, `analysis/retry`, polling, estados
  `analyzing`/`failed`, `ANALYSIS_TIMEOUT_MS`, ADR 6): descrito en `MVP.md` y `ARCHITECTURE.md`,
  **no existe**. El flujo real es síncrono (§8, D8).
- Endpoints de memorias y "Recordar esto" (Etapa 9). Cierre end-to-end con seed (Etapa 10).
- Streaming de respuestas (SSE) y voz (Etapa 8; la voz en tiempo real está fuera del alcance del MVP).
- Etapa W pendiente: pasar los clientes web Enterprise de avatar y chat a `/api/workspaces/...` y
  retirar las rutas legacy; retirar `companyId` legacy y `Company.ownerId`; miembros y roles por
  workspace (hoy solo el dueño).
- Etapa 7: cejas y expresiones adicionales del avatar.
- **Campaign Manager (Prompt 13):** se apoyará en las Operations Enterprise
  (`ENTERPRISE-OPERATIONS.md` §10). No iniciado.
- Content Planner y Daily Director para Enterprise, y acciones del Daily Director sobre tareas
  ("después", según `BACKLOG.md`).

### Pendiente de verificación ❓

- Si la Etapa E corresponde a un "Prompt 12" (el commit dice "Prompts 9-11").
- `contentPlanning.live.test.ts` con Claude real, y ajuste del prompt del planner
  (`CONTENT-PLANNER.md` §10). El `DailyDirectorEngine` tampoco se ha probado con Claude real.
- `chat.live.test.ts` con Claude real (se salta sin `ANTHROPIC_API_KEY`).
- El enriquecimiento IA del PersonalDNA (`personal-rules-1+ai`) con Claude real:
  `AnthropicProvider.generateStructuredOutput` no tiene ningún test (`anthropicProvider.test.ts`
  solo cubre `generateText`) y el generador solo se probó con un proveedor falso. "Verificada" en §5
  y D10 significa que descarta lo no respaldado por el onboarding, no que se probara con Claude.
- La migración Company → Workspace sobre datos reales (solo probada en tests y con bases locales).

## 8. Decisiones técnicas y razones

| # | Decisión | Razón o efecto | Referencia |
|---|---|---|---|
| D1 | El workspace es la frontera de aislamiento; `tenantScoped` exige un valor concreto (ObjectId, string o `{ $eq }`) | Una consulta olvidada o un operador inyectado (`$ne`, `$in`, `$exists`, `$regex`) no puede cruzar tenants | `db/tenantScoped.plugin.ts`, `tenantScoped.test.ts` |
| D2 | Recurso ajeno → 404, nunca 403 | No revelar que existe | `requireWorkspaceAccess.ts` |
| D3 | Endpoint de otro tipo → 400 `workspace_type_mismatch`; tipo correcto sin configurar → 409 | Separar "esta ruta no existe para este tipo" (error del cliente) de "falta configurarlo", como pidió el Prompt 8. Hoy la web solo lee `details.reason` en `ChatStudio` (y solo `PersonalChatPage` pasa `onNotConfigured`); ninguna pantalla consume `workspace_type_mismatch` | `WORKSPACES.md`, `PERSONAL.md`, `requireWorkspaceAccess.ts` |
| D4 | Se conservan las rutas legacy `/api/companies` y se redirige el workspace enterprise | No romper Enterprise mientras converge | `WORKSPACES.md` |
| D5 | Migración perezosa + script idempotente; se conservan `ownerId` y `companyId` legacy | Sin ventana de mantenimiento y con rollback | `WORKSPACE-MIGRATION.md` |
| D6 | Crear empresa + workspace con rollback lógico, sin transacciones | MongoDB local no admite transacciones | `WORKSPACES.md` |
| D7 | BrandDNA y avatares por reglas deterministas versionadas (`rules-1`, `avatar-rules-1`, `personal-avatar-rules-1`) | Reproducibles y testeables; la app funciona sin API key | `BACKLOG.md` Etapa 6 |
| D8 | BrandDNA síncrono al guardar cualquier paso con los 8 completos (versión nueva si cambia el `sourceHash`); avatar con botón | Sustituye en la práctica al diseño asíncrono (ADR 6), que nunca se implementó | `brandDna.service.ts`, `avatar.service.ts` |
| D9 | Índices parciales en `avatar_profiles` + `upgradeAvatarProfileIndexes()` al arrancar y en el script | Varios avatares personales sin `companyId` sin perder la unicidad Enterprise; idempotente | `PERSONAL.md`, `avatarIndexes.test.ts` |
| D10 | PersonalDNA: reglas + IA opcional **verificada** (descarta lo no respaldado por el onboarding); arquetipos solo desde rasgos | No inventar datos de una persona | `PERSONAL.md` |
| D11 | PersonalDNA versionado: las `overrides` manuales (`PUT personal-dna`) se acumulan y se reaplican cuando cambian las respuestas; `POST …/personal-dna/generate` (`force`; en el código y en `PERSONAL.md` se le llama "Regenerar desde mis respuestas") las descarta; la web solo lo llama desde "Generar mi ADN", cuando aún no hay ADN. Dedupe en `syncPersonalDna`: `sourceHash` + `generator.kind` + `overrides` idénticas (el `PUT` no deduplica); único `{workspaceId, version}` | Correcciones del usuario persistentes salvo regeneración explícita; sin versiones duplicadas por concurrencia | `personal.service.ts`, `personalDna.test.ts` |
| D12 | Un solo router de avatar (montado en `/api/workspaces/:id/avatar` y en la legacy `/api/companies/:id/avatar`) resuelto por `workspace.type` | Pixel Core compartido sin duplicar lógica | `avatars.routes.ts`, `modules/index.ts` |
| D13 | `ContextBuilder` por estrategia; sin ADN → 409 sin llamar a la IA | Nunca responder con contexto inventado | `contextBuilders.test.ts` |
| D14 | `DemoProvider` determinista. `AI_PROVIDER` (`anthropic \| demo`) es opcional: si no existe, vale `anthropic` con `ANTHROPIC_API_KEY` y `demo` sin ella; si existe, manda la variable | App y tests sin clave ni coste | `config/env.ts`, `ai/index.ts` |
| D15 | `ANTHROPIC_API_KEY` no está en el objeto `Env`; el SDK la lee de `process.env` | El secreto no circula por la configuración | `config/env.ts` |
| D16 | Sesión en cookie httpOnly + `originGuard`; sin tokens en JS | Reduce XSS/CSRF | `auth/session.ts` |
| D17 | Pixel Core web compartido (`ChatStudio`, `PixelStudio`, `WizardLayout`, `DnaBlocks`, `apiBase`) | No duplicar pantallas por tipo | `WORKSPACES.md` |
| D18 | Identidad PIXELES: Pixi ≠ Pixel; arranque siempre en oscuro; tokens solo en `theme.css` | Instrucciones del prompt de identidad visual: "Pixi (nunca Pixel)", "SIEMPRE arranca en modo oscuro", "un solo archivo de tema con tokens". El manual aporta colores, tipografía, uso del logo y la evolución opcional de Pixi. "El personaje de tu marca" y el modo claro solo de sesión los propuso Claude y los aprobó el usuario | `CLAUDE.md` §Identidad visual |
| D19 | Tests de API con un mongod por ejecución y una BD por archivo | Aislamiento entre archivos de test | `test/support/globalSetup.ts`, `testApp.ts` |
| D20 | Operations son del workspace (cualquier tipo), con los mismos modelos, endpoints y pantallas en Personal y Enterprise | No duplicar `Enterprise*`; base común para Campaign Manager | `OPERATIONS.md`, `ENTERPRISE-OPERATIONS.md` |
| D21 | Capacidades por tipo en contracts (`capabilities.ts`); API `assertWorkspaceFeature` (400 `feature_not_available`), web `FeatureOnly` | Un solo punto de gating; no persistir capacidades ni dispersar `if (type === …)` | `capabilities.ts`, `workspaces/workspaceFeatures.ts` |
| D22 | `DELETE` de proyecto y de plan archiva; `DELETE` de tarea y de contenido borra | Conservar historial y referencias de tareas/contenido | `projects.service.ts`, `contentPlans.service.ts` |
| D23 | "Hoy" = día local en la zona IANA del workspace (`Workspace.timezone`, editable por `PATCH`) o `DEFAULT_TIMEZONE` (env, `America/Bogota`); nunca UTC ni zona inferida de texto | El brief del día no cambia de fecha a medianoche UTC | `DAILY-DIRECTOR.md` §3, `daily-director/dailyTime.ts` |
| D24 | DailyBrief versionado por `{workspaceId, localDate, version}` (único) y marcado "desactualizado" cuando cambian los datos | Historial del día sin sobrescribir; concurrencia segura | `DAILY-DIRECTOR.md` §10 |
| D25 | IA del planner y del director: payload controlado con ids propios, salida validada con contracts, lo no respaldado se descarta y cualquier fallo cae a un resultado determinístico | No inventar tareas, fechas ni métricas | `CONTENT-PLANNER.md` §2, `DAILY-DIRECTOR.md` §8-§9 |
| D26 | El planner y el director solo proponen; aceptar un ítem del plan crea su ContentItem (idempotente) | Nada cambia sin una acción del usuario | `CONTENT-PLANNER.md` §3 |

## 9. Contratos que no deben romperse

### 9.1 API HTTP (todas bajo `/api`)

| Ruta | Métodos | Notas |
|---|---|---|
| `/health` | GET | 200 `ok` / 503 `degraded`; `service: 'pixel-api'` |
| `/auth/register` · `/auth/login` · `/auth/logout` · `/auth/me` | POST (201) · POST · POST (204, sin cuerpo) · GET | `{ user }`; la sesión va en cookie; `me` sin sesión → 401 |
| `/workspaces` | GET, POST (201) | segundo Personal → 409 |
| `/workspaces/:id` | GET, PATCH | overview `{ workspace, company \| null, personal \| null }` |
| `/workspaces/:id/company` | POST (201) | personal → 400; ya tiene empresa → 409 |
| `/workspaces/:id/avatar` · `/avatar/generate` | GET · POST (201) | `AvatarResponse` |
| `/workspaces/:id/conversations` · `/:cid/messages` | GET, POST (201) · GET, POST (201) | mensaje ≤ 4000; sin contexto → 409 con `details.reason`; IA rehúsa → 422; IA no disponible o con límite de uso → 503 |
| `/workspaces/:id/personal-profile` | GET, PUT | solo Personal; PUT = `{ step, data }` |
| `/workspaces/:id/personal-dna` · `/generate` | GET, PUT · POST (200) | solo Personal |
| `/workspaces/:id/projects` · `/:projectId` | GET, POST (201) · GET, PATCH, DELETE (archiva) | Personal y Enterprise |
| `/workspaces/:id/tasks` · `/:taskId` | GET, POST (201) · GET, PATCH, DELETE (204) | Personal y Enterprise; `projectId` debe ser del mismo workspace |
| `/workspaces/:id/content` · `/:contentItemId` | GET, POST (201) · GET, PATCH, DELETE (204) | Personal y Enterprise |
| `/workspaces/:id/operations/summary` | GET | conteos y próximos vencimientos |
| `/workspaces/:id/content-plans` · `/generate` · `/:planId` | GET, POST (201) · POST (201) · GET, PATCH, DELETE (archiva) | solo Personal; sin ADN → 409 `personal_context_not_configured` |
| `/workspaces/:id/content-plans/:planId/items/:itemId` · `/accept` · `/reject` | PATCH · POST (201 al crear, 200 si ya existía) · POST | solo Personal |
| `/workspaces/:id/daily-brief` · `/daily-brief/generate` | GET (404 `daily_brief_not_generated` si no hay) · POST (201) | solo Personal; respuesta `{ brief, stale }` |
| `/workspaces/:id/daily-briefs` · `/:briefId` | GET (paginado) · GET | solo Personal |
| `/companies` · `/companies/:id` | GET, POST (201) · GET, PATCH | legacy Enterprise; `POST` crea también su workspace. `/companies/:id/memories` está montado pero vacío (404) |
| `/companies/:id/brand-dna` | GET, PUT | PUT = `{ step, data }` |
| `/companies/:id/avatar[/generate]` · `/conversations…` | igual que en workspace | legacy |

La web valida **cada respuesta** con el schema de `@pixel/contracts`; un cambio de forma rompe la UI
con `INVALID_RESPONSE`.

### 9.2 Errores

- Forma única `ApiError`: `{ error: { code, message, details?, requestId? } }`. `ZodError` → 400
  `VALIDATION_ERROR` con `details: [{ path, message }]` (la web lo mapea a campos).
- Códigos (`ErrorCodeSchema`, enum cerrado: un código nuevo solo en la API llega a la web como
  `UNKNOWN`): 400 `BAD_REQUEST` (incl. JSON inválido) o `VALIDATION_ERROR`; 401 `UNAUTHORIZED`; 403
  `FORBIDDEN` (solo `originGuard`); 404 `NOT_FOUND` (también rutas inexistentes); 409 `CONFLICT`; 413
  `BAD_REQUEST` (cuerpo > 1 MB); 422 `BAD_REQUEST` (la IA rehúsa); 500 `INTERNAL_ERROR`; 503
  `SERVICE_UNAVAILABLE`. `workspace_type_mismatch` lleva además `details.expected`.
- `details.reason` en uso: `workspace_type_mismatch`, `feature_not_available` (con `feature` y, si
  aplica, `expected`), `personal_dna_missing`, `personal_context_not_configured`,
  `enterprise_company_missing`, `brand_dna_missing`, `daily_brief_not_generated`,
  `daily_brief_not_found`, `daily_brief_generation_failed`, `content_platforms_missing`,
  `content_plan_item_converted`, `content_plan_generation_unavailable`,
  `content_plan_generation_failed`. No tienen schema en contracts. `ChatStudio` reacciona a
  `personal_context_not_configured`, `brand_dna_missing` y `enterprise_company_missing`.

### 9.3 Valores persistidos (cambiarlos rompe documentos guardados)

`CompanyStatus`, `WorkspaceType` (inmutable) y `WorkspaceStatus`; `Conversation.contextType`;
`Message.role` (`user | pixel`) y `meta.mode` (`ai | demo`); `AvatarProfile.sourceType`,
`engine.kind` y **todos** los enums de `AvatarConceptSchema`; bloques del BrandDNA y del PersonalDNA
(arquetipos, `LanguageCode`, roles de paleta…); `generator.kind`; claves de paso de ambos
onboardings (un paso guardado que deja de validar se descarta en silencio); `CreativeMemory.kind`,
`memoryScope` y `source.type`. Al leer, la API valida con `Schema.parse` BrandDNA, PersonalDNA,
AvatarProfile, Conversation, Message y CreativeMemory; Workspace y Company no se validan al leer,
pero la web valida cada respuesta (un valor fuera del enum rompe la UI con `INVALID_RESPONSE`). En
ambos casos: **no estrechar enums**.

### 9.4 Colecciones e índices

`users`, `workspaces`, `companies`, `brand_dnas`, `personal_profiles`, `personal_dnas`,
`avatar_profiles`, `conversations`, `messages`, `creative_memories`, `projects`, `tasks`,
`content_items`, `content_plans`, `content_plan_items`, `daily_briefs`. Índices con nombre:
`one_personal_per_owner` (workspaces), `brand_company_version` y `brand_company_dna_version`
(avatar_profiles, parciales). Únicos relevantes: `users.email`, `{ownerId, slug}` en workspaces y
companies, `workspaces.migratedFromCompanyId` (parcial; mantiene idempotente la migración),
`companies.workspaceId` (parcial), `{companyId, version}` en brand_dnas, `{workspaceId, version}` en
personal_dnas y avatar_profiles (parcial), `personal_profiles.workspaceId`,
`{workspaceId, localDate, version}` en daily_briefs. Las colecciones de Operations y del planner
solo tienen índices no únicos que empiezan por `workspaceId`.

### 9.5 Otros

- **Sesión:** cookie `pixel_session`, httpOnly, `sameSite: lax`, `secure` en producción.
- **Versiones de generador:** `rules-1` (BrandDNA), `avatar-rules-1`, `personal-avatar-rules-1`,
  `personal-rules-1` (`personal-rules-1+ai` con proveedor real) y `manual-1` (versiones del
  PersonalDNA con correcciones manuales, `generator.kind: manual`). Se guardan con cada documento.
  La de reglas del BrandDNA y del PersonalDNA forma parte de su `sourceHash`: cambiarla crea una
  versión nueva del ADN en la siguiente sincronización. Una versión `manual-1` lleva el hash de las
  reglas (el `PUT` copia el de la versión vigente; la resincronización lo recalcula).
- **Variables de entorno (solo nombres):** API `NODE_ENV`, `PORT`, `MONGODB_URI`, `CORS_ORIGINS`,
  `LOG_LEVEL`, `JWT_SECRET` (obligatoria en producción), `SESSION_TTL_DAYS`, `BCRYPT_ROUNDS`,
  `AI_PROVIDER` (`anthropic | demo`), `AI_MODEL`, `ANTHROPIC_API_KEY`, `AI_TIMEOUT_MS`,
  `CHAT_HISTORY_LIMIT`, `DEFAULT_TIMEZONE` (IANA, por defecto `America/Bogota`). Web:
  `VITE_API_URL`, `VITE_API_PROXY_TARGET`. Solo tests:
  `MONGODB_URI_TEST`, `MONGOMS_*`.
- **Rutas web públicas (etapa de entrada):** `/` (bienvenida; con sesión redirige a
  `?next=` interno o a `/dashboard`), `/explore`, `/explore/personal`, `/explore/enterprise`. En
  ellas, `?auth=login|register&next=<ruta interna>` abre el modal de acceso (Atrás lo cierra).
  `next` pasa siempre por `safeNextPath` (`features/auth/redirect.ts`): una sola barra inicial,
  sin `//`, `/\`, caracteres de control ni otro origen; si no, `/dashboard`. Protegida:
  `/pixels/start?intent=personal|enterprise` (Personal: abre el existente o lo crea; Enterprise:
  0 empresas → `/companies/new`, 1 → su workspace, varias → `/dashboard`).
- **Rutas web:** `/login`, `/register`, `/dashboard`, `/pixels/new`, `/companies`, `/companies/new`
  (`?workspace=`), `/company/:companyId/{,onboarding,brand,pixel,chat}`,
  `/workspace/:workspaceId/{,chat,pixel,personal/onboarding,personal/dna,projects,projects/:projectId,tasks,content,content-planner,content-planner/:planId}`.
- **Tests guardianes de invariantes:** `tenantScoped`, `contextBuilders`, `enterpriseWorkspace`,
  `workspaces`, `migration`, `avatarIndexes`, `personal*`, `chat`, el aislamiento por empresa de
  `companies`, `brandDna` y `avatar` (recurso ajeno → 404), `auth` (cookie, 401),
  `operationsIsolation`, `enterpriseOperations`, `projects`, `tasks`, `content`, `contentPlans`,
  `dailyBrief`, `dailyDirector.unit` y `contentPlanning.engine`, en `apps/api/test/`.

## 10. Decisiones que no estaban documentadas (se registran aquí)

1. El proveedor de pruebas se llama **`DemoProvider`** (no `MockAIProvider`); `AI_PROVIDER=mock` no
   es válido.
2. Los servicios `BrandAnalysisService`, `AvatarDesignService` y `PixelChatService` **no existen**.
   Equivalentes reales: `brandDna.service` + `generateBrandDna`; `avatar.service` +
   `rulesAvatarEngine` / `personalAvatarEngine`; `chat.service` + `resolveContextBuilder`.
3. El BrandDNA se genera síncrono al guardar cualquier paso cuando los 8 están completos, y el
   avatar a mano; `analyzing` y `failed` nunca se escriben.
4. `PersonalDnaEnrichmentSchema` vive en `apps/api/src/modules/personal/personalDna.generator.ts`:
   excepción al principio "contratos primero" (es interno de la IA y no viaja por HTTP).
5. El nombre del Pixel Personal lo decide la web (`user.name` o "Mi Pixel Personal") y, si el alta
   devuelve 409, la web abre el Personal existente.
6. `ANTHROPIC_API_KEY` se excluye del objeto `Env`.
7. La migración usa el driver nativo (`Model.collection`) para saltarse `tenantScoped` a propósito,
   porque esos documentos aún no tienen `workspaceId`. `upgradeAvatarProfileIndexes()` crea índices
   con Mongoose y usa `Model.collection` solo para listar y borrar índices por nombre.
8. `PixelStudio` no tiene archivo propio: vive en `features/pixel/PixelPage.tsx`.
9. El proveedor demo no inventa frecuencias ni dice "en directo" sin evidencia en el ADN.
10. BrandDNA solo tiene la ruta legacy; el plan de convergencia aún no la menciona.
11. El script de migración solo crea o sincroniza índices de Workspace, Company, AvatarProfile,
    Conversation, Message y CreativeMemory. Ni el modo normal ni `--sync-indexes` tocan
    PersonalProfile, PersonalDNA, BrandDNA ni User: Mongoose crea sus índices al arrancar y los
    obsoletos no se retiran.

## 11. Problemas conocidos y deuda técnica

### 11.1 Revisión de `e59757d` (Prompts 9–12), 2026-10-08

Revisión en 5 frentes: aislamiento, IA y contratos, datos y fechas, web, docs y tests. Cada hallazgo
pasó por un verificador escéptico: hubo 26 hallazgos, se descartaron 4 y quedan **20 problemas
distintos** (dos describían el mismo). **Ninguno es de severidad alta ni rompe el aislamiento entre
workspaces.** Ninguno está corregido.

| # | Sev. | Dónde | Problema |
|---|---|---|---|
| R1 | Media | `ai/providers/demoContentPlan.ts:221` | En modo demo (el único sin clave), un PersonalDNA válido con textos largos (audiencia de más de 160 caracteres, temas de más de 80) produce un plan que no cumple `GeneratedContentPlanSchema`: la generación responde 503 en todos los intentos. Los fixtures usan textos cortos |
| R2 | Media | `content-plans/contentPlanning.engine.ts:271` | El vocabulario anti-invención incluye números de fechas, ids y puntuaciones: una métrica inventada ("15 años de experiencia") pasa si el número aparece en el periodo. Igual en el Daily Director |
| R3 | Media | `daily-director/dailyDirector.engine.ts:262` | Si la razón de la sugerencia de contenido de la IA se descarta, se sustituye por la razón factual de **otro** recurso (el primero de la lista) |
| R4 | Media | `web/features/operations/TaskList.tsx:40` | "Deshacer" tras completar una tarea deja un estado optimista viejo: la tarea restaurada sigue viéndose como hecha |
| R5 | Media | `web/features/content-planner/ContentPlannerPage.tsx:43` | Si la generación del plan falla, el formulario vuelve a los valores por defecto y se pierde lo que el usuario rellenó |
| R6 | Media | `web/features/content-planner/plannerLogic.ts:80` | Regenerar un plan lo fija a las plataformas que usó la salida anterior, no a las que el usuario permitió |
| R7 | Baja | `content-plans/contentPlans.service.ts:347,386` | Rechazar o editar un ítem a la vez que se acepta (dos pestañas o API) puede dejarlo "rechazado/propuesto" con su ContentItem ya creado, de forma permanente |
| R8 | Baja | `contentPlanning.engine.ts:415` | Con Claude real, una salida que no cumple el schema se clasifica como `unavailable` (503) y no como `invalid_output` (502), en contra de lo documentado |
| R9 | Baja | `daily-director/dailyBrief.current.ts:390` | Archivar o completar un plan no marca el brief como desactualizado aunque su sugerencia venga de ese plan |
| R10 | Baja | `contracts/src/contentPlan.ts:54` | `DayStringSchema` acepta fechas imposibles (`2026-02-30`) |
| R11 | Baja | `contentPlans.service.ts:295` | Si `insertMany` falla a medias al generar, el rollback borra el plan pero deja ítems huérfanos |
| R12 | Baja | `web/features/operations/ContentPage.tsx:45` | El tablero de contenido solo agrupa las 100 piezas más recientes: con más, desaparecen piezas y los contadores mienten |
| R13 | Baja | `ContentPlannerPage.tsx:58` | Si el usuario sale de la página mientras se genera un plan, al terminar lo lleva al plan y puede perder una edición en curso |
| R14 | Baja | `web/features/daily-director/DailyDirector.tsx:83` | "Reintentar" tras un fallo al **leer** el brief lo **regenera** (nueva versión y posible llamada a la IA) |
| R15 | Baja | `ContentPlanPage.tsx:173` | Activar, completar o archivar un plan fallan en silencio (sin aviso, rechazo de promesa no capturado) |
| R16 | Baja | `operations/taskActions.ts:30`, `contentActions.ts`, `DailyDirector.tsx:93` | "Deshacer" y "Usar la mía" (zona horaria) no gestionan errores |
| R17 | Baja | `test/contentPlanning.live.test.ts:61` | La prueba en vivo no guarda nada si el motor falla, así que no sirve para la revisión que pide `CONTENT-PLANNER.md` §10 |
| R18 | Baja | `contentPlanning.engine.ts:367` | La regla "ningún ángulo ocupa más de la mitad" deja pasar el 60–75 % en planes impares, y el test que la nombra no la ejercita |
| R19 | Baja | `docs/PERSONAL.md:273` | Dice que en Enterprise las Operations redirigen, solo tienen UI en Personal y no entran en el chat: las tres cosas son falsas |
| R20 | Baja | `docs/BACKLOG.md:227,252,281` | Sigue listando Content Planner, Daily Director y Operations en el chat como pendientes, aunque las Etapas C, D y E están en ✅ |

### 11.2 Encontrado el 2026-10-09

- **Test dependiente de la hora:** `enterpriseOperations.test.ts` › "solo conteos del workspace
  activo" falla entre las 00:00 y las 05:00 UTC. `daysFromNow(-1)` (`test/support/operations.ts`)
  fija la fecha a mediodía UTC del día anterior **en UTC**, pero el workspace usa
  `America/Bogota`: a esas horas, en Bogotá todavía es ese día, así que la tarea no está vencida y
  el conteo da `vencidas: 0`. Reproducido a las 02:04 UTC; con el reloj del test a las 15:00 UTC
  pasan los 14 tests del archivo. Es de `e59757d` (la etapa de entrada no toca la API). Arreglo
  propuesto (no aplicado): calcular las fechas relativas en la zona del workspace o usar `-2`.

### 11.3 Problemas anteriores (siguen vigentes)

- **⚠️ `.env.example` impide arrancar la API si se copia tal cual.** Trae `JWT_SECRET=` y
  `AI_PROVIDER=` vacíos; dotenv los carga como `''` y `loadEnv()` los rechaza («Variables de entorno
  inválidas»), también en `migrate:workspaces`. Reproducido el 2026-10-08. No se ve en local porque
  el `apps/api/.env` existente no tiene esas líneas, y `env.test.ts` no cubre valores vacíos.
  Arreglo propuesto (no aplicado; es código): aceptar `''` como ausente en `config/env.ts` o
  comentar esas líneas en `.env.example`.
- **409 sin `details.reason`:** avatar Enterprise sin ADN, avatar de un workspace enterprise sin
  empresa (`requireEnterpriseCompany`; en el chat ese caso sí lleva `enterprise_company_missing`),
  `personal-dna/generate` con onboarding incompleto, `PUT personal-dna` sin ADN, empresa duplicada en
  un workspace, segundo Personal y email ya registrado (`POST /auth/register`). Solo el chat y el
  avatar personal cumplen hoy la convención; la mayoría de los incumplimientos son del mismo commit
  que la introdujo.
- **Movimiento:** el avatar 3D (`features/avatar3d/AvatarController.tsx`, `useFrame`) y el
  `scrollTo({ behavior: 'smooth' })` de los dos onboardings ignoran `prefers-reduced-motion`; solo el
  CSS global y `<Reveal>` lo respetan.
- ~~**Identidad:** en móvil, el login mostraba `<BrandLogo height={26} />` (152 px de ancho, por
  debajo del mínimo de 160 px).~~ Resuelto en la etapa de entrada: 28 px o más.
- **Sin endurecer:** no hay rate limiting ni helmet; no hay CI. La sesión es un JWT sin estado:
  `POST /auth/logout` solo borra la cookie, así que un token copiado sigue valiendo hasta que expira
  (`SESSION_TTL_DAYS`, 7 días por defecto); no hay revocación ni rotación.
- `generateStructuredOutput` no reintenta cuando la salida no valida con el schema (los docs dicen
  "Zod + 1 reintento"): lanza `invalid_output` y el PersonalDNA se queda con el resultado de reglas.
  Los errores transitorios sí los reintenta el SDK (`maxRetries: 2`).
- Web: doble `GET /api/workspaces/:id` (Sidebar + layout); `PersonalChatPage` carga el chat antes de
  redirigir; `console.warn` en `AuthProvider` y `ErrorBoundary`; código sin uso (`PixelCard`,
  `updatePersonalDna`, assets `pixi-evo-1..6`, variante `wordmark` de `BrandLogo`).
- Comentarios desactualizados: `contracts/src/workspace.ts:9` y `avatarProfile.ts:184` ("próximamente
  PersonalDNA"), `workspaces.routes.ts:28`, `creativeMemory.model.ts`, `creative-memory.routes.ts`,
  `previewSpec.ts:5`, `contracts/src/personal.ts:92`.
- Los tests de la API necesitan un `mongod` (descarga de mongodb-memory-server,
  `MONGOMS_SYSTEM_BINARY` o `MONGODB_URI_TEST`), incluso los que no usan base de datos.

## 12. Deriva de la documentación (pendiente; en esta revisión solo se corrigieron `CLAUDE.md` y `README.md`)

| Documento | Problema |
|---|---|
| `docs/MVP.md` | Flujo §3.1 y estados §3.2 asíncronos que no existen; §3.1 cita además `PUT …/onboarding` con 5 pasos (real: `PUT …/brand-dna`, 8 pasos), estado `talking` (real: `speaking`), `PixelChatService` y `POST …/memories` (no existe); §2 incluye CreativeMemory y análisis asíncrono y dice "proveedor a confirmar"; `MockAIProvider`; `generateObject` (real: `generateStructuredOutput`); §6 sigue listando como pendientes decisiones ya implementadas (sesión JWT en cookie, Anthropic, npm workspaces, mongodb-memory-server) |
| `docs/ARCHITECTURE.md` | Árbol §2 obsoleto (`structured.ts`, `mock.provider.ts`, `prompts/`, `validate.ts`…); tabla API §7 con estados incoherentes; ADR 6 no implementado; `AI_PROVIDER=mock`; §5 dice que la IA enriquece arquetipos (el código lo prohíbe) |
| `docs/ENTITIES.md` | Company: `analysis.*`, `onboarding.data`, `onboarding.submittedAt`, `activeAvatarProfileId` no existen |
| `docs/BACKLOG.md` | Etapas 1 y 2 subestimadas (HexColor, AvatarProfile, Conversation… ya existen; rationale mín. 3, no 5); "sincronizar speaking" ya hecho (`chat/speech.ts`); Etapa W habla de "placeholder"; `MockAIProvider` en Etapa 10 |
| `README.md` | Corregido en esta revisión: línea de estado, lista de módulos, línea `docs/`, aviso de `.env.example`, pruebas en vivo, `DEFAULT_TIMEZONE` y enlace a este documento |
| `docs/OPERATIONS.md`, `ENTERPRISE-OPERATIONS.md`, `CONTENT-PLANNER.md`, `DAILY-DIRECTOR.md` | Nuevos en `e59757d`. Contradicciones encontradas: R8, R18 y la de R3 frente a `DAILY-DIRECTOR.md` §9.2 (§11.1). Fuera de eso no se han verificado línea a línea |
| `docs/PERSONAL.md`, `docs/BACKLOG.md` (cambios de `e59757d`) | R19 y R20 (§11.1) |
| `docs/WORKSPACES.md`, `WORKSPACE-MIGRATION.md`, `PERSONAL.md` | Correctos salvo detalles: `WORKSPACES.md` presenta `/api/companies/:id/memories` como ruta legacy que usa la web (el router está vacío y la web no la llama) y su plan de convergencia no menciona `brand-dna` (§10.10). `WORKSPACE-MIGRATION.md` §4 dice que el modo normal del script «no elimina índices», pero siempre llama a `upgradeAvatarProfileIndexes()` y retira los dos índices legacy de `avatar_profiles` (su propio §2 lo explica; el log del script también dice «sin eliminar los legacy») |

## 13. Última verificación

### 2026-10-09: `e59757d` + etapa de entrada pública

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores |
| `npm run format:check` | OK |
| `npm run test` | contracts 53/53 · web 156/156 · API 296 + 2 omitidos y **1 fallo dependiente de la hora** (§11.2; pasa con el reloj a las 15:00 UTC). La etapa no toca la API |
| `npm run build` | OK (mismo aviso de chunk grande) |
| `npm run dev` | API en :4000 con MongoDB temporal (`/api/health` 200, `database: connected`) y web en :5173 |
| Navegador (Playwright + Chromium, API real en modo demo) | Escritorio 1440, tablet 834 y móvil 390: sin scroll horizontal en bienvenida, Explorar, detalles, `/login` y modal. Modal: foco inicial, Tab atrapado, Escape, X, clic fuera y Atrás cierran; el foco vuelve al botón; scroll bloqueado y restaurado; sin botones sociales. Registro con intención Personal → crea un único Pixel Personal y abre su Inicio con el onboarding pendiente; con sesión no lo duplica; Enterprise sin empresa → `/companies/new`; visitar tarjetas no crea nada; `/` con sesión → `/dashboard`; login desde la bienvenida con `next` interno → ese destino (fallaba: corregido); `next` externo (`https://`, `//`, `/\`) → `/dashboard`; ruta protegida → `/login` → vuelve al destino; la sesión sobrevive a una recarga. Video con un clip temporal (retirado después): autoplay silenciado, en bucle e inline; pausa y reproducción con Enter y Espacio; el modal lo pausa y al cerrarse sigue; con movimiento reducido no arranca ni se descarga (`preload=none`) y el usuario puede reproducirlo; con autoplay bloqueado queda el poster y "Reproducir" funciona (fallaba: corregido); con una fuente rota se quita el video y queda el poster |

No probado: Safari/iOS y Firefox reales (solo Chromium, y el clip de prueba era WebM), lector de
pantalla real, y el video definitivo (no existe todavía). Google Fonts carga a través del proxy del
contenedor y a veces falla allí (`ERR_TOO_MANY_RETRIES`): es del entorno, no del producto.

### 2026-10-08: `e59757d`

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores |
| `npm run format:check` | OK |
| `npm run test` | contracts 53/53 · API 297 + 2 omitidos (`chat.live`, `contentPlanning.live`) · web 139/139 |
| `npm run build` | OK (Vite avisa de un chunk grande: aviso, no error) |
| `npm run dev` | arranca sin `apps/api/.env` (valores por defecto, modo demo): `/api/health` 200 con `database: connected`, web 200, proxy `/api` 200 |
| Prueba de humo (API real, modo demo, MongoDB temporal) | Onboarding personal → PersonalDNA; proyecto, tareas y contenido; resumen; Daily Brief generado (prioriza la tarea vencida, `America/Bogota`), marcado desactualizado tras crear otra tarea y sin versiones duplicadas con dos generaciones simultáneas; plan de contenido de 4 piezas; aceptar el mismo ítem dos veces a la vez crea un solo ContentItem (201 y 200); recursos de otro usuario → 404; `projectId` ajeno → 400; `DELETE` de proyecto → archivado |

No se probó con Claude real (no hay `ANTHROPIC_API_KEY`), ni la interfaz en un navegador. Las
pruebas usaron una copia aparte del repo (`git worktree`) y no dejaron cambios.

Entorno: Node 22.22.0 / npm 10.9.4, MongoDB 8.0.23 vía `MONGOMS_SYSTEM_BINARY`. En el contenedor en
la nube, `fastdl.mongodb.org` está bloqueado; el binario se sacó del paquete conda-forge
`mongodb-8.0.23` (conda.anaconda.org sí es accesible) y vive en el scratchpad de la sesión, que no
persiste: una sesión nueva debe repetirlo o usar `MONGODB_URI_TEST`.

Verificación anterior: `c846956` (2026-10-08): contracts 27 · API 185 + 1 · web 55, todo en verde.

## 14. Siguiente paso (no implementado)

1. **Usuario: aportar el video final de la bienvenida** (el recibido es un teaser de otro estudio y
   no se usó) y confirmar la asignación de imágenes (joven = Personal, zorro = Enterprise). Activarlo
   es solo copiar el archivo a `apps/web/public/experience/` y poner su ruta en `introVideo.src`
   (`apps/web/src/brand/experience.ts`). El avatar se trabajará después.
2. **Usuario: decidir la integración de ramas.** `feat/prompts-9-11` contiene a
   `feat/etapa-0-foundation`, así que fusionarla sería un avance rápido (sin conflictos). Elegir
   en qué rama sigue el trabajo.
3. **Corregir los hallazgos de la revisión (§11)** que el usuario priorice, empezando por los de
   severidad media, el arranque con `.env.example` y el test dependiente de la hora (§11.2).
4. Probar con Claude real el Content Planner y el Daily Director (`CONTENT-PLANNER.md` §10).
5. Confirmar el número del prompt de la Etapa E y el de la etapa de entrada (el usuario la llamó
   "prompt 13"; en el backlog, el 13 es el Campaign Manager), y resolver la colisión "Prompt
   9/10" ↔ "Etapa 9/10" en `BACKLOG.md`.
6. Solo después, y si el usuario lo pide: **Prompt 13 — Campaign Manager** (📝). No iniciarlo antes.
7. Opcional, previa petición: corregir la deriva de §12.

## 15. Comandos reales

```bash
nvm use                                    # Node 22
npm install                                # todos los workspaces (intenta descargar mongod para tests)
cp apps/api/.env.example apps/api/.env     # dar valor a JWT_SECRET (≥ 32) y BORRAR `AI_PROVIDER=` (§11)
cp apps/web/.env.example apps/web/.env
npm run dev          # compila contracts y lanza contracts (watch) + API :4000 + web :5173
npm run typecheck    # compila contracts y ejecuta tsc en los tres paquetes
npm run lint         # eslint .            (lint:fix → eslint . --fix)
npm run format:check # prettier --check .  (format → prettier --write .)
npm run test         # compila contracts y ejecuta vitest en contracts, api y web
npm run build        # contracts → api → web
npm run start -w @pixel/api                # node dist/server.js tras build (no sirve la web; producción exige NODE_ENV=production y JWT_SECRET)
npm run migrate:workspaces [-- --dry-run | --sync-indexes]
```

- `DEFAULT_TIMEZONE` (IANA) define el "hoy" de los Pixels sin zona propia; `.env.example` trae
  `America/Bogota`.
- MongoDB local: `mongodb://127.0.0.1:27017/pixel` (el README sugiere Docker `mongo:7`). Sin
  `ANTHROPIC_API_KEY` y **sin** la variable `AI_PROVIDER` (ni siquiera vacía), la IA funciona en
  modo demo.
- Tests de la API sin descarga: `MONGOMS_SYSTEM_BINARY=/ruta/a/mongod` o `MONGODB_URI_TEST=<uri>`.
- Un archivo: `npm run test -w @pixel/api -- test/chat.test.ts` (contracts compilado antes).
- Pruebas con Claude real (cuestan dinero y necesitan red): `ANTHROPIC_API_KEY=... npm run test -w
  @pixel/api -- test/chat.live.test.ts test/contentPlanning.live.test.ts`. Los tests no leen
  `apps/api/.env`.

## 16. Cómo mantener este documento

- Actualizarlo al cerrar cada etapa (forma parte de la definición de terminado de `CLAUDE.md`):
  §0, §1, §2, §5–§7, §13 y §14 como mínimo.
- No marcar ✅ sin tests o verificación ejecutada. Lo que diga un prompt o un doc y no esté en el
  código es 📝; lo que no se pudo comprobar es ❓.
- Una decisión nueva va a §8 (y a `ARCHITECTURE.md` si es estructural).
