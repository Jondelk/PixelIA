# Enterprise Content Planner — plan editorial de una marca

Prompt 14. El Pixel de una empresa convierte el **BrandDNA** y, si se elige, la **estrategia de una
campaña** en un plan editorial con piezas concretas y su porqué. Es el **mismo** Content Planner que
Personal (mismos modelos, endpoints y pantallas, `docs/CONTENT-PLANNER.md`): cambia la estrategia de
planificación, elegida por `workspace.type`. No hay modelos `Enterprise*` duplicados.

```
ENTERPRISE
Company → BrandDNA ───────────────┐
Campaign → CampaignStrategy (vN) ─┤  (opcional: campaignId)
  └─ CampaignDeliverables         ├─► EnterprisePlanningStrategy ─► ContentPlan (contextType enterprise,
Projects (activos) ───────────────┤      (AIProvider + grounding)      brandDnaVersion, campaignId,
Contenido reciente + propuestas ──┘                                    campaignStrategyVersion)
                                                                         └─ ContentPlanItem × N
                                                                              │ aceptar (explícito)
                                                                              ▼
                                                                    ContentItem (source pixel,
                                                                    status idea, campaignId)
```

**El planner propone; nunca modifica.** No cambia el estado de las piezas de campaña, ni la
estrategia, ni proyectos o tareas. Solo aceptar una propuesta crea un ContentItem.

Código: `apps/api/src/modules/content-plans/enterprisePlanning.{strategy,grounding}.ts`,
`apps/api/src/ai/enterprisePlanningPayload.ts`, `apps/api/src/ai/providers/demoEnterpriseContentPlan.ts`,
`apps/api/src/modules/content-plans/contentPlan.migration.ts`, `packages/contracts/src/contentPlan.ts`
y `apps/web/src/features/content-planner/`.

## 1. Modelo: un ContentPlan para los dos contextos

### Campos nuevos de ContentPlan

| Campo | Notas |
|---|---|
| `contextType` | `personal` · `enterprise`. Siempre el tipo del workspace (inmutable). Sin `default` en Mongoose a propósito (aplicaría el valor al leer y ocultaría los planes sin migrar); el DTO usa `workspace.type` como respaldo |
| `brandDnaVersion` | Versión del BrandDNA usada (null en Personal) |
| `campaignId` | Campaña en que se basa (null = plan editorial de marca) |
| `campaignStrategyVersion` | Versión **exacta** de la estrategia usada. No se regenera sola si la campaña cambia de estrategia |
| `editorialObjective` | Qué vamos a comunicar |
| `campaignAlignment` | Cómo desarrolla el plan la campaña (null sin campaña: nunca se finge) |
| `distributionRationale` | Cómo se reparten pilares y piezas |

Índice nuevo: `{ workspaceId, campaignId, createdAt: -1 }` (filtro `?campaignId=`).

### Invariantes (`contentPlanContextIssues`, `ContentPlanSchema.superRefine`)

| `contextType` | Regla |
|---|---|
| `personal` | Sin `brandDnaVersion`, sin `campaignId` ni `campaignStrategyVersion` |
| `enterprise` | Sin `personalDnaVersion`; generado con Pixel → `brandDnaVersion` obligatorio; `campaignId` y `campaignStrategyVersion` van juntos (los dos o ninguno) |

Un plan manual Enterprise (`POST /content-plans`) no lleva versión de ADN ni campaña.

### Campos nuevos de ContentPlanItem

`campaignId`, `campaignDeliverableId` (la pieza de campaña que desarrolla), `strategicRole`
(`awareness` · `education` · `authority` · `engagement` · `community` · `conversion` · `launch` ·
`retention` · `other`), `funnelStage` (`awareness` · `consideration` · `conversion` · `retention`),
`strategicMessage` (mensaje de la estrategia que desarrolla) y `brandRationale` (**por qué encaja con
la marca**). Todos `null` por defecto, también en Personal. Sin índices nuevos.

## 2. Migración de `contextType`

`migrateContentPlanContexts({ dryRun })` (`contentPlan.migration.ts`):

- Solo toca planes **sin** `contextType`; les asigna el tipo de **su** workspace. Idempotente y
  reiniciable: una segunda ejecución no cambia nada. Nunca modifica el contenido generado.
- Un plan cuyo workspace ya no existe se deja intacto y se cuenta como `orphaned`.
- Usa el driver nativo (`Model.collection`), como la migración Company → Workspace: recorre planes de
  todos los workspaces, algo que `tenantScoped` impide en el código de producto. Nunca cruza datos.
- Resultado: `{ pending, migrated, orphaned, byType: { personal, enterprise } }`.

```bash
npm run migrate:content-plans -- --dry-run   # cuenta, no escribe
npm run migrate:content-plans                # asigna contextType
```

También se ejecuta al arrancar la API (`server.ts`, `onConnected`); sin planes pendientes no hace nada.

## 3. Estrategia de planificación Enterprise

