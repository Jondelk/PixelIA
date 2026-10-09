# Backlog técnico — Pixel MVP 0.1

Cada etapa termina con la **definición de terminado** de `CLAUDE.md` (typecheck, lint, tests,
api y web inician, resumen de lo que funciona, pendientes). Al cerrar una etapa **se detiene el
trabajo y se reporta**; la siguiente empieza solo cuando se pide.

Estado: ⬜ pendiente · 🟨 en curso · ✅ terminado

| Etapa | Nombre | Estado |
|---|---|---|
| — | Contexto y documentación (CLAUDE.md, docs/) | ✅ |
| 0 | Fundaciones del monorepo | ✅ |
| 1 | Contratos de dominio | 🟨 (auth, user, company, onboarding y BrandDNA hechos) |
| 2 | Persistencia y aislamiento | 🟨 (User, Company, BrandDNA, plugin tenantScoped hechos) |
| 3 | Autenticación | ✅ |
| 4 | Empresas y onboarding | ✅ (edición de empresa en la UI pendiente) |
| 5 | Capa de IA | ✅ (Anthropic + demo; BrandDNA/Avatar con IA pendientes) |
| 6 | Análisis de marca: BrandDNA → AvatarProfile | 🟨 (BrandDNA y AvatarProfile determinísticos hechos; IA pendiente) |
| 7 | Avatar 3D | ✅ (Coffee Pixel completo; afinar otros sujetos) |
| 8 | Chat con Pixel | ✅ |
| W | Arquitectura de Workspaces (Enterprise / Personal) | ✅ |
| P | Pixel Personal MVP (perfil, ADN, avatar, contexto y chat) | ✅ |
| O | Operations: Projects, Tasks y ContentItems (Prompt 09) | ✅ |
| C | Content Planner Personal (Prompt 10) | ✅ (Enterprise: después) |
| D | Daily Director Personal (Prompt 11) | ✅ (Enterprise y acciones: después) |
| E | Shared Operations + Enterprise Projects (Prompt 12) | ✅ |
| M | Enterprise Campaign Manager (Prompt 13) | ✅ (prueba con Claude real pendiente) |
| — | Experiencia de entrada pública: bienvenida, Explorar y acceso (solo web) | ✅ (video final pendiente) |
| 9 | CreativeMemory básica | ⬜ |
| 10 | Cierre end-to-end del MVP | ⬜ |

### ⏳ Pendiente: requiere `ANTHROPIC_API_KEY` (aún sin configurar)

- [ ] **Content Planner con Claude real**: ejecutar `apps/api/test/contentPlanning.live.test.ts`,
  revisar `%TEMP%\pixel-content-plan-live.json` y ajustar `PLANNING_SYSTEM` y la validación de
  fundamento según el resultado. Procedimiento y criterios en `docs/CONTENT-PLANNER.md §10`.
  Hasta entonces, el planner solo está validado en modo demo.
- [ ] Ejecutar también `chat.live.test.ts` (chat Enterprise con el modelo real), que tampoco se ha
  ejecutado en este entorno.
- [ ] **Daily Director con Claude real**: en local siempre usa el fallback determinístico (`demo`).
  Hay que probar `DAILY_SYSTEM` con un modelo y revisar `sanitizedFields` y `fallbackReason` en
  `generation` (`docs/DAILY-DIRECTOR.md §15`).

No bloquea el resto de etapas: todas se desarrollan y se prueban con el proveedor demo.

---

## Etapa 0 — Fundaciones del monorepo ✅

**Objetivo:** esqueleto ejecutable, sin funcionalidades de producto.

- [x] `package.json` raíz con npm workspaces (`apps/*`, `packages/*`) y scripts `dev`, `build`, `typecheck`, `lint`, `test`, `format`.
- [x] `tsconfig.base.json` (strict, ESM) y tsconfig por workspace.
- [x] ESLint flat config + typescript-eslint + reglas React; Prettier; regla que restringe SDKs de IA a `apps/api/src/ai/`.
- [x] Vitest configurado en los tres workspaces.
- [x] `packages/contracts`: `@pixel/contracts` con `zod`, build a `dist/`; `HealthResponseSchema`, `ApiErrorSchema`, `ObjectIdSchema`.
- [x] `apps/api`: Express 5 + `config/env.ts` (Zod) + `createApp()` + logger + requestId + CORS + `errorHandler`/`notFound` centralizados + conexión MongoDB con reintentos + apagado limpio + `GET /api/health`.
- [x] `apps/api`: módulos `auth`, `companies`, `brand-dna`, `avatars`, `conversations`, `creative-memory` registrados (routers vacíos, sin endpoints aún).
- [x] `apps/web`: Vite + React 19 + TS + Tailwind 4 + React Router 7; shell (sidebar, header, área principal, navegación responsive con drawer móvil), tema oscuro, indicador real del estado de la API y pantallas vacías: `/login`, `/dashboard`, `/companies`, `/company/:companyId`, `/company/:companyId/brand`, `/company/:companyId/pixel`, `/company/:companyId/chat`.
- [x] `.env.example` por app, `.gitignore`, `.nvmrc`, README con instrucciones de arranque.

