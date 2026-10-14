# PIXEL — Estado real del proyecto

> **Documento de continuidad entre sesiones.** Léelo antes de tocar código. Describe lo que **existe
> en el repositorio**, no lo que dicen los prompts ni el resto de `docs/`, que tienen deriva (§12).
> Si el código y este documento no coinciden, **manda el código**: corrige este documento.
>
> - Última revisión: **2026-10-13**, rama `feat/prompts-9-11` en `29fbb77` (Prompt 16), **1 commit
>   por delante de `origin`** (`29fbb77` sin push); hasta `79b97e7` (Prompt 15), al día con `origin` (los commits de los Prompts 14 + 14.1 y 15 ya están subidos; contiene `feat/etapa-0-foundation` en `c846956`) y el commit del Prompt 13 (Campaign Manager, `a65e28c`, ya en `origin`),
>   hecho con autorización del usuario el 2026-10-09 en su equipo (Windows, Claude Code en VS Code),
>   Encima, el **Prompt 14 (Enterprise Content Planner) y el Prompt 14.1 (Zero-entry UX:
>   PixelCommand), implementados, verificados y confirmados en un único commit** (`1593576`) ("Add Prompt 14: Enterprise Content Planner and zero-entry Pixel Command"),
>   autorizado por el usuario el 2026-10-10; ya en `origin` (§0, §1, §13).
> - Encima, el **Prompt 15 (Brand Guardian Core)**, implementado y confirmado en el commit "Add Prompt 15: Pixel Brand Guardian Core" (`79b97e7`, autorizado el 2026-10-10, ya en `origin`), verificado el
>   2026-10-10 (§13).
> - Encima, el **Prompt 16 (Creative Memory)**, confirmado en el commit "Add Prompt 16: Pixel Creative
>   Memory" (`29fbb77`, autorizado el 2026-10-13, **sin push**), verificado el 2026-10-13 (§13).
> - Encima, **sin commit y sin push**: el **Prompt 17 (Pixel Presence V1)**, implementado y verificado
>   el 2026-10-13 (§13), **pendiente de revisión** del usuario.
> - Leyenda: ✅ implementado y verificado (tests automáticos; si solo hubo revisión manual, se dice) ·
>   🟨 parcial · 📝 solo planificado (docs o prompts, sin código) · ❓ pendiente de verificación ·
>   ⛔ bloqueado.

## 0. Resumen rápido

| Tema | Estado |
|---|---|
| Última etapa verificada | **Etapa PR — Pixel Presence V1 (Prompt 17)**, implementada y verificada el 2026-10-13 (§13) en el equipo del usuario, **sin commit ni push, pendiente de revisión**. Debajo: Etapa CM (Prompt 16, `29fbb77`, sin push), Etapa G (Prompt 15, `79b97e7`), Etapas Z y EC (Prompts 14.1 y 14, `1593576`), Etapa M (Prompt 13, `a65e28c`), Etapas O, C, D y E (`e59757d`) y la entrada pública (`24e300a`); todo eso en `origin`. |
| Prompts | Prompt 9 = Operations, 10 = Content Planner, 11 = Daily Director, **12** = Shared Operations + Enterprise Projects (Etapa E; confirmado: el texto del Prompt 12 se recibió e implementó en la sesión del equipo del usuario el 2026-10-08), **13 = Enterprise Campaign Manager** (Etapa M; el usuario envió el texto "PROMPT 13 — ENTERPRISE CAMPAIGN MANAGER" el 2026-10-09), **14 = Enterprise Content Planner** (Etapa EC; recibido el 2026-10-09), **14.1 = Zero-entry UX / PixelCommand** (Etapa Z; recibido el 2026-10-09: "PROMPT 14.1 — ZERO-ENTRY UX"), **15 = Brand Guardian Core** (Etapa G; recibido el 2026-10-10: "PIXEL BRAND GUARDIAN CORE"), **16 = Creative Memory** (Etapa CM; recibido el 2026-10-13: "PROMPT 16 — PIXEL CREATIVE MEMORY"; el mensaje llegó truncado en §142), **17 = Pixel Presence V1** (Etapa PR; recibido el 2026-10-13: "PIXEL PRESENCE V1"; llegó cortado en §150 y el usuario envió después §150–§173). La entrada pública no tiene número. |
| Ramas | `feat/prompts-9-11` (nueva, en `origin`) = `feat/etapa-0-foundation` + este trabajo. `feat/etapa-0-foundation` sigue en `c846956`: **todavía no se ha fusionado**. |
| Última etapa | **Pixel Presence V1** (Prompt 17, Etapa PR): sistema de estados de presencia efímero (8 estados), Avatar Runtime con tres niveles (ambient 2D, interactive y focus 3D; uno solo en 3D por pantalla; Pixi sin personaje; caída a 2D sin WebGL; movimiento reducido), Voice Runtime (Web Speech del navegador; voz = otra entrada de PixelCommand, nunca confirma; degradación a texto), acentos por workspace con contraste validado, Pixel Dock persistente con el recurso en contexto (validado contra el workspace), UI Presence Pass (Tus Pixels, Inicios, Campañas, Plan de contenido, topbar y navegación sin Chat) y «Voz y movimiento» en Personaje (`docs/PIXEL-PRESENCE.md`, `docs/AVATAR-ASSET-CONTRACT.md`). Anterior: **Creative Memory** (Prompt 16, Etapa CM): CreativeDecisionEvent inmutable e idempotente, CreativeMemory extendida (candidata → confirmada; explícita con una confirmación), detector de patrones (3 señales en 2 recursos), sintetizador con refs EVENT_n, resolver con alcance y excepciones, integración en PixelCommand (`manage_memory`), campañas, planners, Daily Director, chat y Guardian, y «Lo que Pixel ha aprendido» en la web (`docs/CREATIVE-MEMORY.md`). Anterior: Brand Guardian Core (Prompt 15). |
| Siguiente paso | Usuario: revisar el Prompt 17 y decidir su commit; decidir el push de `29fbb77` (Prompt 16) y del 17. No empezar el Prompt 18 sin pedirlo (§14). |
| Problema a conocer ya | Copiar `apps/api/.env.example` tal cual **impide arrancar la API** (`JWT_SECRET=` y `AI_PROVIDER=` vacíos no validan). Sigue igual en `e59757d`. Ver §11 y §15. |
| Cambios sin commit | **Sí: todo el Prompt 17** (contracts `workspace.ts` y `pixelCommand.ts`; API `workspaces`, `personal`, `pixel-command` y `pixelCommandRules`; web: feature nueva `presence`, shell, navegación, Inicios, Tus Pixels, Campañas, Plan de contenido, Guardian, Daily Director, avatar 3D y Personaje; tests y docs). El Prompt 16 está en `29fbb77` **sin push**; los Prompts 13–15, en `origin`. |

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
| (sin commit) | 2026-10-13 | Claude | Prompt 17: Pixel Presence V1 (pendiente de revisión y autorización del usuario; sin push) |
| `29fbb77` | 2026-10-13 | Claude | Add Prompt 16: Pixel Creative Memory (autorizado; **sin push**) |
| `79b97e7` | 2026-10-10 | Claude | Add Prompt 15: Pixel Brand Guardian Core (autorizado; en `origin`) |
| `1593576` | 2026-10-10 | Claude | Add Prompt 14: Enterprise Content Planner and zero-entry Pixel Command (Prompts 14 y 14.1, autorizado; en `origin`) |
| `a65e28c` | 2026-10-09 | Claude | Add Prompt 13: Enterprise Campaign Manager (en `origin`) |
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
| 12 | Shared Operations + Enterprise Projects | E | `e59757d` | ✅ |
| sin número | Experiencia de entrada pública (bienvenida, Explorar, acceso) | "Experiencia de entrada pública" | `24e300a` | ✅ verificada el 2026-10-09; pendiente el video final |
| 13 | Enterprise Campaign Manager | M | `a65e28c` (2026-10-09, en `origin`) | ✅ verificado el 2026-10-09 (§13); sin prueba con Claude real |
| 14 | Enterprise Content Planner | EC | `1593576` (2026-10-10, sin push) | ✅ implementado y verificado el 2026-10-09 (§13), incluido el navegador; sin prueba con Claude real |
| 14.1 | Zero-entry UX: PixelCommand | Z | `1593576`, el mismo commit que el Prompt 14 (2026-10-10, sin push) | ✅ implementado y verificado el 2026-10-09 (§13), incluido el navegador; sin prueba con Claude real |
| 15 | Brand Guardian Core | G | `79b97e7` (2026-10-10, en `origin`) | ✅ implementado y verificado el 2026-10-10 (§13), incluido el navegador; sin prueba con Claude real (sin `ANTHROPIC_API_KEY`) |
| 16 | Creative Memory | CM | `29fbb77` (2026-10-13, sin push) | ✅ implementado y verificado el 2026-10-13 (§13), incluido el navegador; sin prueba con Claude real (sin `ANTHROPIC_API_KEY`) |
| 17 | Pixel Presence V1 | PR | sin commit ni push (pendiente de revisión) | ✅ implementado y verificado el 2026-10-13 (§13), incluido el navegador con voz **simulada**; sin micrófono ni síntesis reales, sin Safari/Firefox y sin Claude real |

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
                  ├─ compartidos: AvatarProfile · Conversation → Message
                  ├─ creative memory: CreativeDecisionEvent (evidencia inmutable) → CreativeMemory (candidata → activa; alcance workspace|campaña)   (Personal y Enterprise)
                  ├─ operations: Project (→ Task, ContentItem) · Task · ContentItem   (Personal y Enterprise)
                  ├─ campaigns: Campaign → CampaignStrategy (versiones) · CampaignDeliverable (→ Project | ContentItem)   (solo Enterprise)
                  ├─ content planner: ContentPlan (contextType) → ContentPlanItem (→ ContentItem al aceptar)   (Personal y Enterprise; Enterprise: BrandDNA + Campaign opcional)
                  ├─ daily director: DailyBrief (versión por día local; solo lee)   (solo Personal)
                  ├─ pixel command: PixelCommand (solicitud → propuesta → [preflight Guardian] → confirmación; orquesta lo anterior)   (Personal y Enterprise)
                  └─ brand guardian: GuardianReport (revisión explicable; nunca modifica el recurso)   (solo Enterprise)
