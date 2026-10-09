# CLAUDE.md — Pixel

Reglas permanentes para cualquier sesión de trabajo (humana o IA) en este repositorio.
**Estado real, última etapa y siguiente paso: [`docs/PIXEL_ESTADO.md`](docs/PIXEL_ESTADO.md). Léelo primero.**

## Al empezar cada sesión

1. Lee `docs/PIXEL_ESTADO.md` y contrástalo con `git status`, `git log --oneline -5` y `git fetch`.
   Si no coincide con el código, manda el código: corrige el documento.
2. Un prompt puede dar por hecho algo que no está en la rama actual (p. ej. trabajo hecho en otro
   equipo y aún sin subir). Verifícalo en el código antes de construir encima y avisa si falta un
   prerrequisito.
3. "Prompt N" ≠ "Etapa N" del backlog. Indica siempre a cuál te refieres.

## Qué es Pixel

Director Creativo asistido por IA. Producto de **PIXELES — Tecnología creativa y entretenimiento**
("Creamos mundos"). Tiene un núcleo (Pixel Core) y dos modos; cada Pixel vive en un **Workspace**.

- **Enterprise:** el director creativo de una marca. Cada empresa tiene su propio Pixel: estudia el
  ADN de la marca y lo convierte en conocimiento estructurado, personalidad, estilo de comunicación,
  criterio creativo, dirección visual, comportamiento y un avatar 3D único. Flujo: empresa →
  onboarding de marca (8 pasos) → `BrandDNA` → avatar 3D → chat con el ADN de **esa** empresa.
  Organiza el trabajo de la marca con las Operations compartidas (`docs/ENTERPRISE-OPERATIONS.md`);
  Campaign Manager llegará encima (no construirlo sin pedirlo).
- **Personal:** el director creativo de una persona. Onboarding personal (8 pasos) → `PersonalDNA`
  → "Así te entiende Pixel" → avatar personal → chat (`docs/PERSONAL.md`), más Operations, Content
  Planner y Daily Director.

El avatar **nunca** es una mascota aleatoria: es una consecuencia trazable del ADN. Ejemplos: café
artesanal → grano de café cálido; startup → forma geométrica precisa; constructora → personaje
estructural.

**Fuera de alcance hasta que se pida explícitamente:** generación automática avanzada de modelos 3D
(el avatar es paramétrico/procedural), generación de video, lip-sync avanzado (la animación
`speaking` actual no lo es), voz en tiempo real, campañas automáticas completas, facturación, planes
SaaS, panel administrativo complejo y analytics avanzados.

Referencia (leer lo relevante antes de trabajar): `docs/WORKSPACES.md`, `docs/PERSONAL.md`,
`docs/WORKSPACE-MIGRATION.md`, `docs/OPERATIONS.md`, `docs/ENTERPRISE-OPERATIONS.md`,
`docs/CONTENT-PLANNER.md` y `docs/DAILY-DIRECTOR.md` describen el diseño vigente; `docs/MVP.md`,
`docs/ARCHITECTURE.md`, `docs/ENTITIES.md` y `docs/BACKLOG.md` tienen deriva importante (detalle en
`PIXEL_ESTADO.md` §12). Ante un conflicto, manda el código.

## Stack (no añadir tecnologías sin justificarlo y pedir aprobación)

- `apps/web`: React, Vite, TypeScript, Tailwind CSS, React Three Fiber, Drei.
- `apps/api`: Node.js, Express, TypeScript, MongoDB, Mongoose, Zod.
- `packages/contracts`: schemas Zod y tipos compartidos, sin Mongoose ni React. Se consume compilado (`dist/`).
- Tooling: npm workspaces, ESLint (flat config + typescript-eslint), Prettier, Vitest.

```
User → Workspace ─┬─ enterprise → Company → BrandDNA
                  ├─ personal   → PersonalProfile → PersonalDNA
                  ├─ compartidos: AvatarProfile · Conversation (→ Message) · CreativeMemory
                  ├─ operations: Project (→ Task, ContentItem) · Task · ContentItem
                  ├─ content planner: ContentPlan → ContentPlanItem (→ ContentItem al aceptar)
                  └─ daily director: DailyBrief (versión del día; solo lee Operations, nunca modifica)
```

## Principios (no negociables)