**Aceptación:** `npm install && npm run typecheck && npm run lint && npm run test && npm run build` en verde; `npm run dev` levanta api y web, y la web muestra el estado de salud de la API.

**Notas:**
- React Three Fiber y Drei se instalaron en la Etapa 7.
- La conexión real a MongoDB no pudo probarse en el entorno de desarrollo en la nube (red sin acceso a binarios de MongoDB); el modo sin base de datos (`degraded` + reintentos) sí se verificó.

## Etapa 1 — Contratos de dominio

**Objetivo:** fuente única de verdad para todas las entidades y DTOs.

- [x] `common.ts` (ObjectId string, timestamps), `errors.ts` (`ApiError`, códigos). Falta `HexColor`.
- [x] Schemas: `User` (DTO público), `auth` (register/login), `Company`, `CompanyStatus`, create/update de empresa.
- [x] Onboarding de 8 pasos (`brandOnboarding.ts`): schemas por paso, borrador, `SaveOnboardingStepInput`.
- [x] `BrandDNA` (`brandDna.ts`) con catálogo de 12 arquetipos.
- [x] `BrandDnaSchema` con todos los bloques de `ENTITIES.md §3`.
- [ ] `AvatarProfileSchema` con catálogos cerrados (`enum`) y `rationale` (mín. 5).
- [ ] `Conversation`, `Message`, `CreativeMemory` y DTOs de request/response de cada endpoint.
- [ ] Fixtures de los 3 escenarios de demo (café, tech, constructora): onboarding, BrandDNA, AvatarProfile.
- [ ] Tests: fixtures válidos pasan; casos inválidos (hex mal formado, arquetipo fuera de catálogo, rationale insuficiente, campos requeridos) fallan.

**Aceptación:** contracts compila, los tests de schemas pasan y api/web pueden importar los tipos.

## Etapa 2 — Persistencia y aislamiento

**Objetivo:** modelos Mongoose y garantías de aislamiento antes de exponer endpoints.

- [x] Conexión Mongo (`MONGODB_URI`), cierre limpio, `health` reporta estado de DB.
- [x] Modelos `User` y `Company` con sus índices.
- [ ] Modelos `BrandDNA`, `AvatarProfile`, `Conversation`, `Message`, `CreativeMemory` (se crean en sus etapas).
- [x] Plugin `tenantScoped` (aplicado a BrandDNA; se aplicará a cada nuevo modelo de empresa).
- [x] Mappers `toDTO` hacia los schemas de contracts (User, Company).
- [x] Infra de tests de integración (mongodb-memory-server o `MONGODB_URI_TEST`).
- [x] Tests: el plugin lanza error sin `companyId`; versión única por empresa.

**Aceptación:** tests de modelos en verde; la API inicia conectada a Mongo.

## Etapa 3 — Autenticación

- [x] `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`.
- [x] Hash con `bcryptjs`, JWT en cookie httpOnly, middleware `requireAuth`, `originGuard`.
- [x] Web: `RegisterPage`, `LoginPage`, `AuthProvider`, rutas protegidas, cliente `lib/api.ts`, menú de usuario con logout.
- [x] Tests: registro, registro duplicado, validación, login, credenciales inválidas, `me` sin sesión/token manipulado → 401, `passwordHash` nunca expuesto, logout.

**Aceptación:** un usuario se registra, inicia sesión, recarga la página y sigue autenticado, y cierra sesión.

## Etapa 4 — Empresas y onboarding

- [x] `GET/POST /companies`, `GET/PATCH /companies/:companyId`, middleware reutilizable `requireCompanyAccess` (también protege los submódulos).
- [x] `GET/PUT /companies/:companyId/brand-dna`: guardado por paso con validación compartida.
- [x] Web: dashboard "Tus Pixels", `CompaniesPage`, creación de empresa, vista de empresa (`CompanyLayout`), estados de carga/error/vacío.
- [x] Web: onboarding de 8 pasos con progreso, "Guardar y continuar", retomar donde quedó, sugerencias + texto libre, colores y escalas.
- [ ] Edición de empresa (PATCH) en la UI.
- [x] **Suite de aislamiento** (inicio): usuario B no puede listar, leer ni modificar empresas de A ni sus submódulos (404).