`POST /api/workspaces/:id/content-plans/generate` es el **mismo** endpoint. El servicio elige la
estrategia por `workspace.type`: Personal → `ContentPlanningEngine` (sin cambios), Enterprise →
`EnterprisePlanningStrategy`. El cuerpo acepta un `campaignId` opcional (solo Enterprise; en
Personal → 400 en `campaignId`).

### Petición normalizada (`resolveEnterpriseRequest`)

- **Plataformas**: las pedidas → los canales de la campaña mapeados a enum (los que no son redes de
  contenido, como "Punto de venta", se ignoran) → si no queda ninguna, 400
  `content_platforms_missing`. El BrandDNA no declara plataformas: nunca se asumen.
- **Frecuencia**: la pedida o `CONTENT_PLAN_DEFAULT_FREQUENCY = 3` por semana. Como máximo 30 piezas.

### Contexto controlado (`EnterprisePlanningPayload`, `<enterprise_planning_input>`)

| Fuente | Límite |
|---|---|
| BrandDNA | Identidad, propósito, audiencia, personalidad y arquetipo, comunicación, lenguaje visual, diferenciadores, valores, preferencias y restricciones |
| Campaña (opcional) | Ref `CAMPAIGN_1`: nombre, objetivo, brief, canales y la **estrategia vigente** (concepto, big idea, mensajes, pilares, tono, dirección visual) |
| Piezas de la campaña | 12 (`DELIVERABLE_n`): título, tipo, canal, formato, objetivo y `inProduction` (ya convertida) |
| Proyectos activos/planificados | 10 (`PROJECT_n`), con `inCampaign` |
| Contenido reciente | 30 títulos (`CONTENT_n`) |
| Propuestas anteriores | 40 títulos |

**Ids controlados**: la IA solo ve referencias (`CAMPAIGN_1`, `DELIVERABLE_n`, `PROJECT_n`,
`CONTENT_n`), nunca ids de Mongo. El servidor las traduce; una referencia desconocida descarta la
pieza.

### Validación contra la realidad (`groundEnterprisePlan`)

Reutiliza las reglas del Campaign Manager (cifras, nombres propios fuera del contexto, claims de
mercado, afirmaciones sobre los clientes) y añade las **promocionales** propias de un plan:
descuentos, ofertas, gratis, 2x1, cupones, sorteos, precios, "el favorito de…", testimonios y
reseñas. Lo que la marca no dio no se puede afirmar. El vocabulario **no** incluye las fechas: "2026"
no autoriza "2026 clientes".

Se descarta (y se cuenta en `generation.discardedItems`) la pieza que:
- usa una referencia desconocida o una plataforma no permitida;
- afirma algo sin base o choca con el ADN (restricciones visuales, lo que la marca rechaza, palabras
  que evita);
- copia una pieza de campaña **ya en producción**;
- repite el historial (Jaccard ≥ 0,6 con contenido reciente o propuestas anteriores, o un hook ya
  usado);
- con campaña, no la desarrolla (`developsCampaign`): ni es de un pilar de la estrategia, ni
  desarrolla una de sus piezas, ni comparte ideas con su concepto, big idea o mensajes. Evita que el
  planner sustituya la campaña por contenido genérico.

Si no queda estrategia editorial, objetivo o ninguna pieza → 502 `content_plan_generation_failed`.
El motivo interno queda en el log (`Content Planner: no se generó el plan`).

### Modo demo

Sin `ANTHROPIC_API_KEY`, `demoEnterpriseContentPlan.ts` compone el plan con reglas a partir del
contexto real:
- **Voz editorial por arquetipo**: cuidado (caregiver, everyman, lover, innocent, jester) cuenta desde
  las personas y el oficio; método (creator, sage, ruler, magician) demuestra con proceso y
  evidencia; búsqueda (explorer, hero, rebel) plantea retos y recorridos. TINTO (caregiver) e
  INVENTIA (sage) producen planes materialmente distintos.
- **Fuentes**: con campaña, piezas pendientes → proyectos de la campaña → pilares → mensajes → otros
  proyectos; sin campaña, diferenciadores, tensión de la audiencia, valores y elementos visuales.
- **Planes sucesivos**: evita el historial con una similitud más estricta que la del grounding y, en
  vueltas siguientes, cambia el encuadre de la pieza (no solo el formato). Tras unas 40 ideas sobre
  la misma campaña se agota y responde 502 (nunca 503 "no disponible").

## 4. Errores

| Caso | HTTP | Detalle |
|---|---|---|
| Sin Company | 409 | `enterprise_company_missing` |
| Sin BrandDNA | 409 | `brand_dna_missing` |
| `campaignId` de otro workspace, inexistente o malformado | 400 | Campo `campaignId` ("Campaña no encontrada"; no revela si existe) |
| Campaña sin estrategia | 409 | `campaign_strategy_missing` |
| `campaignId` en Personal | 400 | Campo `campaignId` |
| Sin plataformas | 400 | `content_platforms_missing` |
| Proveedor caído o mal configurado | 503 | `content_plan_generation_unavailable` |
| Salida inválida o nada fundamentado | 502 | `content_plan_generation_failed` |

