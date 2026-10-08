# Content Planner — planificación de contenido con Pixel

Primera capa de planificación inteligente de Pixel Personal (Prompt 10). Pixel lee el
**PersonalDNA**, los **proyectos activos** y el **contenido reciente** de la persona y propone una
**estrategia** para un periodo (hasta 30 días) con **propuestas justificadas**. Nada pasa a
producción hasta que la persona acepta cada propuesta.

```
PersonalDNA ─┐
Projects ────┼─► ContentPlanningEngine ─► ContentPlan (estrategia, pilares)
Contenido ───┘        (AIProvider +            └─ ContentPlanItem × N  (propuestas)
reciente              validación)                     │ aceptar (explícito, idempotente)
                                                      ▼
                                                 ContentItem (source pixel, status idea)
```

No es un generador de calendarios: cada propuesta nace de la identidad, los objetivos, la
audiencia definida, el tono, el estilo, los temas y los proyectos reales de la persona, y explica
**por qué Pixel la recomienda**.

Código: `apps/api/src/modules/content-plans/`, `apps/api/src/ai/contentPlanningPayload.ts`,
`apps/api/src/ai/providers/demoContentPlan.ts`, `packages/contracts/src/contentPlan.ts`,
`apps/web/src/features/content-planner/`.

## 1. Entidades

Ambas son recursos del **workspace** (`workspaceId` obligatorio, `tenantScoped`), reutilizables en
Enterprise. Hoy solo un workspace personal puede **generarlas** con Pixel.

### ContentPlan (`content_plans`)

| Campo | Notas |
|---|---|
| `workspaceId` | Frontera de aislamiento |
| `name` | Por defecto "Octubre · Semana 2" (≤ 7 días) u "Octubre · 12–25" |
| `objective` | Objetivo pedido (opcional) |
| `period.startDate`, `period.endDate` | Días locales `YYYY-MM-DD`, ambos incluidos, máx. 30 días |
| `strategySummary` | La estrategia, en 2–4 frases |
| `pillars` | `[{ name, rationale }]`: pilares de contenido **derivados de la persona** (no una lista fija) |
| `targetAudience` | Audiencia principal y secundarias del ADN |
| `platforms` | Plataformas usadas en las propuestas |
| `status` | `draft` · `active` · `completed` · `archived` |
| `generatedBy` | `pixel` · `manual` |
| `personalDnaVersion` | Versión del ADN con la que se generó |
| `generation` | `provider`, `model`, `mode` (`ai`/`demo`), `discardedItems`, `frequencyPerWeek`, `frequencySource` (`request`/`personal_dna`/`default`), `requestedGoal`, `regeneratedFromPlanId` |

En las respuestas se añade `itemCounts` (`proposed`, `accepted`, `rejected`, `converted`), que se
calcula con una sola agregación por página.

### ContentPlanItem (`content_plan_items`)

Una **propuesta estratégica**, no una pieza en producción.

| Campo | Notas |
|---|---|
| `workspaceId`, `contentPlanId` | Toda consulta filtra por los dos |
| `projectId` | Proyecto real del workspace en el que se basa (o null) |
| `title`, `concept`, `hook`, `suggestedAngle` | La idea |
| `rationale` | **Por qué Pixel lo recomienda** |
| `objective`, `audience`, `pillar` | A qué objetivo, a quién y a qué pilar sirve |
| `angle` | `education` · `opinion` · `process` · `case` · `behind_the_scenes` · `reflection` · `portfolio` · `comparison` · `storytelling` |
| `platform`, `format` | Enums de ContentItem (conversión directa) |
| `scheduledFor` | Fecha sugerida: mediodía local del día, en UTC (convención de Operations) |
| `status` | `proposed` · `accepted` · `rejected` · `converted` (UI: Propuesto · Aceptado · Rechazado · Convertido) |
| `rejectionReason` | Motivo opcional al rechazar (para la memoria creativa futura) |
| `convertedContentItemId` | El ContentItem creado al aceptar |
| `position` | Orden dentro del plan |

`accepted` queda reservado para una aceptación sin conversión. Hoy aceptar **convierte**, así que
el estado pasa directamente a `converted`.

Índices: `content_plans { workspaceId, status, createdAt: -1 }` y
`content_plan_items { workspaceId, contentPlanId, position }`. No hay índices sueltos por
`workspaceId`.

## 2. ContentPlanningEngine

`createContentPlanningEngine({ ai, logger }).plan(input)` es un servicio sin persistencia. El
servicio `contentPlans.service.ts` carga los datos, lo llama y guarda el resultado.

### Entrada (`ContentPlanningInput`)