**Aceptación:** un usuario crea una empresa, completa el onboarding en varias sesiones y lo envía.

## Etapa 5 — Capa de IA ✅

- [x] `AIProvider` con `generateText()` y `generateStructuredOutput()`, `createAIProvider(env)`.
- [x] `AnthropicProvider` (SDK oficial, `claude-opus-5-5`, fallback de servidor, rechazos, errores tipados, caché del system prompt).
- [x] `DemoProvider` local sin IA para desarrollo y tests.
- [x] Regla ESLint: SDKs de IA solo dentro de `apps/api/src/ai/`.
- [x] Tests del proveedor Anthropic con cliente falso (forma de la petición, rechazos, errores).
- [ ] Usar `generateStructuredOutput()` para BrandDNA y AvatarProfile con IA.

## Etapa 6 — Análisis de marca: BrandDNA → AvatarProfile

- [ ] Prompts versionados: `brandAnalysis.prompt.ts`, `avatarDesign.prompt.ts` (este último recibe **solo** el BrandDNA y el catálogo del renderer).
- [ ] `BrandAnalysisService` y `AvatarDesignService`.
- [ ] Job en proceso disparado por `submit`; estados `analyzing → ready | failed`; protección contra doble ejecución.
- [ ] `POST /analysis/retry`, recuperación de jobs al arrancar (`ANALYSIS_TIMEOUT_MS`).
- [x] `GET /brand-dna`.
- [x] Generador determinístico de BrandDNA (`rules-1`), versionado por `sourceHash`, pantalla "Así entiende Pixel tu marca".
- [x] Avatar Concept Engine: interfaz reemplazable por IA + motor de reglas `avatar-rules-1` (catálogo de sujetos, señales combinadas, vetos por restricciones, rationale con fuentes).
- [x] `GET /avatar`, `POST /avatar/generate` con versionado, historial, variación al regenerar e `isStale`.
- [x] Web `/company/:id/pixel`: "Crear el personaje de tu marca", "Regenerar concepto", concepto completo y vista provisional SVG animada.
- [ ] Web: `AnalysisPage` con polling y estado de error con reintento; `BrandDnaSummary`.
- [ ] Tests: job completo con mock; fallo de IA → `failed`; aislamiento de los nuevos endpoints.

**Aceptación:** al enviar el onboarding, en segundos (mock) la empresa pasa a `ready` y se ven su ADN y su AvatarProfile en JSON/resumen.

## Etapa 7 — Avatar 3D

- [x] `profileToScene()` y `poseAt()` (funciones puras) + tests.
- [x] `PixelAvatar` con R3F/Drei y componentes `AvatarBody`, `AvatarFace`, `AvatarEyes`, `AvatarMouth`, `AvatarLimbs`, `AvatarAccessory`, `AvatarEnvironment`, `AvatarController`. Formas `seed`, `crystal`, `block`, `blob`, `drop`, `capsule`.
- [x] Primer caso completo: **Coffee Pixel** (grano con ranura, ojos, boca, rubor, brazos, piernas, hoja de cafeto, taza).
- [x] Estados `idle | thinking | listening | speaking | happy` con transiciones suaves; controlador manual en desarrollo.
- [x] Cámara responsiva, luces, sombras, environment procedural, controles limitados con retorno al frente.
- [x] Carga perezosa (`React.lazy`) y fallback SVG sin WebGL.
- [ ] Afinar el modelado de los demás sujetos (núcleo de cristal, bloque…) al nivel del Coffee Pixel.
- [ ] Cejas y expresiones adicionales; sincronizar `speaking` con la duración real de la respuesta del chat (Etapa 8).

**Aceptación:** los 3 escenarios de demo se renderizan como personajes claramente distintos y coherentes con su ADN.

## Etapa 8 — Chat con Pixel ✅

- [x] Modelos `Conversation` y `Message` aislados por empresa (`tenantScoped`).
- [x] `GET/POST /conversations`, `GET/POST /conversations/:id/messages`.
- [x] `PixelContextBuilder`: rol de director creativo, palancas creativas, brief de marca, avatar cuando es relevante, límites de contexto.
- [x] Persistencia atómica de pregunta + respuesta; errores de IA → 503/422 sin guardar nada.
- [x] Web: avatar 3D + chat (escritorio lado a lado, móvil avatar compacto arriba); estados `listening`, `thinking`, `speaking`, `idle`; revelado progresivo; sugerencias; historial de conversaciones.
- [x] Tests: flujo completo, historial, avatar relevante, validación, errores, aislamiento, y **misma pregunta → respuestas distintas** para café y startup (demo siempre; Claude real si hay `ANTHROPIC_API_KEY`).
- [ ] Streaming de respuestas (SSE) para mostrar texto mientras el modelo genera.
- [ ] Voz.