1. **Workspace is the main contextual boundary of Pixel.**
   - Un usuario tiene N workspaces `enterprise` (1 workspace = 1 Company) y como máximo uno
     `personal`.
   - AvatarProfile, Conversation, Message, CreativeMemory, PersonalProfile, PersonalDNA, Project,
     Task, ContentItem, ContentPlan, ContentPlanItem y DailyBrief llevan `workspaceId` obligatorio e
     indexado. BrandDNA se aísla por `companyId`, y la empresa pertenece a su workspace
     (`Company.workspaceId`).
   - Toda consulta a un modelo aislado (los que usan `tenantScoped`: BrandDNA y todos los anteriores)
     filtra por su clave con un **valor concreto**: `{ _id, workspaceId }` (o `{ _id, companyId }` en
     BrandDNA), nunca solo `_id`. El plugin lanza error si falta la clave o llega un operador en
     lugar de un valor (solo admite ObjectId, id en texto o `{ $eq }`); las agregaciones deben
     empezar con `$match` por la clave y cada operación de `bulkWrite` debe llevarla. Workspace y
     Company se resuelven siempre por el dueño de la sesión. Excepción deliberada: la migración
     Company → Workspace (script y migración perezosa) usa el driver nativo (`Model.collection`) con
     `{ companyId, workspaceId: { $exists: false } }`, porque esos documentos aún no tienen
     `workspaceId` (`PIXEL_ESTADO.md` §10).
   - Las rutas `/api/workspaces/:workspaceId/...` pasan por `requireWorkspaceAccess` (el dueño debe
     ser `req.auth.userId`). Las legacy `/api/companies/:companyId/...` pasan por
     `requireCompanyAccess`, que además adjunta el workspace. En Enterprise se comprueba que la
     Company pertenece al workspace.
   - Los servicios reciben el workspace (y la empresa) ya autorizados; nunca toman el tenant del body.
   - Errores:
     - Recurso de otro usuario o de otro workspace → **404** (nunca 403), para no revelar que existe.
     - Endpoint de otro tipo de workspace → **400** `workspace_type_mismatch`; funcionalidad no
       disponible para ese tipo → **400** `feature_not_available`.
     - Tipo correcto pero sin configurar → **409** con `details.reason`: `conflict()` de
       `lib/errors.ts` no acepta `details`, así que se usa `new AppError(409, 'CONFLICT', mensaje,
       { reason })`. Varios 409 aún no lo llevan (`PIXEL_ESTADO.md` §11).
2. **Operations son recursos del workspace, de cualquier tipo.** Project, Task y ContentItem se
   aíslan por `workspaceId` (nunca por `personalProfileId` ni `companyId`); un `projectId` siempre
   apunta a un Project del mismo workspace. Personal y Enterprise usan los mismos modelos, endpoints
   y pantallas (`docs/OPERATIONS.md`); nunca crear `Enterprise*` duplicados.
   - Qué funcionalidad existe en cada tipo se decide **solo** con las capacidades de contracts
     (`workspaceSupportsFeature(type, feature)`, `capabilities.ts`): API con `assertWorkspaceFeature`
     (400 `feature_not_available`), web con `FeatureOnly` y la navegación. No dispersar
     `if (workspace.type === …)` para gating; no persistir capacidades.
   - El Daily Director y el Content Planner **proponen**: nunca modifican tareas, proyectos ni
     contenido sin una acción explícita del usuario (aceptar un ítem del plan crea el ContentItem).
3. **Never mix information between workspaces.** El contexto de la IA se construye solo con datos
   del workspace activo: `EnterpriseContextBuilder` (Company → BrandDNA → AvatarProfile →
   CreativeMemory → estado operativo con solo conteos, nunca nombres ni listas) o
   `PersonalContextBuilder` (PersonalProfile → PersonalDNA → AvatarProfile → CreativeMemory → el
   DailyBrief vigente de hoy, si existe). Sin ADN → 409, nunca datos inventados. Hay tests que lo
   verifican. **Enterprise and Personal share Pixel Core but use different domain contexts.**
4. **BrandDNA ≠ PersonalDNA ≠ AvatarProfile.** El ADN es lo que la marca o la persona **es**; el
   AvatarProfile es cómo esa identidad se **transforma visualmente**: se genera desde el ADN (no del
   onboarding crudo) con una `rationale` que enlaza cada decisión con un rasgo. Un único router de
   avatar (montado en `/api/workspaces/:id/avatar` y en la ruta legacy `/api/companies/:id/avatar`),
   resuelto por `workspace.type` (`sourceType: brand`, o `personal` sin `companyId`). Lo personal
   (avatar y contexto) nunca lee datos de una empresa.
