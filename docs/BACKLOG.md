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
| 5 | Capa de IA | ⬜ |
| 6 | Análisis de marca: BrandDNA → AvatarProfile | 🟨 (BrandDNA determinístico hecho; IA y AvatarProfile pendientes) |
| 7 | Avatar 3D | ⬜ |
| 8 | Chat con Pixel | ⬜ |
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
- React Three Fiber y Drei se instalarán en la Etapa 7 (no se usan antes).
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

## Etapa 5 — Capa de IA

- [ ] `AIProvider` (interfaz), `createAIProvider(env)`.
- [ ] `structured.ts`: `generateObject` con validación Zod + 1 reintento con errores + `AIOutputError`.
- [ ] `MockAIProvider` determinista (genera BrandDNA/AvatarProfile/respuestas plausibles según el input).
- [ ] Adaptador del proveedor real (**requiere decisión de proveedor**; ver `MVP.md §6`).
- [ ] Regla ESLint `no-restricted-imports`: SDKs de IA solo dentro de `apps/api/src/ai/`.
- [ ] Tests: reintento ante JSON inválido, error tras segundo fallo, mock cumple los schemas.

**Aceptación:** con `AI_PROVIDER=mock` y con el proveedor real se obtiene un objeto válido contra un schema de prueba.

## Etapa 6 — Análisis de marca: BrandDNA → AvatarProfile

- [ ] Prompts versionados: `brandAnalysis.prompt.ts`, `avatarDesign.prompt.ts` (este último recibe **solo** el BrandDNA y el catálogo del renderer).
- [ ] `BrandAnalysisService` y `AvatarDesignService`.
- [ ] Job en proceso disparado por `submit`; estados `analyzing → ready | failed`; protección contra doble ejecución.
- [ ] `POST /analysis/retry`, recuperación de jobs al arrancar (`ANALYSIS_TIMEOUT_MS`).
- [x] `GET /brand-dna`.
- [x] Generador determinístico de BrandDNA (`rules-1`), versionado por `sourceHash`, pantalla "Así entiende Pixel tu marca".
- [ ] `GET /avatar-profile`.
- [ ] Web: `AnalysisPage` con polling y estado de error con reintento; `BrandDnaSummary`.
- [ ] Tests: job completo con mock; fallo de IA → `failed`; aislamiento de los nuevos endpoints.

**Aceptación:** al enviar el onboarding, en segundos (mock) la empresa pasa a `ready` y se ven su ADN y su AvatarProfile en JSON/resumen.

## Etapa 7 — Avatar 3D

- [ ] `profileToScene()` (función pura) + tests.
- [ ] `PixelAvatar` con R3F/Drei: arquetipos `seed`, `crystal`, `block`, `blob` (mínimo); `drop` y `capsule` si el tiempo lo permite (si no, mapean a `blob` y se documenta).
- [ ] Rostro (ojos, boca, cejas, rubor), materiales, iluminación por `lighting.mood`.
- [ ] Animaciones idle y estados `idle | thinking | talking`.
- [ ] Carga perezosa (`React.lazy`) y fallback sin WebGL.
- [ ] Panel `AvatarRationale` ("por qué me veo así").
- [ ] Página de previsualización de los 3 fixtures de demo (solo en desarrollo).

**Aceptación:** los 3 escenarios de demo se renderizan como personajes claramente distintos y coherentes con su ADN.

## Etapa 8 — Chat con Pixel

- [ ] `POST/GET /conversations`, `GET/POST /conversations/:id/messages`.
- [ ] `ContextBuilder.build(companyId, conversationId)`: BrandDNA activo + memorias activas + últimos `CHAT_HISTORY_LIMIT` mensajes.
- [ ] `pixelChat.prompt.ts` (rol de director creativo + voz, criterio y comportamiento del ADN).
- [ ] `PixelChatService`, persistencia de `brandDnaVersion` y metadatos `ai`.
- [ ] Web: `ChatPage` con avatar (`thinking` al enviar, `talking` al recibir), lista de conversaciones.
- [ ] Tests: el contexto **solo** contiene datos de la empresa; conversación de otra empresa → 404; dos empresas producen system prompts distintos.

**Aceptación:** el usuario conversa con su Pixel y las respuestas reflejan la voz del BrandDNA.

## Etapa 9 — CreativeMemory básica

- [ ] `GET/POST/DELETE /memories`.
- [ ] Acción "Recordar esto" en mensajes y `MemoryPanel`.
- [ ] Inclusión de memorias activas en el contexto (ya preparado en Etapa 8).
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

## Post-MVP (no planificado, no construir sin pedirlo)

Streaming de respuestas (SSE) · extracción automática de memorias · subida de logo y análisis de
imágenes · scraping del sitio web · equipos y roles por empresa · rate limiting y endurecimiento de
seguridad · voz y lip-sync · generación avanzada de modelos 3D · campañas · facturación y planes ·
analytics.