## Etapa W — Workspaces: User → Workspace → Enterprise / Personal ✅

Ver `docs/WORKSPACES.md` y `docs/WORKSPACE-MIGRATION.md`.

- [x] Entidad `Workspace` (`enterprise | personal`, `active | archived`), contratos
  (`WorkspaceSchema`, `CreateWorkspaceSchema`, `UpdateWorkspaceSchema`, `WorkspaceOverview`) y API
  `POST/GET /api/workspaces`, `GET/PATCH /api/workspaces/:workspaceId`.
- [x] `requireWorkspaceAccess` (404 si no es del usuario); `requireCompanyAccess` adjunta el workspace.
- [x] `Company.workspaceId` (1:1). Crear empresa crea su workspace enterprise (rollback lógico: sin
  transacciones en MongoDB standalone). `POST /api/workspaces/:workspaceId/company` completa uno vacío.
- [x] `AvatarProfile` (+ `sourceType`), `Conversation` (+ `contextType`), `Message` y `CreativeMemory`
  (modelo nuevo, sin endpoints) aislados por `workspaceId`; `companyId` legacy conservado.
- [x] `tenantScoped(schema, { key })`: exige un valor concreto (rechaza `$exists`, `$ne`, `$in`…),
  cubre `estimatedDocumentCount` y `bulkWrite`.
- [x] Contexto por estrategia: `EnterpriseContextBuilder` (mismo prompt; + memorias del workspace) y
  `PersonalContextBuilder` (placeholder → 409 `personal_context_not_configured`).
- [x] Rutas de workspace para avatar y conversaciones; rutas legacy `/api/companies/:companyId/...` intactas.
- [x] Migración idempotente (perezosa en la API + `npm run migrate:workspaces` con `--dry-run` y
  `--sync-indexes`), probada con datos creados por la versión anterior.
- [x] Web: "Tus Pixels" con workspaces, "¿Cómo quieres usar Pixel?" (`/pixels/new`), Pixel Personal
  temporal, entrada `/workspace/:workspaceId` (Enterprise redirige a `/company/:companyId`).
- [x] Tests: workspaces, empresa ↔ workspace, rutas de workspace, Personal, aislamiento entre usuarios
  y entre workspaces del mismo dueño, context builders, migración.
- [ ] Mover las pantallas Enterprise a `/workspace/:workspaceId/...` e invertir la redirección
  (convergencia de rutas, `WORKSPACES.md`).
- [ ] Pasar los clientes web Enterprise de avatar y chat a `/api/workspaces/:workspaceId/...` (ya
  aceptan una raíz de API: `companyApiBase` / `workspaceApiBase`; Personal ya usa la de workspace);
  después retirar las rutas legacy equivalentes.
- [x] Antes de avatares personales: volver parciales los índices legacy por `companyId` de
  `avatar_profiles` y generalizar `Message.meta.brandDnaVersion` (hecho en la Etapa P).
- [ ] Retirar `companyId` legacy de recursos compartidos y `Company.ownerId` cuando nada los use.
- [ ] Miembros y roles por workspace (hoy solo el dueño).

## Etapa P — Pixel Personal MVP ✅

Ver `docs/PERSONAL.md`.

- [x] Índices de `avatar_profiles` compatibles con avatares personales: parciales por `companyId`,
  `{ workspaceId, personalDnaVersion }`; `upgradeAvatarProfileIndexes()` retira los legacy al
  arrancar y en `migrate:workspaces` (probado sobre una base con datos de la versión anterior).
- [x] Contratos: `fields.ts` (primitivas compartidas), `personalOnboarding.ts` (8 pasos, sugerencias,
  borrador, progreso), `personal.ts` (`PersonalProfile`, `PersonalDNA`, completitud, respuestas),
  `WorkspaceOverview.personal`, `MessageMeta.personalDnaVersion`, tipos de avatar personales.
- [x] `PersonalProfile` (uno por workspace) y `PersonalDNA` (versionado, `tenantScoped` por
  `workspaceId`), independientes de BrandDNA.
- [x] `PersonalDnaGenerator`: reglas determinísticas + enriquecimiento IA opcional (structured output
  Zod) verificado contra las respuestas; nunca inventa datos.
- [x] API `GET/PUT personal-profile`, `GET/PUT personal-dna`, `POST personal-dna/generate`; tipo
  incorrecto → 400 `workspace_type_mismatch` (también `POST /workspaces/:id/company` en Personal).