DTOs de contracts (nunca documentos Mongo): `personalDna` (contenido), `activeProjects`,
`recentContent`, `previousProposals` (`{ title, status }`), `requestedPeriod`, `desiredFrequency?`,
`requestedPlatforms?`, `requestedGoal?` y `tzOffset`.

**Límites de contexto** (`PLANNING_CONTEXT_LIMITS`):

| Fuente | Límite |
|---|---|
| Proyectos `active`/`planned` | 10 más recientes (los archivados y completados no se envían) |
| ContentItems | 30 más recientes |
| Propuestas anteriores | Las del plan que se regenera + las 40 más recientes |

### Pasos

1. **Petición normalizada** (`resolvePlanningRequest`):
   - **Plataformas**: las pedidas o, si no hay, las del ADN mapeadas a enum
     (`Instagram → instagram`, `Twitch → other`…). Si no hay ninguna → 400 `content_platforms_missing`.
     Nunca se asume una plataforma (no se añade TikTok si la persona no lo usa).
   - **Formatos preferidos**: `contentIdentity.preferredFormats` mapeados (`reels → reel`,
     `carruseles → carousel`, `stories → story`…).
   - **Frecuencia** (piezas por semana): la pedida, si no la del ADN (`frequencyFromText`:
     "3 publicaciones por semana", "dos a la semana", "diario", "8 al mes") y, como **fallback
     documentado**, `CONTENT_PLAN_DEFAULT_FREQUENCY = 3`.
   - **Número de piezas**: `round(frecuencia × días / 7)`, entre 1 y 30.
2. **Contexto controlado** (`PlanningPayload`, dentro de `<planning_input>`): persona (identidad,
   perfil profesional, objetivos, audiencia, personalidad, comunicación, identidad creativa,
   contenido, ayuda que espera, preferencias y restricciones), proyectos, contenido reciente,
   propuestas anteriores y la petición (días, número de piezas, plataformas y formatos).
3. **IA**: `AIProvider.generateStructuredOutput` con `GeneratedContentPlanSchema` (Zod) y un system
   prompt de director creativo (`PLANNING_SYSTEM`). El engine no conoce ningún SDK.
4. **Validación contra la realidad** (`groundGeneratedPlan`). Lo que no pasa se **descarta** (y se
   cuenta en `generation.discardedItems`); nunca se "arregla" inventando:
   - **Datos no fundamentados** (`contentPlanning.grounding.ts`). La pieza se descarta entera si
     afirma cosas que la persona no dio:
     - cifras y métricas: "50.000 seguidores", "10 años", "3 millones de fans", porcentajes;
     - nombres propios ausentes del contexto: "tu cliente Nike";
     - suposiciones sobre la audiencia: "tu audiencia prefiere…".

     En la estrategia se quitan solo las frases afectadas. Plataformas, formatos, meses y "Pixel"
     están permitidos.
   - **Plataforma** fuera de las permitidas → descartada.
   - **Duplicados**: un título igual o casi igual (Jaccard ≥ 0,6) a contenido reciente, a
     propuestas anteriores o a otra pieza del plan, o un hook repetido del historial → descartada.
     No se busca originalidad absoluta.
   - **Proyecto**: el `projectId` solo se conserva si es uno de los proyectos enviados.
   - **Fecha**: si no es un día del periodo, la pieza se reparte uniformemente dentro de él.
   - **Formatos**: con preferencias, como máximo un tercio de las piezas usa un formato alternativo.
   - **Ángulos**: en planes de 4 o más piezas, ningún ángulo ocupa más de la mitad.
   - **Pilar** desconocido → `null`. Si no queda estrategia o no queda ninguna propuesta → error
     `failed`.

### Errores

| Caso | HTTP | `details.reason` |
|---|---|---|
| Sin PersonalDNA | 409 | `personal_context_not_configured` |
| Workspace Enterprise | 400 | `feature_not_available` |
| Sin plataformas (ni ADN ni petición) | 400 | `content_platforms_missing` |
| Proveedor caído, sin red o mal configurado | 503 | `content_plan_generation_unavailable` |
| Salida inválida, rechazada o sin nada fundamentado | 502 | `content_plan_generation_failed` |

En ningún error se crea un plan de relleno.

### Modo demo

Sin `ANTHROPIC_API_KEY` (`AI_PROVIDER=demo`, desarrollo y tests), el `DemoProvider` compone el plan
**con reglas** a partir del mismo `PlanningPayload` (`demoContentPlan.ts`):
- **Fuentes**: primero proyectos, después temas, habilidades y necesidades de la audiencia.
- Ángulos variados, solo palabras del contexto y sin cifras.
- Salta los títulos ya usados.

Pasa por la misma validación. El plan queda con `generation.mode = 'demo'` y la interfaz lo indica.
Fuera de este caso, el demo sigue rechazando salidas estructuradas.

