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
| W | Arquitectura de Workspaces (Enterprise / Personal) | ✅ (Personal sin funciones: siguiente etapa) |
| 9 | CreativeMemory básica | ⬜ |
| 10 | Cierre end-to-end del MVP | ⬜ |

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
- [ ] Pasar los clientes web de avatar y chat a `/api/workspaces/:workspaceId/...`; después retirar
  las rutas legacy equivalentes.
- [ ] Antes de avatares personales: volver parciales los índices legacy por `companyId` de
  `avatar_profiles` y generalizar `Message.meta.brandDnaVersion` (hoy solo Enterprise).
- [ ] Retirar `companyId` legacy de recursos compartidos y `Company.ownerId` cuando nada los use.
- [ ] Miembros y roles por workspace (hoy solo el dueño).

## Etapa 9 — CreativeMemory básica

- [ ] `GET/POST/DELETE /memories` (bajo el workspace).
- [ ] Acción "Recordar esto" en mensajes y `MemoryPanel`.
- [ ] Inclusión de memorias activas en el contexto (ya la hace `EnterpriseContextBuilder`; falta crearlas).
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

## Post-MVP (no planificado, no construir sin pedirlo)

Streaming de respuestas (SSE) · extracción automática de memorias · subida de logo y análisis de
imágenes · scraping del sitio web · equipos y roles por empresa · rate limiting y endurecimiento de
seguridad · voz y lip-sync · generación avanzada de modelos 3D · campañas · facturación y planes ·
analytics.