- [x] `PersonalAvatarConceptEngine` (`personal-avatar-rules-1`): 5 tipos personales, combina profesión,
  roles, intereses, personalidad, estilo, colores, contenido, forma de trabajar y restricciones.
  Mismo endpoint de avatar resuelto por `workspace.type`.
- [x] `PersonalContextBuilder` real (Director Creativo Personal) + `<personal_context>` + respuesta demo
  personal; chat personal en las mismas rutas; sin ADN → 409 `personal_context_not_configured`.
- [x] Web: onboarding personal (8 pasos, guardado progresivo, `WizardLayout` compartido con Brand
  Brain), "Así te entiende Pixel", Inicio, Mi Pixel (`PixelStudio` compartido), Chat (`ChatStudio`
  compartido), navegación personal y tarjeta "Configurado / Configurar".
- [x] Renderer: accesorios `lens`, `headphones`, `glasses` (soporte mínimo, sin renderer nuevo).
- [x] Tests: perfil, ADN, generador (incluida la IA que inventa), avatar personal e índices, contexto,
  chat, prueba conceptual fotógrafa vs streamer, contratos y navegación web.
- [ ] Editar secciones del ADN desde la web (la API ya lo permite con `PUT personal-dna`).
- [ ] Memoria creativa personal desde el chat (Etapa 9).
- [x] Tasks, Projects y ContentItem (Etapa O). Content Planner y Daily Director: pendientes.

## Etapa O — Operations: Projects, Tasks y ContentItems ✅

Ver `docs/OPERATIONS.md`.

- [x] Contratos: `operations.ts` (prioridad, `source`, primitivas de query), `project.ts`, `task.ts`,
  `contentItem.ts`, `operationsSummary.ts` (enums, DTOs, create/update `strict`, filtros, respuestas,
  etiquetas en español).
- [x] Modelos `Project`, `Task`, `ContentItem` como recursos del workspace (`tenantScoped` por
  `workspaceId`), con índices compuestos sin redundancias.
- [x] API CRUD bajo `/api/workspaces/:workspaceId/{projects,tasks,content}` + `operations/summary`,
  para ambos tipos de workspace (Opción A). `projectId` verificado en el mismo workspace (400 si no).
  `completedAt`/`publishedAt`/`source` gestionados por el servidor. DELETE de proyecto = archivar.
- [x] Progreso calculado (completadas / tareas sin canceladas) con dos agregaciones por página.
- [x] Filtros: estado (lista), prioridad, proyecto, plataforma, formato, búsqueda literal y
  `due=today|overdue|upcoming` con `tzOffset`. Paginación `limit`/`offset` + `total`.
- [x] Web (Personal): navegación Inicio · Trabajo · Pixel; Proyectos (filtros, tarjetas, alta en
  línea), detalle (tareas + contenido), Tareas (Inbox/Hoy/Próximas/Todas/Completadas, Quick Task,
  completar optimista con deshacer, edición en línea), Contenido (pipeline por pestañas, avanzar
  etapa), Inicio con contadores y próximos elementos. Carga, error con reintento, vacío y aviso de
  éxito en todas.
- [x] Tests: API (CRUD, reglas, filtros, aislamiento A/B con 404, workspaces del mismo dueño,
  Enterprise, `tenantScoped` con operadores, índices), contracts y web (clientes, lógica, vistas).
- [x] Interfaz Operations para Enterprise (Etapa E, workspace-first, sin esperar la convergencia).
- [ ] Content Planner (PersonalDNA + Projects + ContentItems) y Daily Director.
- [ ] Incluir Operations en el contexto del chat (`getOperationsSummary` ya existe; hoy no se usa ahí).
- [ ] Calendario de contenido, recordatorios y notificaciones.
- [ ] Code splitting por ruta en la web (el chunk principal supera 500 kB; el avatar ya va aparte).

## Etapa C — Content Planner Personal ✅

Ver `docs/CONTENT-PLANNER.md`.

- [x] Contratos `contentPlan.ts`: ContentPlan, ContentPlanItem, pilares, ángulos, petición de
  generación (máx. 30 días), edición, rechazo, respuestas y `GeneratedContentPlanSchema` (salida
  estructurada de la IA).
- [x] Modelos `content_plans` y `content_plan_items` (`tenantScoped` por `workspaceId`).
- [x] `ContentPlanningEngine`: contexto controlado y limitado (ADN, 10 proyectos, 30 contenidos,
  40 propuestas), AIProvider con salida estructurada y validación de fundamento (datos
  inventados, plataformas, proyectos, fechas, duplicados, formatos, ángulos).