## 3. Conversión PlanItem → ContentItem

`POST …/items/:itemId/accept` es explícito e **idempotente**:
1. **Reserva atómica**: `findOneAndUpdate({ …, convertedContentItemId: null }, { convertedContentItemId: nuevoId, status: 'converted' })`. Solo una llamada gana, también si llegan a la vez.
2. Crea el ContentItem con ese id (`createContentItem(…, { source: 'pixel', id })`):
   - Se copian `title`, `concept`, `objective`, `hook`, `platform`, `format`, `projectId` y
     `scheduledFor`.
   - Queda con `status: 'idea'` (planificar ≠ producir) y el pilar como etiqueta.
   - En `notes` va el plan, el "Por qué" y el ángulo.
3. Si la creación falla, la reserva se deshace.

Respuestas: 201 `{ item, contentItem, created: true }` la primera vez; 200 `created: false` con el
ContentItem existente después (o `contentItem: null` si el usuario ya lo borró: no se recrea).

- Una propuesta convertida ya no se edita ni se rechaza desde el plan (409
  `content_plan_item_converted`): se edita en Contenido.
- Rechazar no borra la propuesta (`status: rejected` + motivo opcional);
  `PATCH { status: 'proposed' }` la recupera. Una rechazada también se puede aceptar después.

## 4. Proyectos: solo lectura

El planner lee los proyectos `active`/`planned` del workspace para convertir trabajo real en
contenido. **No** cambia fechas ni estados, no completa proyectos y no crea tareas (cubierto por
tests). Sin proyectos, el plan parte del ADN; nunca inventa proyectos.

## 5. Endpoints

Todos bajo `requireAuth` + `requireWorkspaceAccess` (workspace ajeno → 404). Un plan o una
propuesta ajenos, inexistentes o malformados → **404**. Las propuestas se buscan siempre con su
`contentPlanId`.

| Método | Ruta | |
|---|---|---|
| POST | `/api/workspaces/:id/content-plans/generate` | 201 `{ plan, items }` |
| POST | `/api/workspaces/:id/content-plans` | Plan manual vacío (201) |
| GET | `/api/workspaces/:id/content-plans` | `{ plans, total }` (sin archivados salvo `status=archived`) |
| GET | `/api/workspaces/:id/content-plans/:planId` | `{ plan, items }` |
| PATCH | `/api/workspaces/:id/content-plans/:planId` | `name`, `objective`, `status` |
| DELETE | `/api/workspaces/:id/content-plans/:planId` | **Archiva** (conserva propuestas) |
| PATCH | `…/:planId/items/:itemId` | `title`, `concept`, `hook`, `platform`, `format`, `scheduledFor`, `status: 'proposed'` |
| POST | `…/:planId/items/:itemId/accept` | Convierte (201 / 200 idempotente) |
| POST | `…/:planId/items/:itemId/reject` | `{ reason? }` |

Cuerpo de `generate` (`strict`; solo las fechas son obligatorias):

```json
{ "startDate": "2026-10-12", "endDate": "2026-10-25", "frequency": 3,
  "platforms": ["instagram"], "goal": "posicionamiento", "tzOffset": 300,
  "regenerateFrom": "<planId opcional>" }
```

**Regenerar** = `generate` con `regenerateFrom`. Crea un plan **nuevo**: el anterior no se
sobrescribe y sus propuestas pasan al contexto para no repetirlas.

## 6. Aislamiento (cubierto por tests)

- `tenantScoped` en ContentPlan y ContentPlanItem: rechaza consultas, updates y agregaciones sin un
  `workspaceId` concreto, también con operadores.
- El usuario B recibe 404 al leer, editar, archivar, aceptar, rechazar o convertir cualquier cosa de
  A, tanto desde el workspace de A como desde el suyo. Nada de A cambia.
- El engine solo recibe datos del workspace activo: los proyectos de otro workspace del mismo dueño
  (p. ej. su empresa) no entran.

## 7. Interfaz (Pixel Personal)

Navegación: **Trabajo → Plan de contenido** (`/workspace/:id/content-planner`).

- **Pantalla principal**: planes existentes (nombre, estado, periodo, conteos, "Modo demo") y
  **Crear plan con Pixel**.
- **Formulario**:
  - Inicio (por defecto el próximo lunes) y periodo de 7 días, 2 semanas o 30 días.
  - Objetivo, frecuencia ("Según mi ADN" o 1–7 por semana) y plataformas (sin elegir: las del ADN).
  - Texto: "Pixel utilizará tu ADN personal y tus proyectos activos para construir el plan."
- **Generando**: el personaje del usuario en estado `thinking` y "Pixel está construyendo tu
  estrategia…". Sin barras de progreso.