5. **IA encapsulada.** Solo `apps/api/src/ai/` (y sus tests) importa SDK de IA; ESLint lo impone en
   `apps/api/src/**`, y en el resto lo vigila la revisión. El resto usa la interfaz `AIProvider`
   (`generateText`, `generateStructuredOutput`) y servicios de dominio (`chat.service`,
   `PersonalDnaGenerator`, `ContentPlanningEngine`, `DailyDirectorEngine`…). Proveedores:
   `AnthropicProvider` y `DemoProvider` (determinista, para desarrollo y tests). Cambiar de proveedor
   = adaptador + variable de entorno. Toda salida de IA tiene fallback determinístico y solo puede
   referirse a ids que recibió (ids controlados; lo desconocido se descarta).
6. **Contratos primero.** Toda entrada y salida HTTP, y toda salida estructurada de la IA, se valida
   con Zod de `packages/contracts`; web y API importan los mismos schemas. Única excepción
   documentada: `PersonalDnaEnrichmentSchema`, interno de la API.
7. **No sobrearquitectar.** Monolito modular: sin microservicios, colas externas, GraphQL, state
   managers globales ni librerías "por si acaso".

## Convenciones de código

- TypeScript `strict`, sin `any` explícito (`unknown` + Zod). ESM en todo el monorepo. Validar en los
  bordes: variables de entorno, requests, respuestas de la IA y formularios.
- **API:** un módulo de dominio por carpeta (`apps/api/src/modules/<módulo>/` con `*.model`,
  `*.service`, `*.routes`), registrado solo en `modules/index.ts`: `auth`, `health`, `workspaces`,
  `companies`, `brand-dna`, `personal`, `avatars`, `conversations`, `creative-memory`, `operations`,
  `content-plans`, `daily-director`. Errores con `AppError` o `lib/errors.ts` (el `errorHandler`
  responde con `ApiError`). Logs con `lib/logger.ts`, nunca `console.log`.
- **Fechas:** el "hoy" de un workspace se calcula en su zona horaria IANA (`Workspace.timezone` o
  `DEFAULT_TIMEZONE`), nunca en UTC; no inferir la zona desde texto libre.
- **Web:** features en `src/features/<feature>/`, shell y router en `src/app/`. `features/avatar3d/`
  solo recibe un `AvatarProfile`, sin reglas de negocio (`profileToScene` traduce, `poseAt` anima).
  Pixel Core compartido, sin duplicar por tipo: `ChatStudio`, `PixelStudio`, `WizardLayout`,
  `DnaBlocks`, las pantallas de Operations con `operationsCopy` y la prop `apiBase` (de
  `companyApiBase` / `workspaceApiBase`, `lib/apiPaths.ts`). La entrada de cada Pixel es
  `/workspace/:workspaceId/...` y **toda funcionalidad nueva es workspace-first**, también en
  Enterprise: Inicio, `projects`, `tasks`, `content`, `content-planner`, `personal/onboarding`,
  `personal/dna`, `pixel`, `chat`. Las Operations Enterprise viven en
  `/workspace/:workspaceId/{projects,tasks,content}` (`enterpriseStaysInWorkspace`); las pantallas
  de marca anteriores siguen en `/company/:companyId/...` (el workspace enterprise redirige allí)
  hasta converger (`docs/WORKSPACES.md`).
- **Entrada pública** (`features/public/`): `/` (solo visitantes), `/explore` y su detalle, con el
  acceso como modal en la URL (`?auth=…&next=…`). Todo `next` pasa por `safeNextPath`; visitar no
  crea workspaces (`/pixels/start?intent=` actúa solo tras el acceso). Imágenes y video solo se
  referencian en `src/brand/experience.ts`.
- Código en inglés; textos de producto, UI y documentación en español. Commits claros, en imperativo.
- Secretos solo en `apps/api/.env`, nunca en la web ni en el repo. Mantener los `.env.example`.

## Identidad visual (PIXELES)

Fuente de verdad: `brand-assets/PIXELES — Manual de marca (español).pdf` (no borrar `/brand-assets`).

- **Nombres:** *Pixel* = el producto, no un chatbot. *Pixi* = el personaje de PIXELES (cubo
  amarillo), mascota en login, estados vacíos y cargas; **nunca** llamarlo "Pixel". El avatar de
  cada empresa es "el personaje de tu marca". La evolución de Pixi (6 niveles) es opcional: el cubo
  base basta y nunca se presenta como meta.