- [x] Frecuencia: la petición, el ADN o el fallback de 3 por semana.
- [x] Plan demo con reglas (solo `AI_PROVIDER=demo`), marcado como demo.
- [x] API: generate, CRUD (DELETE archiva), editar / aceptar / rechazar propuestas; conversión
  idempotente a ContentItem (`source pixel`, `idea`); regenerar crea un plan nuevo; Enterprise →
  `feature_not_available`; sin ADN → 409; IA caída → 503.
- [x] Web: "Plan de contenido" (lista, formulario, Pixel pensando con el avatar, estrategia, pilares
  y tarjetas con su porqué; Aceptar / Editar / Rechazar / Recuperar); "Propuesto por Pixel" en
  Contenido.
- [x] Tests: engine (personas distintas, proyectos como fuente, no inventar, plataformas,
  duplicados, fechas, frecuencia, errores), API (conversión, concurrencia, edición, rechazo,
  regeneración, aislamiento, `tenantScoped`, índices), contracts y web. Test con el modelo real
  (`contentPlanning.live.test.ts`, se omite sin `ANTHROPIC_API_KEY`).
- [ ] Ejecutar el test en vivo con el modelo real y ajustar el prompt según los resultados (ver «Pendiente: requiere `ANTHROPIC_API_KEY`» arriba y `docs/CONTENT-PLANNER.md §10`).
- [ ] Daily Director; uso de las propuestas rechazadas en la memoria creativa; vista de calendario.
- [ ] Content Planner Enterprise basado en BrandDNA.
- [ ] Generación en segundo plano si los planes crecen.

## Etapa D — Daily Director Personal ✅

Ver `docs/DAILY-DIRECTOR.md`.

- [x] Contratos `dailyBrief.ts` (DailyBrief, prioridades, avisos, contenido, bloques, hechos,
  generación, `DailyBriefGenerationSchema`) y `timezone.ts`; `Workspace.timezone` editable.
- [x] `DEFAULT_TIMEZONE` en la configuración (fallback documentado).
- [x] DailyDataCollector acotado, PriorityScorer determinístico documentado, ProjectHealth,
  ContentHealth y personalización por `workStyle` y `supportNeeds`.
- [x] DailyDirectorEngine:
  - referencias controladas; una inválida dispara el fallback;
  - saneamiento de reuniones, horarios, duraciones, cifras y nombres;
  - lo crítico nunca se omite;
  - fallback determinístico (`demo`, `ai_unavailable`, `invalid_output`, `no_work`).
- [x] Persistencia versionada por día, stale (`updatedAt` + huella de conteos), candado contra el
  doble clic, logs `daily_brief_generation_*` / `daily_brief_fallback_used` y metadata de
  proveedor, modelo y tokens.
- [x] API: `GET /daily-brief`, `POST /daily-brief/generate`, `GET /daily-briefs[/:id]`;
  Enterprise → `feature_not_available`.
- [x] Inicio Personal: "TU DÍA" con avatar (`thinking` → `idle`), prioridades, avisos, contenido,
  bloques, stale, actualizar, sin trabajo y propuesta de zona horaria.
- [x] Chat Personal: la dirección vigente en el contexto ("¿qué hago primero?"), sin acciones.
- [x] Tests: scorer, fechas en zona horaria, salud, personalización, alucinaciones, referencias
  inválidas, fallback, persistencia, stale, concurrencia, aislamiento, chat, contratos y web.
- [ ] Probar `DAILY_SYSTEM` con Claude real (ver «Pendiente: requiere `ANTHROPIC_API_KEY`»).
- [ ] Acciones con confirmación desde el brief o el chat; Daily Director Enterprise; calendario.

## Etapa E — Shared Operations + Enterprise Projects ✅

Ver `docs/ENTERPRISE-OPERATIONS.md`.

- [x] Capacidades por tipo derivadas en contracts (`capabilities.ts`: `workspaceSupportsFeature`,
  `workspaceCapabilities`); API (`assertWorkspaceFeature`) y web (`FeatureOnly`, navegación) las
  usan. Content Planner y Daily Director pasan por el helper (mismo 400 `feature_not_available`).
- [x] `Project.type` con `campaign`, `branding`, `product_launch`, `event`, `internal` (sin
  migración) y `PROJECT_TYPES_BY_WORKSPACE` para la UI; por defecto `general`.
- [x] Project, Task y ContentItem en Enterprise con los mismos modelos, endpoints y servicios (sin
  `companyId`, sin `campaignId`).