- **Plan** (`/workspace/:id/content-planner/:planId`):
  - En orden: **Estrategia**, **Pilares** y **Propuestas**.
  - Cada tarjeta muestra título, formato · plataforma, fecha sugerida, hook, objetivo, pilar,
    ángulo, proyecto y **"Por qué Pixel lo recomienda"**, con las acciones **Aceptar · Editar ·
    Rechazar** (o Recuperar).
  - Una propuesta convertida muestra "Añadido a Contenido" y sigue en el plan.
  - Acciones del plan: Activar / Marcar completado, Regenerar y Archivar.
- **Contenido**: las piezas aceptadas aparecen como Idea con la marca "Propuesto por Pixel".
- Todo son tarjetas verticales (también en móvil), sin tablas.

## 8. Límites

- Periodo de 30 días como máximo, 30 piezas como máximo y 14 por semana como máximo.
- La detección de datos inventados es heurística (cifras, nombres propios a mitad de frase y
  frases sobre la audiencia):
  - no detecta un nombre propio al **inicio** de frase;
  - descarta piezas válidas que nombran una herramienta que no está en el ADN (p. ej. "Lightroom").

  Es estricta a propósito.
- Sin calendario, sin publicación ni programación real, sin métricas externas.
- El plan no entra en el contexto del chat (Daily Director lo integrará).
- Enterprise: los modelos y el CRUD son reutilizables, pero la generación con BrandDNA no existe
  todavía (`feature_not_available`).
- La generación es síncrona (una petición, hasta el timeout del proveedor).

## 9. Próximos pasos

Daily Director (planificación diaria con tareas y contenido), uso de las propuestas rechazadas y de
sus motivos en la memoria creativa, vista de calendario sobre `scheduledFor`, Content Planner
Enterprise basado en BrandDNA y generación en segundo plano para periodos largos.

## 10. Pendiente: validación con el modelo real ⏳

**Estado:** sin ejecutar. Hasta ahora todo el Content Planner se ha validado con el proveedor demo
(reglas a partir del ADN). El prompt `PLANNING_SYSTEM` y la validación de fundamento **no se han
probado con Claude real**, porque `ANTHROPIC_API_KEY` todavía no está configurada (decisión del
8 de octubre de 2026).

### Cómo ejecutarla

```powershell
# PowerShell, desde la raíz del repo. Cuesta dinero y necesita red.
$env:ANTHROPIC_API_KEY = '<clave>'
npm run build -w @pixel/contracts
npm run test -w @pixel/api -- contentPlanning.live
```

`apps/api/test/contentPlanning.live.test.ts` genera un plan de 2 semanas en Instagram para la
persona "director creativo" (§54 del Prompt 10) con un proyecto activo. Guarda el resultado
**antes** de las aserciones en `%TEMP%\pixel-content-plan-live.json`, de modo que se puede revisar
aunque la prueba falle.

### Qué comprobar

| Aspecto | Qué mirar en el JSON | Aserción automática |
|---|---|---|
| Fundamento | Que `discardedItems` sea bajo. Si es alto, ver qué descartó la validación (falsos positivos) | — |
| Cantidad | `items.length` cerca de lo pedido (6) | ≥ 3 |
| Plataformas | Todas `instagram` | Sí |
| Formatos preferidos | Reel, carrusel o story en al menos 2/3 | Sí |
| Proyecto real | Alguna propuesta con el `projectId` del proyecto | Sí |
| Porqué | `rationale` concreto, ligado a un objetivo, a la audiencia o al proyecto | Longitud > 30 |
| Variedad | Varios `angle` distintos y nada de "5 consejos para…" | ≥ 2 ángulos |
| No genérico | Que la estrategia y los títulos suenen a esta persona (revisión humana) | — |
| Honestidad | Sin cifras, seguidores, clientes ni experiencias inventadas | Por la validación |

### Qué ajustar según el resultado

- **`PLANNING_SYSTEM`** (`apps/api/src/modules/content-plans/contentPlanning.engine.ts`): si las
  propuestas son genéricas, no usan el proyecto, repiten ángulos o no cumplen el número de piezas.
- **Validación** (`contentPlanning.grounding.ts`): si descarta piezas válidas. Hay que ampliar
  `ALLOWED_PROPER` (p. ej. herramientas que el modelo menciona con razón) o afinar
  `METRIC_AFTER_NUMBER` / `AUDIENCE_ASSERTION`, siempre con un test nuevo que fije el caso.
- **Límites** (`PLANNING_CONTEXT_LIMITS`, `maxOutputTokens`): si el modelo corta la salida o tarda
  demasiado.

Cada ajuste debe dejar en verde la suite completa (`npm run test`), que sigue usando el proveedor
demo, y volver a pasar la prueba en vivo.