## 5. Aceptar, editar y rechazar

- **Aceptar** reutiliza la reserva atómica del Content Planner (`convertedContentItemId: null →
  nuevoId`): idempotente y seguro ante dos aceptaciones simultáneas. El ContentItem copia también el
  `campaignId`; las notas incluyen el mensaje y el porqué de marca.
- **Editar y rechazar** son una única operación condicionada a "no convertida" (`updateUnconverted`).
  Aceptar y rechazar a la vez nunca deja una propuesta "rechazada" con su ContentItem creado.
- Aceptar **no** cambia el estado de la pieza de campaña (`CampaignDeliverable.status`) ni la
  estrategia.

## 6. Interfaz Enterprise

Navegación (desde el Prompt 14.1, `docs/PIXEL-COMMAND.md`): **Inicio · Trabajo** (Campañas, Plan de
contenido, Proyectos, Tareas, Contenido) **· Marca** (ADN de marca, Personaje, Chat). El Prompt 14
la dejó en Inicio · Estrategia · Trabajo · Marca; el 14.1 la redujo a tres grupos.

Desde el Prompt 14.1, lo principal de la pantalla es **"¿Qué quieres comunicar?"** (PixelCommand:
resuelve periodo, campaña, plataformas y frecuencia de la frase y del contexto). El formulario de
abajo queda como **Opciones avanzadas**. Admite además `formats` (formatos obligatorios: "tres
Reels", "sin Stories"): una pieza en otro formato se descarta en los dos motores.

- **`/workspace/:id/content-planner`**: "Plan de contenido de {marca}", planes con su campaña y la
  versión de estrategia, **Crear plan con Pixel** y **Nuevo plan** (manual).
- **Formulario**: selector "¿Quieres basar este plan en una campaña?" con un resumen compacto
  (campaña, objetivo, concepto, mensaje principal); `?campaign=<id>` la preselecciona. Mientras
  genera: el personaje de la marca en `thinking` y «Pixel está construyendo el plan editorial de
  {marca}…»; el formulario conserva lo escrito si falla.
- **Plan**: en orden **Estrategia editorial** (con "Qué vamos a comunicar" y "Cómo se distribuye"),
  **Alineación con la campaña** (enlace a la campaña, "Creado desde la estrategia de campaña vN" y un
  aviso si la campaña tiene una versión más reciente), **Pilares** y **Plan de contenido**.
- **Tarjeta**: insignias *Campaña* y *Pieza de campaña*, rol estratégico y etapa, mensaje, ángulo
  sugerido, "Por qué Pixel lo recomienda" y **"Por qué encaja con la marca"**. Editar permite cambiar
  también el objetivo y el ángulo sugerido.
- **Detalle de campaña**: sección **Plan de contenido** con los planes de esa campaña y el CTA
  "Crear plan de contenido" (`/content-planner?campaign=<id>`).

## 7. Chat y estado operativo

`getOperationsStatus` añade `activeContentPlans` y `plannedContentItems`; el contexto del chat
Enterprise muestra solo **conteos** ("Planes de contenido activos: N"), nunca nombres, propuestas ni
planes de otro workspace. El Daily Director Personal no lee planes de empresa.

## 8. Aislamiento (cubierto por tests)

TINTO e INVENTIA del mismo dueño: ninguno puede planificar con la campaña del otro (400 sin revelar
que existe), los proyectos de un plan son siempre de su workspace y el plan de INVENTIA no contiene
nada de TINTO. Personal genera y acepta como antes, sin BrandDNA ni campañas.

## 8 bis. Brand Guardian (Prompt 15)

"Revisar con Guardian" en el plan evalúa en un solo informe su estrategia editorial y sus piezas
contra el BrandDNA y su campaña (alineación por pieza, encaje plataforma–formato, claims). "Corregir
con Pixel" propone cambios en las piezas no convertidas y "Aplicar" usa `updateContentPlanItem`
(`docs/BRAND-GUARDIAN.md` §8).

## 8 ter. Creative Memory (Prompt 16)

El planner Enterprise usa las memorias de la marca (y las excepciones de la campaña elegida) como
preferencia por defecto: formatos preferidos primero, formatos y plataformas evitados fuera, salvo que
la solicitud los pida (manda). `generation.memoryKeys` guarda lo aplicado. Aceptar, rechazar o editar
y aceptar piezas registra decisiones (`docs/CREATIVE-MEMORY.md`).

## 9. Limitaciones

- Validación heurística (como el resto del planner); estricta a propósito.
- Sin calendario, publicación, programación real ni métricas.
- Generación síncrona.
- El demo escribe en español y se agota tras muchos planes de la misma campaña.
- **Sin prueba con Claude real** (falta `ANTHROPIC_API_KEY`): `ENTERPRISE_PLANNING_SYSTEM` y el
  grounding solo se han validado con el proveedor demo.
- Fuera de alcance: Creative Workflow, aprobaciones, equipo, Brand Guardian, Enterprise Daily
  Director, analytics, publicación, APIs externas y generación de imagen o video.