- [x] Tests de aislamiento entre workspaces del mismo usuario: prueba crítica Personal + TINTO +
  INVENTIA con "Lanzamiento" en los tres; vínculos cruzados de tareas y contenido → 400; Personal ↔
  Enterprise; enum; endpoints en ambos tipos; feature gating; legacy.
- [x] Resumen operacional con `activeContentItems` y `getOperationsStatus` (solo conteos, zona del
  workspace) sin IA.
- [x] Web: rutas Enterprise workspace-first (`/workspace/:id/{projects,tasks,content}`,
  `enterpriseStaysInWorkspace`), navegación Inicio · Trabajo · Marca (`enterpriseNav`), mismas
  pantallas con `operationsCopy` y tipos por workspace.
- [x] Inicio Enterprise: "Trabajo de la marca" (contadores y próximos elementos reales) + "Nuevo
  proyecto".
- [x] Chat Enterprise: estado operativo de solo conteos, sin nombres; no inventa campañas ni lista
  tareas (demo: `composeOperationsReply`).
- [x] Smoke HTTP (TINTO, INVENTIA, Personal) y docs.
- [ ] Recorrido visual en navegador (sin herramienta de navegador en esta sesión).
- [ ] Probar el estado operativo del chat Enterprise con Claude real (requiere `ANTHROPIC_API_KEY`).
- [ ] Mover las pantallas de marca a `/workspace/:workspaceId` (convergencia, `docs/WORKSPACES.md`).
- [x] Campaign Manager (Prompt 13): ver Etapa M.
- [ ] Responsables, aprobaciones, equipo y roles; Content Planner y Daily Director Enterprise.

## Etapa M — Enterprise Campaign Manager ✅

Ver `docs/CAMPAIGNS.md`.

- [x] Contratos `campaign.ts`, `campaignStrategy.ts` (incl. `GeneratedCampaignStrategySchema`) y
  `campaignDeliverable.ts`; capacidad `campaigns` (solo Enterprise); `campaignId` opcional en
  Project y ContentItem; `activeCampaigns` en el resumen.
- [x] Modelos Campaign, CampaignStrategy (versionada, única por versión) y CampaignDeliverable, con
  `tenantScoped` e índices.
- [x] CampaignStrategyEngine: contexto controlado y acotado, salida estructurada validada con Zod y
  validación de fundamento (cifras, nombres, claims de mercado, afirmaciones sobre clientes,
  restricciones visuales, paleta, canales del brief, insight → hipótesis, sin duplicar campañas);
  503 sin IA (sin respaldo); demo determinista desde el ADN.
- [x] API: CRUD (DELETE archiva), generar, estrategia por versión, regenerar, piezas (editar,
  aceptar idempotente con reserva atómica, rechazar).
- [x] Web: Campañas (lista, filtros, "Crear con Pixel" / "Nueva campaña", pensando), detalle con
  Estrategia · Piezas · Proyectos · Contenido, versiones e hipótesis; navegación Enterprise; Inicio
  con "Campañas activas"; proyecto → "Ver su campaña".
- [x] Chat Enterprise: campañas activas resumidas (máx. 3) en el estado operativo.
- [x] Tests (contracts, motor, API, web) y smoke HTTP (TINTO, INVENTIA, Personal).
- [x] Corregido de paso el test dependiente de la hora (`PIXEL_ESTADO.md` §11.2).
- [ ] Probar `CAMPAIGN_SYSTEM` con Claude real (requiere `ANTHROPIC_API_KEY`).
- [ ] Recorrido visual en navegador.
- [ ] Vincular proyectos o contenidos existentes a una campaña desde la UI.
- [ ] Creative Workflow (aprobaciones), Brand Guardian, Enterprise Content Planner y Daily Director.

## Etapa 9 — CreativeMemory básica

- [ ] `GET/POST/DELETE /memories` (bajo el workspace).
- [ ] Acción "Recordar esto" en mensajes y `MemoryPanel`.
- [ ] Inclusión de memorias activas en el contexto (ya la hacen `EnterpriseContextBuilder` y
  `PersonalContextBuilder`; falta crearlas).
- [ ] Tests de aislamiento de memorias.

**Aceptación:** una memoria fijada influye en las siguientes respuestas; al borrarla deja de usarse.

## Etapa 10 — Cierre end-to-end del MVP

- [ ] Script de seed con los 3 escenarios de demo.
- [ ] Test de integración API del recorrido completo con `MockAIProvider` (registro → chat).
- [ ] Checklist E2E manual con el proveedor real; ajuste de prompts según resultados.
- [ ] Revisión de la suite de aislamiento completa sobre todos los endpoints.
- [ ] README final: instalación, variables de entorno, ejecución, demo.