```

Qué funcionalidad tiene cada tipo lo decide `packages/contracts/src/capabilities.ts`
(`workspaceSupportsFeature`): Personal tiene `projects`, `tasks`, `content`, `contentPlanner` y
`dailyDirector`; Enterprise, `projects`, `tasks`, `content`, `contentPlanner` (desde el Prompt 14)
y `campaigns` , `brandGuardian` (Prompt 15) y `creativeMemory` (Prompt 16, ambos tipos).

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
  `EnterpriseContextBuilder` (añade el estado operativo: conteos y hasta 3 campañas activas con
  nombre, objetivo y estado) o `PersonalContextBuilder`
  (añade el DailyBrief vigente de hoy, marcado si está desactualizado) → brief (`<brand_context>` o
  `<personal_context>`) → `AIProvider.generateText` → solo si la IA respondió, guarda los dos
  mensajes (el de Pixel con `meta`: proveedor, modelo, modo, latencia y versiones de ADN/avatar). Un
  fallo de la IA responde 422/503 sin guardar nada; sin contexto, 409 antes de llamarla.
- **Dónde se usa IA hoy:** el chat (`generateText`, también para el consejo creativo de PixelCommand)
  y nueve salidas estructuradas (`generateStructuredOutput`): el enriquecimiento opcional del
  PersonalDNA, el `ContentPlanningEngine`, la `EnterprisePlanningStrategy`, el intérprete de
  PixelCommand (con reglas de respaldo si falla), el `DailyDirectorEngine`, el
  `CampaignStrategyEngine` y, en el Brand Guardian, la evaluación semántica (una llamada por
  revisión, con respaldo por reglas) y la corrección de una pasada, y el sintetizador de Creative Memory (solo con evidencia suficiente). El director cae a
  un resultado determinístico si la IA falla; el planner y el Campaign Manager responden 503 sin
  resultado falso con un proveedor real caído y tienen versión determinista solo en modo demo. BrandDNA y avatares son **reglas
  deterministas versionadas**.
- **Arranque de la API (`server.ts`):** `dotenv/config` → `loadEnv()` (falla rápido si el entorno
  no valida) → `startDatabase()` **sin bloquear** (si Mongo no responde, `/api/health` da 503
  `degraded` y reintenta cada 5 s) → `createAIProvider()` + `createApp()` → `listen(PORT)` inmediato.
  En paralelo, al conectar por primera vez, `upgradeAvatarProfileIndexes()` y
  `migrateContentPlanContexts()` (Prompt 14), en ese orden y en el mismo `onConnected`. Ambas son
  idempotentes; si una falla se registra y la API sigue, pero si falla la de índices la de planes no
  se ejecuta en ese arranque (queda `npm run migrate:content-plans`).

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
                 · operations · content-plans · daily-director · campaigns · pixel-command · guardian · creative-memory
apps/api/scripts/{migrate-companies-to-workspaces,migrate-content-plans,migrate-creative-memories}.ts      apps/api/test/  (43 archivos + support/ + fixtures/)
apps/web/src
  app/           router, AppShell, Sidebar, Header, navigation, theme
  features/      auth · dashboard · workspaces · companies · onboarding · brand · personal · pixel · chat · avatar3d · system
                 · operations · content-planner · daily-director · campaigns · pixel-command · guardian · creative-memory
  components/    Button, Field, Alert, EmptyState, DnaBlocks, Reveal, BrandLogo, Pixi, rise…
  lib/           api.ts (fetch + validación Zod), apiPaths.ts, forms.ts, useResource.ts
  styles/theme.css  ← único archivo de tokens
packages/contracts/src   25 módulos reexportados por index.ts (se consume solo desde dist/)
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
| `creative-memory` | CreativeMemory (`creative_memories`, extendida de forma compatible; migración a `legacy`) y CreativeDecisionEvent (`creative_decision_events`, inmutable, idempotente); léxico determinista, `recordCreativeDecision` (best-effort), PatternDetector (3 señales en 2 recursos → candidata, anti-reaprendizaje, sin duplicados, sin auto-refuerzo), sintetizador (IA con EVENT_n validadas; demo), resolver + conflictos (alcance, excepciones, 8 + 8), API `/creative-memories` (lista, detalle con evidencia, remember, confirm, dismiss, forget, replace) | ✅ Personal y Enterprise (2026-10-13, sin commit); sin prueba con Claude real |
| `operations` | Project, Task y ContentItem por workspace (Personal y Enterprise); `DELETE` de proyecto **archiva**; `DELETE` de tarea o contenido borra; resumen `/operations/summary` | ✅ |
| `content-plans` | ContentPlan (`contextType`) + ContentPlanItem; Personal: `ContentPlanningEngine`; Enterprise: `EnterprisePlanningStrategy` (BrandDNA + campaña opcional, refs controladas, grounding promocional y de campaña, versión exacta de la estrategia); migración de `contextType`; aceptar un ítem crea su ContentItem (idempotente, con `campaignId`); editar/rechazar condicionados; `DELETE` archiva | ✅ Personal y Enterprise (Enterprise 2026-10-09); sin prueba con Claude real (`CONTENT-PLANNER.md` §10, `ENTERPRISE-CONTENT.md` §9) |
| `campaigns` | Campaign, CampaignStrategy (versionada) y CampaignDeliverable; `CampaignStrategyEngine` (IA con contexto controlado + validación de fundamento de marca; 503 sin IA; demo determinista); aceptar una pieza crea su ContentItem o Project con `campaignId` (idempotente); `DELETE` archiva | ✅ solo Enterprise (2026-10-09); sin prueba con Claude real |
| `pixel-command` | PixelCommand: `PixelIntentResolver` (IA + reglas en español de respaldo; saneado del backend), `PixelContextResolver`, `planCommand` (información que falta + ActionPlan, puro), respuestas sin escritura (estado, consejo, desconocido) y ejecutor que llama a los servicios existentes; confirmación única con reserva atómica + revisión; `partial` con reintento | ✅ Personal y Enterprise (2026-10-09); sin prueba con Claude real (`PIXEL-COMMAND.md` §10) |
| `guardian` | GuardianReport (`guardian_reports`); `GuardianEngine` con 8 evaluadores (identidad, comunicación, claims, restricciones, estrategia, alineación de campaña, contenido, dirección visual estructurada), una sola llamada semántica con referencias controladas (`BRAND_*`, `CAMPAIGN_*`, `RESOURCE_TEXT_n`) y respaldo por reglas; `GuardianScoreAggregator`; override registrado; corrección de una pasada (`guardian_correction`) y aplicación con el servicio del recurso; `stale` por hash de la instantánea; preflight de PixelCommand (`guardian`/`guardianBlocked`, 409 `guardian_preflight_blocked`) | ✅ solo Enterprise (2026-10-10); sin prueba con Claude real (`BRAND-GUARDIAN.md` §12) |
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
| `campaigns` (Campañas, "Crear con Pixel" / "Nueva campaña", detalle con Estrategia · Piezas · Proyectos · Contenido · Plan de contenido, versiones e hipótesis) | ✅ (2026-10-09; recorrido en navegador en el smoke del Prompt 14) |
| `content-planner` Enterprise ("Plan de contenido de {marca}", selector y resumen de campaña, `?campaign=`, plan con estrategia editorial → alineación → pilares → plan, tarjetas con campaña y porqué de marca) | ✅ (2026-10-09; verificado en navegador) |
| `pixel-command` (`PixelCommand`, `PixelCommandPanel`, `PixelProposalCard`, `PixelRequestInput`): "¿Qué necesitas hacer?" dominante en los Inicios Enterprise (con ADN) y Personal; "¿Qué quieres lograr?" en Campañas y "¿Qué quieres comunicar?" en Plan de contenido, con los formularios como opciones avanzadas; navegación Enterprise Inicio · Trabajo · Marca | ✅ (2026-10-09; verificado en navegador) |
| `guardian` (Brand Guardian en Marca: revisar campaña, plan, pieza o texto pegado; informe con estado, score heurístico, dimensiones aplicables, hallazgos explicados, override, "Corregir con Pixel" y "Aplicar"; historial) · "Revisar con Guardian" en el detalle de campaña, el plan de contenido y Contenido · preflight compacto en la propuesta de PixelCommand (`GuardianPreflight`) | ✅ (2026-10-10; verificado en navegador) |
| `presence` (Prompt 17): `PixelPresenceProvider` (estado efímero + voz), `PresenceScope`, `PixelPresenceAvatar` (ambient 2D / interactive / focus), `PixelComposer` (texto + micrófono), `PixelDock` (Pixel persistente con el recurso en contexto), `PixelHomeHero`, `PresenceStatus` (chip de la topbar), `PresenceSettings` («Voz y movimiento»), `workspaceAccent`, `presenceProfile` (VoiceProfile, BehaviorProfile, preferencias por dispositivo) | ✅ (2026-10-13; verificado en navegador con voz simulada) |
| `creative-memory` («Lo que Pixel ha aprendido»: candidatas con su patrón y «¿Por qué Pixel piensa esto?», activas con alcance y origen, editar = reemplazar, olvidar con confirmación, historial plegado; en Marca «Lo aprendido» o junto a Mi Pixel) · PixelCommand confirma con «Recordar» / «Olvidar» | ✅ (2026-10-13; verificado en navegador) |

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
| Content Planner | Disponible (Prompt 14): BrandDNA + campaña opcional; sin ADN → 409 `brand_dna_missing`; campaña sin estrategia → 409 `campaign_strategy_missing` | Disponible; necesita el PersonalDNA (sin él, 409 `personal_context_not_configured`); `campaignId` → 400 |
| Daily Director | No disponible: API 400 `feature_not_available`, la web lo oculta (`FeatureOnly`) | Disponible; necesita el PersonalDNA |
| Sin configurar | Chat: 409 `enterprise_company_missing` / `brand_dna_missing` (sin llamar a la IA). Avatar sin ADN o workspace sin empresa: 409 **sin** `details.reason` | Chat: 409 `personal_context_not_configured` (sin llamar a la IA). Avatar: 409 `personal_dna_missing`. `personal-dna/generate` incompleto y `PUT personal-dna` sin ADN: 409 sin `reason` |
| Estado | `Company.status`: `draft` → `onboarding` (1.er paso guardado) → `ready` (al generar el avatar); "Tus Pixels" muestra "Configurado" solo con `ready` | Sin campo de estado: la web lo deriva del resumen `personal` (`completedSteps`, `personalDnaVersion`) en `workspaceStatus.ts` y muestra "Configurado" en cuanto existe el PersonalDNA (salvo si está archivado), sin esperar al avatar. `personalDnaCompleteness()` solo mide cuánto del ADN está relleno |

## 7. Funcionalidades

### Terminadas ✅

Auth con cookie · empresas · Brand Brain + BrandDNA · Avatar Concept Engine · renderer 3D con 5
estados (`idle`, `thinking`, `listening`, `speaking`, `happy`) y respaldo SVG · chat Enterprise
(Anthropic o demo) · identidad PIXELES (tema oscuro, modo claro de sesión, Pixi; revisada a mano,
sin tests automáticos) · Workspaces y migración Company → Workspace · Pixel Personal (onboarding,
PersonalDNA, avatar, chat) · Operations para Personal y Enterprise (Etapas O y E) · Content Planner
Personal (Etapa C) · Daily Director Personal (Etapa D) · Campaign Manager Enterprise (Etapa M,
Prompt 13) · Content Planner Enterprise (Etapa EC, Prompt 14) · PixelCommand /
zero-entry (Etapa Z, Prompt 14.1) · Brand Guardian (Etapa G, Prompt 15) · Creative Memory (Etapa CM, Prompt 16, `29fbb77`) · Pixel Presence V1 (Etapa PR, Prompt 17, sin
commit). Las nueve últimas, verificadas con tests y en modo demo (EC, Z, G, CM y PR también en
navegador; PR con voz simulada); con Claude real, sin probar (❓). Experiencia de entrada pública (solo web,
verificada en navegador el 2026-10-09; falta el video final).

### Parciales o abiertas 🟨

- **Creative Memory (Etapa CM):** sin decay; los alcances `project` y `content_plan` existen en contrato y resolver pero no se crean desde la conversación; `creative_resource_rejected` aún no se emite.
- **Pixel Presence (Etapa PR):** la voz depende de Web Speech del navegador (Chrome/Edge; Firefox sin
  reconocimiento → solo texto); `BehaviorProfile`
  y `resolveClip` preparados sin consumir (no hay GLB); sin lip-sync. (Corregidos antes del commit:
  el Inicio ya cuenta las campañas en borrador —`counts.currentCampaigns`—, el aviso de privacidad
  de la voz existe y la tarjeta «Tu Pixel» ya no dice «Lista para crear».)
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
- Cierre end-to-end con seed (Etapa 10).
- Streaming de respuestas (SSE) y voz en tiempo real (Etapa 8; fuera del alcance del MVP). La voz por
  turnos del navegador ya existe (Prompt 17).
- Avatar GLB con clips (`docs/AVATAR-ASSET-CONTRACT.md`: contrato listo, sin loader ni asset).
- Etapa W pendiente: pasar los clientes web Enterprise de avatar y chat a `/api/workspaces/...` y
  retirar las rutas legacy; retirar `companyId` legacy y `Company.ownerId`; miembros y roles por
  workspace (hoy solo el dueño).
- Etapa 7: cejas y expresiones adicionales del avatar.
- Daily Director para Enterprise y acciones del Daily Director sobre tareas ("después", según
  `BACKLOG.md`). (El Content Planner Enterprise ya existe: Prompt 14.)

### Pendiente de verificación ❓

- `contentPlanning.live.test.ts` con Claude real, y ajuste del prompt del planner
  (`CONTENT-PLANNER.md` §10). El `DailyDirectorEngine` tampoco se ha probado con Claude real.
- `chat.live.test.ts` con Claude real (se salta sin `ANTHROPIC_API_KEY`).
- El `CampaignStrategyEngine` (`CAMPAIGN_SYSTEM`) con Claude real: no tiene prueba en vivo; solo
  se probó con el demo y con salidas fijas.
- La `EnterprisePlanningStrategy` (`ENTERPRISE_PLANNING_SYSTEM`) con Claude real: sin prueba en
  vivo; solo demo y salidas fijas. Tampoco hay `ANTHROPIC_API_KEY` en este equipo (2026-10-09).
- El intérprete de PixelCommand (`PIXEL_COMMAND_SYSTEM`) con Claude real: solo probado con las
  reglas (modo demo).
- El Brand Guardian (`GUARDIAN_SYSTEM` y `GUARDIAN_CORRECTION_SYSTEM`) con Claude real: solo demo,
  reglas y proveedores de prueba (uno que cita refs inválidas, otro que inventa en la corrección).
  Sin `ANTHROPIC_API_KEY` el 2026-10-10: prueba en vivo SKIPPED.
- Pixel Presence: micrófono y síntesis **reales** (el smoke los simula con `addInitScript`), Safari,
  Firefox, lectores de pantalla y dispositivos táctiles reales. Sin probar.
- Creative Memory con Claude real (sintetizador e intérprete de `manage_memory`): solo demo y reglas;
  `creativeMemory.live.test.ts` SKIPPED sin `ANTHROPIC_API_KEY` (2026-10-13).
- ~~La interfaz de Campañas en un navegador~~: recorrida en el smoke del Prompt 14 (detalle,
  pestaña "Plan de contenido" y su CTA).
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
| D27 | Campaign (estratégica) separada de Project (operacional); CampaignStrategy versionada aparte; `campaignId` opcional solo en Project y ContentItem (no en Task) | No mezclar estrategia y ejecución; historial sin sobrescribir; sin duplicar Operations | `CAMPAIGNS.md` §1 |
| D28 | Validación de fundamento de marca: cifras, nombres propios, claims de mercado y afirmaciones sobre clientes se recortan o descartan; vocabulario sin las fechas del periodo; insight sin base → `strategic_hypothesis` | No inventar datos de la marca; evita el R2 del planner | `CAMPAIGNS.md` §2 |
| D29 | Campaign Manager sin estrategia de respaldo: 503 con un proveedor real caído; demo determinista desde el ADN solo con `AI_PROVIDER=demo` | Mejor nada que una estrategia falsa | `CAMPAIGNS.md` §2 |
| D30 | Aceptar una pieza: reserva atómica (content → ContentItem; resto → Project); editar y rechazar condicionados a "no convertida" | Nunca duplicados ni estados incoherentes (evita el R7 del planner) | `CAMPAIGNS.md` §4 |
| D31 | El chat Enterprise conoce hasta 3 campañas activas (nombre, objetivo, estado), nunca su estrategia | Consciencia básica sin inflar el prompt ni inventar campañas | `CAMPAIGNS.md` §6 |
| D32 | Un solo ContentPlan con `contextType` e invariantes en contracts; estrategia de planificación elegida por `workspace.type` en el mismo endpoint | Sin modelos ni pantallas `Enterprise*` duplicados | `ENTERPRISE-CONTENT.md` §1, §3 |
| D33 | `contextType` sin `default` en Mongoose + migración idempotente (dry-run, driver nativo, al arrancar); el DTO usa `workspace.type` como respaldo | Un `default` se aplicaría al leer y ocultaría los planes sin migrar; el tipo del workspace es inmutable, así que la migración es exacta | `ENTERPRISE-CONTENT.md` §2 |
| D34 | El plan Enterprise guarda `brandDnaVersion` y la `campaignStrategyVersion` exacta; no se regenera si la campaña cambia de estrategia (la UI avisa) | Trazabilidad sin reescribir planes | `ENTERPRISE-CONTENT.md` §1, §6 |
| D35 | Refs controladas (`CAMPAIGN_1`, `DELIVERABLE_n`, `PROJECT_n`, `CONTENT_n`) + grounding promocional (descuentos, precios, gratis, "favorito de…", testimonios) y de campaña (`developsCampaign`); fechas fuera del vocabulario | La IA no apunta a recursos ajenos ni afirma ofertas; el plan desarrolla la campaña en vez de sustituirla | `ENTERPRISE-CONTENT.md` §3 |
| D36 | Demo Enterprise por voz editorial del arquetipo (cuidado · método · búsqueda) y encuadres distintos en planes sucesivos; una salida demo fuera de schema es `invalid_output` (502) | TINTO ≠ INVENTIA y campaña A ≠ B sin modelo; nunca 503 "no disponible" por agotar ideas | `ENTERPRISE-CONTENT.md` §3 |
| D37 | **Pixel is conversation-first and zero-entry-first.** Structured resources exist primarily as Pixel's operational memory and as an advanced control surface for the user. Users should not have to maintain Pixel's internal model manually for the product to be useful. | La entrada principal es una frase; los formularios pasan a opciones avanzadas sin borrarse | `PIXEL-COMMAND.md`, ADR 32 |
| D38 | PixelCommand orquesta servicios existentes; la IA solo interpreta lenguaje; el backend valida capacidades (`pixelIntentAvailable`), descarta entidades que no están en el texto y resuelve campañas y proyectos por texto contra el workspace activo | Ni otro cerebro ni ids elegidos por el modelo | `PIXEL-COMMAND.md` §2–§3 |
| D39 | Como mucho una pregunta y solo si cambia materialmente el resultado; nunca lo que ya está en el ADN; valores por defecto del contexto (canales de la campaña, plataformas del PersonalDNA, periodo por plazo en el día local) | Fricción mínima: 0 campos con una frase suficiente, 1 pregunta si falta un dato crítico | `PIXEL-COMMAND.md` §4 |
| D40 | Una confirmación para todo el plan: reserva atómica `proposed\|partial\|failed → executing` + revisión; pasos que guardan lo creado; `partial` con reintento desde el paso fallido | Nunca duplicados ni "todo listo" falso | `PIXEL-COMMAND.md` §6 |
| D41 | **Pixel does not only generate. Pixel evaluates its own output against the user's or brand's known context before asking the user to commit to execution. Guardian provides explainable creative judgment, not opaque approval scores.** | Cada hallazgo dice qué falla, dónde (evidencia del recurso), por qué (evidencia del ADN) y qué hacer | `BRAND-GUARDIAN.md`, ADR 35 |
| D42 | Un GuardianEngine con evaluadores modulares: deterministas primero y una sola llamada semántica agrupada con refs controladas; los hallazgos de la IA nunca bloquean, se limitan a `high` y desde `medium` necesitan una ref de marca válida | Trazabilidad, coste acotado y ninguna "opinión" sin respaldo | `BRAND-GUARDIAN.md` §3–§4, ADR 36 |
| D43 | Severidad ≠ bloqueo. BLOCK solo para integridad factual (promoción, claim de mercado o cifra sin fundamento) y restricciones explícitas; override solo en lo creativo (no en lo factual), registrado | Conservador con lo que puede dañar a la marca; el humano decide lo creativo | `BRAND-GUARDIAN.md` §5 |
| D44 | Score calculado en el backend: penalizaciones fijas (info 0 · low 5 · medium 12 · high 25 · critical 40), pesos simples por dimensión, solo dimensiones aplicables; la UI lo presenta como heurístico | Reproducible y explicable, nunca una "verdad" | `BRAND-GUARDIAN.md` §5 |
| D45 | Corrección de una sola pasada + una re-evaluación; solo quita o suaviza; se descarta si añade afirmaciones; aplicar es otra acción explícita con el servicio del recurso y exige que el informe no esté `stale` | Pixel se corrige sin inventar ni sobrescribir a escondidas | `BRAND-GUARDIAN.md` §6–§8 |
| D46 | Preflight solo en Enterprise y solo en intenciones que crean campaña, plan o pieza; el texto del propio usuario cuenta como fundamento; BLOCK deja `guardianBlocked` y confirmar responde 409 hasta ajustar o hacer override | "Organizar" nunca ejecuta algo que el Guardian bloqueó sin decisión explícita | `PIXEL-COMMAND.md` §8 bis |
| D47 | **Creative Memory is decision memory, not conversation storage.** Pixel remembers high-signal creative preferences, exceptions and recurring decision patterns. A single isolated action must not silently redefine the user's or brand's identity. | Dos capas (evento inmutable / memoria); patrón → solo candidata | `CREATIVE-MEMORY.md` §1–§2 |
| D48 | Reutilizar el modelo CreativeMemory: `content` = enunciado, `memoryScope` = contextType, procedencia nueva en `origin`, `status` sin default; lo anterior → `legacy` sin clasificar | Ningún segundo sistema; nada reinterpretado ni inventado | `CREATIVE-MEMORY.md` §4, §14 |
| D49 | Umbral 3 señales independientes (media/alta, sin `influencedByMemory`) en ≥ 2 recursos; anti-reaprendizaje por `forgottenAt`/`dismissedAt`; débiles solo refuerzan | Sin sobreaprendizaje ni auto-refuerzo | `CREATIVE-MEMORY.md` §6–§7 |
| D50 | Excepción con alcance suspende (no borra) la preferencia general; la solicitud actual siempre manda; la memoria nunca es un hecho ni fundamenta claims; Daily Director solo `workflow` | Precedencia explicable y segura | `CREATIVE-MEMORY.md` §9, §11–§12 |
| D51 | Etiqueta corta «Lo aprendido» en la barra lateral (la página se titula «Lo que Pixel ha aprendido»); «historia» no cuenta como Stories (solo «stories» / «historias de Instagram») | Sin líneas partidas en la navegación; menos falsos positivos | `CREATIVE-MEMORY.md` §3, §16 |

## 9. Contratos que no deben romperse

### 9.1 API HTTP (todas bajo `/api`)

| Ruta | Métodos | Notas |
|---|---|---|
| `/health` | GET | 200 `ok` / 503 `degraded`; `service: 'pixel-api'` |
| `/auth/register` · `/auth/login` · `/auth/logout` · `/auth/me` | POST (201) · POST · POST (204, sin cuerpo) · GET | `{ user }`; la sesión va en cookie; `me` sin sesión → 401 |
| `/workspaces` | GET, POST (201) | segundo Personal → 409 |
| `/workspaces/:id` | GET, PATCH | overview `{ workspace, company \| null, personal \| null, avatar \| null }` (`avatar`: vista previa del personaje y `personal.avatarVersion`, Prompt 17; también en el listado) |
| `/workspaces/:id/company` | POST (201) | personal → 400; ya tiene empresa → 409 |
| `/workspaces/:id/avatar` · `/avatar/generate` | GET · POST (201) | `AvatarResponse` |
| `/workspaces/:id/conversations` · `/:cid/messages` | GET, POST (201) · GET, POST (201) | mensaje ≤ 4000; sin contexto → 409 con `details.reason`; IA rehúsa → 422; IA no disponible o con límite de uso → 503 |
| `/workspaces/:id/personal-profile` | GET, PUT | solo Personal; PUT = `{ step, data }` |
| `/workspaces/:id/personal-dna` · `/generate` | GET, PUT · POST (200) | solo Personal |
| `/workspaces/:id/projects` · `/:projectId` | GET, POST (201) · GET, PATCH, DELETE (archiva) | Personal y Enterprise |
| `/workspaces/:id/tasks` · `/:taskId` | GET, POST (201) · GET, PATCH, DELETE (204) | Personal y Enterprise; `projectId` debe ser del mismo workspace |
| `/workspaces/:id/content` · `/:contentItemId` | GET, POST (201) · GET, PATCH, DELETE (204) | Personal y Enterprise |
| `/workspaces/:id/operations/summary` | GET | conteos y próximos vencimientos |
| `/workspaces/:id/content-plans` · `/generate` · `/:planId` | GET, POST (201) · POST (201) · GET, PATCH, DELETE (archiva) | Personal y Enterprise; sin ADN → 409 `personal_context_not_configured` / `brand_dna_missing`; `generate` admite `campaignId` (solo Enterprise; campaña sin estrategia → 409 `campaign_strategy_missing`); `GET ?campaignId=` |
| `/workspaces/:id/content-plans/:planId/items/:itemId` · `/accept` · `/reject` | PATCH · POST (201 al crear, 200 si ya existía) · POST | Personal y Enterprise; PATCH admite también `objective` y `suggestedAngle` |
| `/workspaces/:id/campaigns` · `/generate` · `/:campaignId` | GET, POST (201) · POST (201) · GET, PATCH, DELETE (archiva) | solo Enterprise (Personal → 400 `feature_not_available`); generar sin ADN → 409 `brand_dna_missing`; sin IA → 503 `campaign_generation_unavailable` |
| `/workspaces/:id/campaigns/:campaignId/strategy[?version=]` · `/strategy/generate` | GET · POST (201) | versiones conservadas; dos regeneraciones simultáneas → 409 `campaign_strategy_generation_in_progress` |
| `/workspaces/:id/campaigns/:campaignId/deliverables` · `/:deliverableId` · `/accept` · `/reject` | GET · PATCH · POST (201 al crear, 200 si ya existía) · POST | convertida → 409 `campaign_deliverable_converted` al editar o rechazar |
| `/workspaces/:id/daily-brief` · `/daily-brief/generate` | GET (404 `daily_brief_not_generated` si no hay) · POST (201) | solo Personal; respuesta `{ brief, stale }` |
| `/workspaces/:id/pixel/commands` · `/:commandId` · `/adjust` · `/confirm` · `/cancel` | POST (201) · GET · POST · POST (`{ command, executed }`) · POST | Personal y Enterprise; sin ADN → 409; confirmar exige la `revision` vista; segunda confirmación → 200 `executed: false`; `source: voice` se trata como texto; `contextHint.resource` `{ type, id }` (campaign, content_plan, project, content_item) se valida contra el workspace → 400 `VALIDATION_ERROR` si no es suyo (Prompt 17) |
| `/workspaces/:id/pixel/commands/:commandId/guardian-override` | POST | solo Enterprise; todos los hallazgos bloqueantes deben admitir override (si no, 409 `guardian_not_overridable`) |
| `/workspaces/:id/guardian/evaluate` · `/reports` · `/reports/:reportId` · `/override` · `/correct` · `/apply` | POST (201) · GET (paginado, `?resourceType=&resourceId=`) · GET (`{ report }` con `stale`) · POST · POST (201) · POST | solo Enterprise (Personal → 400 `feature_not_available`); sin ADN → 409 `brand_dna_missing`; recurso ajeno → 404 |
| `/workspaces/:id/creative-memories` · `/:memoryId` · `/remember` · `/:memoryId/confirm` · `/dismiss` · `/forget` · `/replace` | GET (`?view=`) · GET (`{ memory, evidence, related }`) · POST (201/200) · POST · POST · POST · POST (201) | Personal y Enterprise; recurso ajeno → 404; hechos/credenciales/sensible → 400 `creative_memory_not_allowed` |
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
  `content_plan_generation_failed`, `campaign_generation_unavailable`, `campaign_generation_failed`,
  `campaign_strategy_generation_in_progress`, `campaign_deliverable_converted`,
  `campaign_strategy_missing` (Prompt 14), `pixel_command_not_adjustable`, `pixel_command_not_confirmable`,
  `pixel_command_revision_changed`, `pixel_command_changed`, `pixel_command_not_cancellable`,
  `pixel_command_reply_unavailable` (Prompt 14.1), `guardian_preflight_blocked`, `guardian_not_overridable`,
  `guardian_single_correction_pass`, `guardian_nothing_to_fix`, `guardian_no_safe_correction`,
  `guardian_report_stale` (409) y `guardian_apply_not_supported` (400) (Prompt 15), `creative_memory_not_allowed`, `creative_memory_unclear` (400), `creative_memory_not_candidate`, `creative_memory_not_active`, `creative_memory_duplicate` (409) (Prompt 16). No tienen schema en
  contracts. `ChatStudio` reacciona a
  `personal_context_not_configured`, `brand_dna_missing` y `enterprise_company_missing`.

### 9.3 Valores persistidos (cambiarlos rompe documentos guardados)

`CompanyStatus`, `WorkspaceType` (inmutable) y `WorkspaceStatus`; `Conversation.contextType`;
`Message.role` (`user | pixel`) y `meta.mode` (`ai | demo`); `AvatarProfile.sourceType`,
`engine.kind` y **todos** los enums de `AvatarConceptSchema`; bloques del BrandDNA y del PersonalDNA
(arquetipos, `LanguageCode`, roles de paleta…); `generator.kind`; claves de paso de ambos
onboardings (un paso guardado que deja de validar se descarta en silencio); `CreativeMemory.kind`,
`memoryScope` y `source.type`; `ContentPlan.contextType`, `ContentPlanItem.strategicRole` y
`funnelStage` (Prompt 14); `PixelCommand.status`, `intent` y los tipos de paso (Prompt 14.1); `GuardianReport.mode`, `resourceType`, `status`, las dimensiones, severidades y códigos de hallazgo (Prompt 15); `CreativeMemory.status`, `kind`, `origin`, `polarity`, `dimension`, `scope.type` y `CreativeDecisionEvent.eventType` / señales (Prompt 16); la intención `manage_memory` y los pasos `remember_memory` / `forget_memory`. Al leer, la API valida con `Schema.parse` BrandDNA, PersonalDNA,
AvatarProfile, Conversation, Message y CreativeMemory; Workspace y Company no se validan al leer,
pero la web valida cada respuesta (un valor fuera del enum rompe la UI con `INVALID_RESPONSE`). En
ambos casos: **no estrechar enums**.

### 9.4 Colecciones e índices

`users`, `workspaces`, `companies`, `brand_dnas`, `personal_profiles`, `personal_dnas`,
`avatar_profiles`, `conversations`, `messages`, `creative_memories`, `projects`, `tasks`,
`content_items`, `content_plans`, `content_plan_items`, `daily_briefs`, `campaigns`,
`campaign_strategies`, `campaign_deliverables`, `pixel_commands`, `guardian_reports`, `creative_decision_events`. Índices con nombre:
`one_personal_per_owner` (workspaces), `brand_company_version` y `brand_company_dna_version`
(avatar_profiles, parciales). Únicos relevantes: `users.email`, `{ownerId, slug}` en workspaces y
companies, `workspaces.migratedFromCompanyId` (parcial; mantiene idempotente la migración),
`companies.workspaceId` (parcial), `{companyId, version}` en brand_dnas, `{workspaceId, version}` en
personal_dnas y avatar_profiles (parcial), `personal_profiles.workspaceId`,
`{workspaceId, localDate, version}` en daily_briefs, `{workspaceId, campaignId, version}` en
campaign_strategies. Las colecciones de Operations, del planner, `campaigns` y
`campaign_deliverables` solo tienen índices no únicos que empiezan por `workspaceId` (Project y
ContentItem ganan `{workspaceId, campaignId}`; `content_plans`, `{workspaceId, campaignId,
createdAt: -1}` en el Prompt 14).

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
  `/workspace/:workspaceId/{,chat,pixel,personal/onboarding,personal/dna,campaigns,campaigns/:campaignId,projects,projects/:projectId,tasks,content,content-planner,content-planner/:planId,guardian,guardian/reports/:reportId,memory}` (las dos últimas, solo Enterprise).
- **Tests guardianes de invariantes:** `tenantScoped`, `contextBuilders`, `enterpriseWorkspace`,
  `workspaces`, `migration`, `avatarIndexes`, `personal*`, `chat`, el aislamiento por empresa de
  `companies`, `brandDna` y `avatar` (recurso ajeno → 404), `auth` (cookie, 401),
  `operationsIsolation`, `enterpriseOperations`, `projects`, `tasks`, `content`, `contentPlans`,
  `dailyBrief`, `dailyDirector.unit`, `contentPlanning.engine`, `campaigns`,
  `campaignStrategy.engine`, `enterpriseContentPlanner`, `enterprisePlanning.strategy`,
  `pixelCommand`, `pixelCommand.rules`, `guardian`, `guardian.engine`, `creativeMemory` y `creativeMemory.unit`, en `apps/api/test/`; `enterpriseContentPlan`,
  `pixelCommand`, `guardian` y `creativeMemory` en contracts.

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
12. **Pixel Presence (Prompt 17) es estado de la web, no un modelo.** Ni el estado de presencia ni
    las preferencias de voz se guardan en Mongo: las preferencias van por dispositivo y por Pixel en
    `localStorage` (`pixel:presence:<workspaceId>`, con try/catch) porque las voces dependen del
    navegador. El audio no llega a la API: solo la transcripción, como texto (`source: voice`).
13. **Chat fuera de la navegación (Prompt 17).** Se habla con Pixel desde el Inicio o el Pixel Dock
    («Ver la conversación completa»); la ruta `/chat`, sus conversaciones y el acceso de la tarjeta de
    marca del Inicio Enterprise se conservan. «Empresas» y «Personaje» siguen en la navegación.

## 11. Problemas conocidos y deuda técnica

### 11.1 Revisión de `e59757d` (Prompts 9–12), 2026-10-08

Revisión en 5 frentes: aislamiento, IA y contratos, datos y fechas, web, docs y tests. Cada hallazgo
pasó por un verificador escéptico: hubo 26 hallazgos, se descartaron 4 y quedan **20 problemas
distintos** (dos describían el mismo). **Ninguno es de severidad alta ni rompe el aislamiento entre
workspaces.** Corregidos en el Prompt 14: **R5** (el formulario sigue montado mientras
genera y conserva lo escrito si falla), **R7** (editar y rechazar son una sola operación condicionada
a "no convertida") y **R11** (el rollback borra también los ítems). El resto sigue abierto.

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

- ~~**Test dependiente de la hora**~~ — **corregido** en el Prompt 13 (la tarea vence hace 2 días,
  no 1). Se reprodujo a las 03:02 UTC antes de corregirlo. Texto original: `enterpriseOperations.test.ts` › "solo conteos del workspace
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
- **Movimiento:** ~~el avatar 3D ignora `prefers-reduced-motion`~~ — corregido en el Prompt 17
  (`reducedMotion` congela la pose; también «Reducir animaciones de Pixel»). Sigue pendiente el
  `scrollTo({ behavior: 'smooth' })` de los dos onboardings.
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
- **Test intermitente:** `dailyBrief` › «doble clic» falló una vez en la suite completa de la API
  (2026-10-13, Prompt 17) y pasó 4/4 aislado y en la repetición: dedupe en memoria (`inFlight`)
  sensible a la temporización. Sin corregir.
- **Coincidencia de nombres de avatar:** los motores de marca y personal son deterministas e
  independientes, así que pueden dar el mismo nombre (en el smoke, INVENTIA y el Pixel Personal se
  llamaron «Núcleo Sabio»). Se comprobó que son avatares distintos (`sourceType`, ids, sin `companyId`
  en el personal): no es una fuga de datos, pero confunde.
- **EOL de la copia de trabajo:** `core.autocrlf=true` y la copia está mezclada (CRLF y LF) desde antes;
  el índice es LF, así que no afecta a los commits. En el Prompt 17, `sed -i` de Git Bash convirtió a
  LF algún archivo CRLF (`sceneSpec.test.ts` se restauró; de otros no hay registro del original).
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

### 2026-10-13: Prompt 17 (Pixel Presence V1), equipo del usuario, sin commit ni push

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores ni avisos |
| Prettier | OK en los archivos tocados, cada uno con su EOL (`--end-of-line auto`); el CRLF del repo no se normalizó |
| `npm run test` | contracts 79/79 · API 484 + 4 omitidos (las pruebas en vivo) · web 265/265 (antes 270: `sceneSpec.test` se ejecutaba también dentro de los archivos que importaban su fixture; se movió a `test/avatarFixtures.ts`) |
| `npm run build` | OK (Vite avisa de un chunk grande: aviso, no error) |
| Navegador (API :4100 y build de producción en :5180 temporales, modo demo, base `pixel_smoke_p17` borrada al terminar) | **67/67**. Tus Pixels (4 Pixels, miniaturas 2D, sin WebGL, sin «API en línea»); Inicio INVENTIA vacío («INVENTIA está lista.», un solo canvas, 4 sugerencias, sin Dock); texto «Necesito mover el nuevo servicio de prototipado esta semana.» → thinking → propuesta con Guardian → Organizar → success → idle; voz (simulada) → listening → transcripción → thinking → Pixel **dice** su pregunta → respuesta por texto → speaking con el resumen ≤ 260 → la propuesta no se organiza sola; cambio TINTO → INVENTIA mientras habla (cancelación, INVENTIA en idle); Plan de contenido y Campañas (ambient, «Más opciones», vacío con el Pixel); Dock en la campaña «Prototipado rápido» + «Hazme tres Reels con esto» → usa la campaña; id de INVENTIA desde TINTO → 400; Guardian reviewing → warning; Personaje «Voz y movimiento» y «Escuchar a Pixel»; Personal (Inicio, Daily Director, navegación sin Chat, Dock → conversación completa; `/chat` se conserva); tableta 834 y móvil 390 sin desbordes; sin voz (sin micrófono, texto intacto); permiso denegado; sin WebGL (2D); movimiento reducido (sin pulso); marca sin configurar sin Dock ni personaje; consola limpia |
| Corregido durante el smoke | voz: Pixel no hablaba en la sesión de voz (cierre viejo; ahora se lee de una referencia viva) · Dock: nombre accesible propio · Daily Director: segundo WebGL en el Inicio Personal (ahora 2D) · Tus Pixels desbordaba en móvil (`grid-cols-1`) · la propuesta del Dock se apretaba en tres columnas (container query) |
| Claude real | SKIPPED: no hay `ANTHROPIC_API_KEY` en el entorno ni `apps/api/.env` |
| Voz real | No verificable aquí: micrófono y `speechSynthesis` simulados en Chrome con `addInitScript` (los proveedores reales del navegador se ejecutan igual sobre esas APIs) |

Los servidores del usuario (:4000 y :5173) no se tocaron.

**Cierre previo al commit (2026-10-14), a petición del usuario:**

| Punto | Cambio | Verificación |
|---|---|---|
| Inicio vacío | `OperationsSummary.counts.currentCampaigns` (borrador, planificada, activa, en pausa; `CURRENT_CAMPAIGN_STATUSES` en contracts); `isEmptyWork` la usa en lugar de `activeCampaigns`; el contador del Inicio Enterprise pasa a «Campañas vigentes» (con «N activas») | API (vigentes sin completadas ni archivadas ni de otro Pixel; Personal = 0) · web (sin recursos / borrador / activa / proyecto / tarea / contenido) · navegador: INVENTIA vacía → organizar → borrador → el Inicio ya no está vacío («Campañas vigentes 1 · 0 activas») |
| Privacidad de la voz | Aviso la primera vez que se pulsa el micrófono («Entendido» / «Ahora no»), por dispositivo; también en «Voz y movimiento» | web (texto, vista, almacenamiento solo «visto», sin almacenamiento) · navegador: el micrófono no se abre hasta «Entendido», no se repite al recargar ni en otro Pixel, solo se guarda `pixel:voice-notice = seen` |
| Tarjeta «Tu Pixel» | `BrandPixelCard`: «Tu Pixel», nombre del personaje, «Listo», una acción («Personalizar»); sin los accesos repetidos; `pixelStatus` `ready` = «Listo» (también en la lista de Empresas) | web (4 estados) · navegador |

Validación: typecheck 0 · lint limpio · Prettier OK en los tocados · contracts 79/79 · API 485 + 4
omitidos · web 275/275 · build OK · navegador: focalizado 19/19 y regresión de Presence 68/68
(la regresión reutiliza la campaña que organiza; como no tiene canales, Pixel pregunta la plataforma
y nunca la campaña).

### 2026-10-13: Prompt 16 (Creative Memory), equipo del usuario (commit `29fbb77`, sin push)

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores ni avisos |
| Prettier | OK en los archivos tocados (`contextBuilders.test.ts` es CRLF y se mantuvo CRLF); el CRLF del repo no se normalizó |
| `npm run test` | contracts 79/79 · API 479 + 4 omitidos (`chat.live`, `contentPlanning.live` y los 2 de `creativeMemory.live`) · web 230/230 |
| `npm run build` | OK (Vite avisa de un chunk grande: aviso, no error) |
| Navegador (API :4100 y web :5180 temporales, modo demo, base `pixel_smoke_p16` borrada al terminar) | 29/29: recordar por conversación (una confirmación «Recordar») → la campaña la aplica → página con la memoria → olvidar → la siguiente campaña ya no la aplica; candidata por 3 rechazos en 2 planes → «¿Por qué Pixel piensa esto?» → confirmar; excepción de neón en una campaña (Guardian la explica allí y avisa en otra); INVENTIA sin rastro de TINTO; Personal «prefiero carruseles educativos» → plan en carruseles; tableta y móvil sin desbordes; consola limpia |
| Claude real | SKIPPED: no hay `ANTHROPIC_API_KEY` en el entorno ni `apps/api/.env` |

Los servidores del usuario (:4000) no se tocaron.

### 2026-10-10: Prompt 15 (Brand Guardian Core), equipo del usuario

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores ni avisos |
| Prettier | OK en los archivos de código tocados; el CRLF preexistente del repo no se normalizó |
| `npm run test` | contracts 74/74 · API 438 + 2 omitidos (`chat.live`, `contentPlanning.live`) · web 218/218 |
| `npm run build` | OK (Vite avisa de un chunk grande: aviso, no error) |
| Navegador (API :4100 y web :5180 temporales, modo demo, base `pixel_smoke_p15` borrada al terminar) | 27/27: preflight TINTO en verde → Organizar; preflight BLOCK con promoción inventada y "Continuar de todas formas"; revisión de campaña; claim, copy fundamentado y "neón"; el mismo copy genérico da hallazgos distintos en TINTO e INVENTIA; corregir + aplicar en una pieza; Personal sin Guardian (ni ruta ni navegación); tableta y móvil sin desbordes; consola limpia salvo el 404 documentado del daily brief |
| Claude real | SKIPPED: no hay `ANTHROPIC_API_KEY` en el entorno ni `apps/api/.env` |

Los servidores del usuario (:4000 y :5173) no se tocaron.

### 2026-10-09: Prompt 14.1 (Zero-entry UX: PixelCommand), equipo del usuario

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores ni avisos |
| Prettier | OK en los archivos de código tocados; el ruido CRLF del repo completo sigue siendo preexistente y no se normalizó |
| `npm run test` | contracts 71/71 · API 405 + 2 omitidos (`chat.live`, `contentPlanning.live`) · web 208/208 |
| `npm run build` | OK (mismo aviso de chunk grande) |
| Arranque | API compilada en :4100 (BD `pixel_smoke_p141`, borrada después) y Vite en :5180; :4000 y :5173 del usuario intactos |
| Navegador (Playwright-core + Chrome) | 41/43, y los 2 fallos explicados: (1) la página del plan se leyó antes de cargar (repetido esperando la sección: "Alineación con la campaña" visible, 3 piezas); (2) el 404 de `GET /daily-brief` sin dirección del día, que es el contrato del Daily Director (`daily_brief_not_generated`), no un error nuevo |
| Fricción medida | TINTO "Necesito contenido para el lanzamiento de 500 g esta semana." → 0 campos y 0 preguntas (detecta la campaña y usa sus canales); TINTO "Quiero lanzar el nuevo producto." → 1 pregunta; INVENTIA "Necesito mover el nuevo servicio de prototipado en Instagram." → 0 campos (su ADN, sin rastro de TINTO); Personal "Necesito publicar algo esta semana sobre Pixel." → 0 campos (PersonalDNA: Instagram). En todos, 1 clic en Organizar |
| Claude real | **SKIPPED**: no hay `ANTHROPIC_API_KEY` |

Encontrado y corregido: copiar subdocumentos de Mongoose con spread (500 al confirmar; ahora
`toObject()`); la redacción "quieres campaña de…" (ahora "una campaña de…"; test). La agrupación
"Estrategia" del Prompt 14 y su sección por tipo en la cabecera (`sectionByType`) se retiraron: en
Enterprise todo el control detallado vive en Trabajo.

### 2026-10-09: Prompt 14 (Enterprise Content Planner), equipo del usuario

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores ni avisos |
| Prettier | OK en los 50 archivos de código tocados (y sin diffs solo de fin de línea). `prettier --check .` del repo completo marca 258 archivos **solo por CRLF** (`core.autocrlf=true`), preexistentes: no se normalizaron |
| `npm run test` | contracts 68/68 · API 362 + 2 omitidos (`chat.live`, `contentPlanning.live`) · web 195/195 |
| `npm run build` | OK (mismo aviso de chunk grande) |
| Arranque | API compilada en :4100 (MongoDB local, BD `pixel_smoke_p14`, borrada después) y web (Vite) en :5180; los servidores del usuario en :4000 y :5173 no se tocaron |
| Smoke HTTP (modo demo) | 23/23. TINTO con la campaña "Lanzamiento TINTO 500 g": 8 piezas en 14 días a 4/semana, pilares de la estrategia (Origen, Producto), usa piezas y el proyecto de la campaña, no repite el contenido reciente, sin claims; aceptar 2 → Contenido con `campaignId`; las piezas de campaña no cambian de estado. TINTO sin campaña: no finge campaña. INVENTIA: proceso, prueba e iteración ("Iteración a iteración: prototipo estación solar"), sin rastro de TINTO; la campaña de TINTO desde INVENTIA → 400. Personal: genera, acepta y el Daily Director no lee planes de empresa |
| Navegador (Playwright-core en el scratchpad + Chrome del sistema) | 77/78 a 1440, 834 y 390 px: detalle de campaña, planner y planes de TINTO (con y sin campaña), INVENTIA y Personal; sin scroll horizontal; navegación Estrategia · Trabajo · Marca (Personal sin Campañas); pestaña "Plan de contenido" de la campaña y su CTA con `?campaign=`; formulario con la campaña preseleccionada; generar desde la UI → detalle; aceptar desde la UI; consola sin errores. El único fallo fue una expectativa del script (la sección del plan se llama "Propuestas" en su `aria-label`; el orden era el correcto). No se pudo ver el estado "pensando" (el demo responde en ~75 ms) |
| Claude real | **SKIPPED**: no hay `ANTHROPIC_API_KEY` (ni en el entorno ni `apps/api/.env`) |

Encontrado y corregido durante los smokes:
- La cabecera decía "Trabajo › Plan de contenido" (y "Trabajo › Campañas") en Enterprise: ahora
  Campañas es Estrategia y el planner toma la sección por tipo (`RouteHandle.sectionByType`; test).
  (Retirado en el Prompt 14.1: la navegación pasó a Inicio · Trabajo · Marca.)
- Un **segundo plan de la misma campaña fallaba siempre (502)**: el demo evitaba el historial solo
  por igualdad exacta y repetía el título con "(Reel)", y el grounding lo descartaba por similitud.
  Ahora el demo usa una similitud más estricta y encuadres nuevos por voz (test: tres planes seguidos
  sin repetir títulos).
- Al agotar las ideas, el demo devolvía 0 piezas y la API respondía 503 "no disponible": ahora es
  `invalid_output` → 502 (test).
- Los fallos `failed` del planner no dejaban rastro: ahora se registra el motivo interno.
- Un error propio de esta etapa en la cabecera (variable sin definir) lo detectó el navegador, no
  `tsc -p .` (en `apps/web` ese tsconfig solo tiene referencias: usar `npm run typecheck`).

Entorno: Windows 11, Node 24.11.1 / npm 11.6.2, MongoDB local en :27017.

### 2026-10-09: Prompt 13 (Campaign Manager), equipo del usuario

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | 0 errores |
| `npm run lint` | sin errores ni avisos |
| Prettier | OK en todos los archivos tocados. `npm run format:check` del repo completo marca 262 archivos **solo por CRLF** (`core.autocrlf=true` en Windows): ninguno es de esta etapa y todos pasan con LF (comprobado uno a uno) |
| `npm run test` | contracts 61/61 · API 330 + 2 omitidos (`chat.live`, `contentPlanning.live`) · web 180/180 |
| `npm run build` | OK (mismo aviso de chunk grande) |
| Arranque | API compilada en :4100 con MongoDB local y web (Vite) en :5180 sirviendo las rutas y módulos nuevos (los servidores del usuario en :4000 y :5173 no se tocaron) |
| Smoke HTTP (modo demo, BD temporal `pixel_smoke_p13`, borrada después) | 39/39: TINTO genera "Del origen a la mesa" (paleta Tostado/Caramelo/Crema/Hueso con roles, evita Neón, tono cálido, canales del brief, 7 piezas); aceptar el Reel → 1 ContentItem (idea, instagram/reel, `campaignId`), dos veces sin duplicar; pieza gráfica → Project planificado + tarea; regenerar → v2 "Trazabilidad lote a lote, a la vista" y v1 conservada; Inicio con 1 campaña activa; chat la nombra y no inventa "Campaña Navidad". INVENTIA ("Prototipo funcional en pocos días, a la vista"): tono claro y técnico, Azul acero/Cobalto con el naranja solo de acento, ritmo ágil y retícula, sin rastro de TINTO; campaña de TINTO desde INVENTIA → 404, sin convertir piezas ni vincular proyectos (400). Personal: avatar, Operations, Content Planner, Daily Director y chat funcionan; `/campaigns` → 400 |

Encontrado y corregido durante el smoke: la validación descartaba como duplicadas piezas del mismo
concepto en canales distintos (TINTO perdía 2, INVENTIA la de LinkedIn); ahora solo se descarta la
copia exacta dentro de una estrategia (test de regresión). No probado: Claude real y la interfaz en
un navegador.

Entorno: Windows 11, Node 24.11.1 / npm 11.6.2, MongoDB local en :27017.

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

0. **Usuario: revisar el Prompt 17 (Pixel Presence V1) y autorizar (o no) su commit**; decidir el push
   de `29fbb77` (Prompt 16) y del 17. No empezar el Prompt 18 sin pedirlo. Probar la voz con un
   micrófono real en Chrome/Edge y Safari. Probar `CAMPAIGN_SYSTEM`, `ENTERPRISE_PLANNING_SYSTEM`,
   `PIXEL_COMMAND_SYSTEM`, `GUARDIAN_SYSTEM`, `GUARDIAN_CORRECTION_SYSTEM` y `MEMORY_SYSTEM` con Claude real
   cuando haya `ANTHROPIC_API_KEY`.

1. **Usuario: aportar el video final de la bienvenida** (el recibido es un teaser de otro estudio y
   no se usó) y confirmar la asignación de imágenes (joven = Personal, zorro = Enterprise). Activarlo
   es solo copiar el archivo a `apps/web/public/experience/` y poner su ruta en `introVideo.src`
   (`apps/web/src/brand/experience.ts`). El avatar se trabajará después.
2. **Usuario: decidir la integración de ramas.** `feat/prompts-9-11` contiene a
   `feat/etapa-0-foundation`, así que fusionarla sería un avance rápido (sin conflictos). Elegir
   en qué rama sigue el trabajo.
3. **Corregir los hallazgos de la revisión (§11)** que el usuario priorice, empezando por los de
   severidad media y el arranque con `.env.example` (el test dependiente de la hora ya está corregido).
4. Probar con Claude real el Content Planner y el Daily Director (`CONTENT-PLANNER.md` §10).
5. Resolver la colisión "Prompt 9/10" ↔ "Etapa 9/10" en `BACKLOG.md`.
6. ~~Prompt 13 — Campaign Manager~~: hecho (Etapa M, §13). ~~Prompt 14 — Enterprise Content
   Planner~~ y ~~Prompt 14.1 — Zero-entry UX~~: hechos (Etapas EC y Z, §13), en `1593576`, sin push. ~~Prompt 15 — Brand Guardian
   Core~~: hecho (Etapa G, §13), en `79b97e7`. ~~Prompt 16 — Creative Memory~~: hecho (Etapa CM, §13), en `29fbb77`, sin push. ~~Prompt 17 — Pixel
   Presence V1~~: hecho (Etapa PR, §13), sin commit.
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
npm run migrate:content-plans [-- --dry-run]   # contextType de los planes anteriores al Prompt 14 (también corre al arrancar)
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