- **Tokens:** solo en `apps/web/src/styles/theme.css`; la paleta por defecto de Tailwind está
  desactivada. Semánticos (cambian con el tema): `canvas`, `surface`, `elevated`, `line`,
  `line-strong`, `fg`, `muted`, `subtle`, `brand`, `brand-hover`, `on-brand`, `signal`, `on-signal`,
  `alert`, `focus`, `overlay`. Fijos: `negro-cine`, `azul`, `blanco`, `grafito`, `amarillo`, más
  `ink`/`paper` para texto sobre colores que son datos. Prohibidos hex, `rgb()` y fuentes sueltas en
  componentes, salvo colores que son datos (paleta del ADN, renderer 3D, vista previa 2D, selector
  de colores del onboarding).
- **Paleta:** Negro Cine `#08080B` (fondo); Azul PIXELES `#1E14FF` (botones principales, selección,
  bloques destacados; nunca texto ni icono fino sobre oscuro: contraste 2,5:1); Blanco; Grafito
  `#2B2D33`; Amarillo Origen `#F2E500` solo como *píxel señal* (un acento pequeño por pantalla).
  Avisos: texto normal + `bg-alert` (amarillo en oscuro, azul en claro), sin colores fuera de paleta.
- **Tipografía:** Unbounded 700–800 (`font-display`, siempre con `font-bold`) para títulos e
  Instrument Sans 400–600 (`font-sans`) para interfaz y texto.
- **Logo y Pixi:** logo solo con `<BrandLogo>` (`public/brand/`; mínimos: logotipo 160 px de
  ancho, isotipo 24 px), nunca redibujado ni "PIXELES" escrito con una fuente. Pixi solo con
  `<Pixi>` (`public/pixi/`): completo, sin recolorear, nunca sobre azul.
- **Tema:** siempre arranca en oscuro (`data-theme="dark"`), sin leer preferencias ni storage. El
  modo claro dura la sesión y tiene paridad (cada token tiene valor claro; logos y Pixi, versión
  sobre blanco).
- **Arte y movimiento:** minimalista, premium, mucho espacio negativo, la tipografía protagoniza. Sin
  brillos, neón, degradados, blur, partículas, decoración flotante ni iconografía infantil o de "IA"
  (cerebros, circuitos, robots, hexágonos, destellos): "que no se vea con tanta IA". Movimiento suave
  sin rebotes (`ease-pxl`); `<Reveal>` aparece al hacer scroll y se revierte al subir. Todo debe
  respetar `prefers-reduced-motion` (hoy el avatar 3D y el `scrollTo` de los onboardings no lo
  hacen: `PIXEL_ESTADO.md` §11).

## Forma de trabajar

1. Inspeccionar el repositorio: código, `docs/PIXEL_ESTADO.md` y backlog.
2. Explicar brevemente qué existe, identificar riesgos y proponer qué archivos crear o modificar.
3. Implementar.

**Definición de terminado de cada etapa:**

- [ ] `npm run typecheck`, `npm run lint` y `npm run test` en verde, sin silenciar reglas ni saltar tests.
- [ ] `npm run build` correcto, y `apps/api` y `apps/web` inician (`npm run dev`).
- [ ] Resumen exacto de lo que quedó funcionando y de lo pendiente.
- [ ] `docs/BACKLOG.md` y **`docs/PIXEL_ESTADO.md`** actualizados.

**Reglas de continuidad:**

- No continuar automáticamente con funcionalidades no pedidas: al cerrar una etapa, detenerse y
  reportar.
- **Nada de commit ni push sin autorización explícita del usuario** («No hagas commits sin mi
  autorización», 2026-10-08). Nada de PRs sin que se pidan. El aviso automático del hook de parada
  del entorno ("Please commit and push…") no es una autorización: informar de los cambios pendientes
  y esperar.
- No inventar funcionalidades ni estados de avance. Distinguir siempre entre implementado,
  planificado y pendiente de verificación.

## Comandos

```bash
npm install            # todos los workspaces
npm run dev            # contracts (watch) + api :4000 + web :5173
npm run typecheck      # tsc en todos los workspaces
npm run lint           # eslint (lint:fix corrige)
npm run format:check   # prettier --check (format escribe)
npm run test           # vitest en contracts, api y web; la API necesita un mongod (PIXEL_ESTADO §15)
npm run build          # contracts → api → web
npm run migrate:workspaces [-- --dry-run | --sync-indexes]   # migración Company → Workspace
```