**Aceptación:** se cumplen los criterios de éxito de `MVP.md §5`.

---

## Identidad visual PIXELES ✅

- [x] Assets oficiales organizados en `apps/web/public/brand` (logo principal, isotipo y logotipo de
  letras en versión oscura, sobre azul y sobre blanco; favicons 16/32/64/128) y `public/pixi`
  (Pixi base sobre negro y sobre blanco; evolución 1–6). Son recortes de `/brand-assets` y del
  manual; nada redibujado.
- [x] Tokens únicos en `apps/web/src/styles/theme.css` integrados con Tailwind 4; paleta por defecto
  desactivada. Unbounded + Instrument Sans.
- [x] Shell, componentes compartidos y todas las pantallas migrados a tokens; sin brillos, blur,
  degradados ni iconos de IA. Pixi en login, estados vacíos y cargas. Textos: "Pixel" = producto,
  "el personaje de tu marca" = avatar de cada empresa.
- [x] Siempre arranca en oscuro; modo claro de sesión con paridad. `<Reveal>` al hacer scroll.
- [ ] Sustituir los PNG por **SVG oficiales** (logo principal, isotipo, logotipo de letras, versión
  sobre blanco, favicon de 16 px) y **Pixi con fondo transparente** cuando PIXELES los entregue.
- [ ] Decidir con producto el modelo "60 % Pixi / 40 % ADN" del manual frente al avatar 100 %
  derivado del ADN que genera hoy el Avatar Concept Engine (cambio de lógica, no visual).

---

## Experiencia de entrada pública ✅

Etapa solo de frontend, pedida antes del Prompt 13 (2026-10-09). No toca API, contratos, permisos ni
datos. Detalle en `PIXEL_ESTADO.md` §5 y §9.5.

- [x] Bienvenida en `/` (solo visitantes; con sesión va a `?next=` interno o a "Tus Pixels"):
  fondo de video con poster, capa de contraste, logo, "Explorar", "Iniciar sesión", "Crear
  cuenta", título, subtítulo y CTAs. Video siempre silenciado, en bucle e inline; botón accesible
  de pausa/reproducción; respeta `prefers-reduced-motion` (no arranca ni descarga); se pausa con
  el modal; si falla o el navegador lo bloquea queda el poster.
- [x] Explorar público (`/explore`, `/explore/personal`, `/explore/enterprise`): dos tarjetas
  grandes con las imágenes de evolución y dos secundarias con los personajes finales; texto en HTML;
  solo funcionalidades que existen.
- [x] Modal de acceso (`?auth=login|register&next=`) con `<dialog>` nativo: visual a la izquierda
  y formulario a la derecha en escritorio, formulario a pantalla completa en móvil; foco inicial,
  foco atrapado, Escape, clic fuera, botón cerrar, Atrás, devolución del foco y bloqueo del scroll.
  Reutiliza los formularios y validaciones existentes; sin proveedores sociales.
- [x] `/login` y `/register` se mantienen (rediseño con la misma columna visual) y respetan
  `?next=`. `next` solo admite rutas internas (`safeNextPath`).
- [x] Intención "Empezar con Pixel Personal/Enterprise" (`/pixels/start?intent=`): tras el acceso
  abre el Pixel que ya existe o sigue el alta existente; visitar tarjetas no crea nada.
- [x] Recursos centralizados en `apps/web/src/brand/experience.ts`; originales en
  `apps/web/public/experience/` más variantes de 960 px; carga diferida fuera del primer viewport.
- [x] Tests: `redirect.test.ts`, `pixelIntent.test.ts`, `backgroundVideo.test.tsx`. Recorrido en
  navegador (escritorio, tablet y móvil; teclado; video con clip temporal; movimiento reducido).
- [ ] **Video final:** el recibido es un teaser de otro estudio y no se incluyó. Copiar el definitivo
  a `public/experience/` y poner su ruta en `introVideo.src` (MP4 H.264; WebM opcional).
- [ ] Confirmar la asignación de imágenes (joven = Personal, zorro = Enterprise).
- [ ] "Conecta tu equipo…" (texto pedido) promete equipo: miembros y roles aún no existen.
- [ ] El avatar se trabajará después (petición del usuario, 2026-10-09).

---

## Post-MVP (no planificado, no construir sin pedirlo)

Streaming de respuestas (SSE) · extracción automática de memorias · subida de logo y análisis de
imágenes · scraping del sitio web · equipos y roles por empresa · rate limiting y endurecimiento de
seguridad · voz y lip-sync · generación avanzada de modelos 3D · campañas · facturación y planes ·
analytics.
