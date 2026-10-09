# Campaign Manager — estrategia de campaña desde el BrandDNA

Prompt 13. Un Pixel de empresa convierte una necesidad de negocio en una **campaña estructurada**:
estrategia de dirección creativa, piezas que la campaña necesita y su conexión con el trabajo real
(las Operations compartidas). Solo Enterprise (capacidad `campaigns`).

```
ENTERPRISE
Company → BrandDNA
            ↓  (+ brief + contexto acotado del workspace)
      CampaignStrategyEngine
            ↓
Campaign ── CampaignStrategy (v1, v2, …; la campaña apunta a la vigente)
   │
   └── CampaignDeliverables (propuestas)
          │  aceptar (explícito, idempotente)
          ├── type content            → ContentItem  (campaignId, status idea, source pixel)
          └── design · video · photo · web · print · event · other
                                      → Project      (campaignId, status planned) → Tasks
```

**Campaign ≠ Project ≠ ContentItem.** Campaign es estratégica (objetivo, brief, estrategia). Project
es organización de la ejecución. ContentItem es una pieza en producción. No se duplican las
Operations: solo ganan un `campaignId` opcional.

## 1. Entidades

Todas con `workspaceId` obligatorio y `tenantScoped({ key: 'workspaceId' })`; estrategias y piezas,
además, se consultan siempre por `campaignId`. Nunca solo por `_id`.

### Campaign (`campaigns`)

| Campo | Notas |
|---|---|
| `name` (1–120), `objective` (1–500) | Únicos obligatorios en una campaña manual |
| `status` | `draft` · `planned` · `active` · `paused` · `completed` · `archived` (sin estados de aprobación: llegarán con Creative Workflow) |
| `campaignType` | `launch` · `brand_awareness` · `engagement` · `lead_generation` · `sales` · `event` · `education` · `rebranding` · `seasonal` · `other` \| null |
| Brief | `productOrService`, `description`, `targetAudience[]`, `problem`, `desiredOutcome`, `channels[]`, `constraints[]`, `mandatoryElements[]`, `references[]`, `startDate`, `endDate` |
| `keyMessage` | El de la estrategia vigente (editable) |
| `generatedBy` | `manual` \| `pixel` |
| `brandDnaVersion` | BrandDNA de la estrategia vigente (null si nunca se generó) |
| `currentStrategyVersion` | Puntero a la versión vigente (null = sin estrategia) |
| `stats` (calculado) | piezas, propuestas, convertidas, proyectos y contenidos vinculados (3 agregaciones por página, sin N+1) |

Índices: `{workspaceId, status, updatedAt:-1}`, `{workspaceId, startDate}`, `{workspaceId, endDate}`.
`DELETE` **archiva** (conserva estrategia, piezas y operaciones).

### CampaignStrategy (`campaign_strategies`) — versionada

Problema estratégico, oportunidad, insight + `insightType`, big idea, concepto, narrativa, mensaje
principal y secundarios, propuesta de valor, llamada a la acción, tono, dirección visual (atmósfera,
color, materiales, composición, fotografía, movimiento, evitar), canales, pilares, **rationale**
(por qué representa a la marca), `brandDnaVersion` y `generation` (proveedor, modelo, modo,
`discardedDeliverables`, `discardedClaims`).

Único `{workspaceId, campaignId, version}`. Regenerar crea la versión siguiente; las anteriores se
conservan y se pueden leer (`?version=n`). Dos regeneraciones simultáneas no pueden crear la misma
versión: la segunda responde 409 `campaign_strategy_generation_in_progress`.

### CampaignDeliverable (`campaign_deliverables`)

Lo que la campaña **necesita**: `title`, `description`, `type`, `platform`, `format`, `objective`,
`rationale`, `strategyVersion`, `position`, `status` (`proposed` · `accepted` · `rejected` ·
`converted`), `convertedProjectId`, `convertedContentItemId`. Índices
`{workspaceId, campaignId, strategyVersion, position}` y `{workspaceId, status}`.

`accepted` está reservado (aceptar hoy convierte en el acto). Aceptar o rechazar es la decisión
individual del creador, **no** una aprobación formal (Creative Workflow).

### Relaciones con Operations

- `Project.campaignId` y `ContentItem.campaignId`: opcionales (`null` por defecto, también en los
  documentos anteriores, sin migración), con índice `{workspaceId, campaignId}`. Se validan con
  `assertCampaignInWorkspace`: la campaña debe ser del **mismo** workspace y el tipo debe admitir
  campañas; si no, 400 en `campaignId` (sin revelar si existe en otro sitio). Personal nunca puede
  fijarlo.
- Filtros `?campaignId=` en `GET /projects` y `GET /content`.
- **Task no tiene `campaignId`**: Campaign → Project → Task (sin relaciones redundantes).

## 2. CampaignStrategyEngine

`modules/campaigns/campaignStrategy.engine.ts`. Sin lógica en el controlador.

1. **Contexto controlado** (`CampaignPayload`, `ai/campaignStrategyPayload.ts`): el BrandDNA
   (identidad, propósito, audiencia, personalidad, arquetipo, comunicación, lenguaje visual con los
   **roles** de la paleta, diferenciadores, preferencias y restricciones), el brief y listas
   **acotadas**: 5 campañas recientes (nombre, objetivo, concepto, mensaje), 5 versiones anteriores
   de esta campaña, 10 proyectos activos (nombre, tipo, estado) y 20 contenidos recientes (título,
   canal, formato). Sin ids ni documentos.
2. `AIProvider.generateStructuredOutput` con `GeneratedCampaignStrategySchema` (Zod, límites de
   tamaño). Nunca el SDK directo.
3. **Validación contra la realidad** (`campaignStrategy.grounding.ts`, reutiliza las reglas del
   Content Planner sin PersonalDNA):
   - Cifras y métricas que no están en el ADN ni en el brief («50 años de experiencia», «un 40 %
     más»), nombres propios fuera del contexto (productos o ediciones inventadas), claims de mercado
     («líder del mercado», «el más vendido», «premiado», «certificado», «garantizado»…) y
     afirmaciones sobre lo que los clientes valoran → se recorta la frase (textos largos) o se
     descarta el elemento (listas, piezas, propuesta de valor). Si un campo esencial (concepto,
     mensaje, big idea, problema, oportunidad, narrativa, rationale, insight) queda vacío → la
     generación **falla** (502); nunca se rellena inventando.
   - El vocabulario NO incluye las fechas del periodo (evita el R2 del Content Planner).
   - Dirección visual: fuera lo que choca con `restrictions.visual`, `dislikes` o las palabras que la
     marca evita (neón si evita el neón); en color solo colores de la **paleta** (y el prompt exige
     respetar su rol: un acento no domina). `avoid` incluye siempre las restricciones del ADN.
   - Canales: con canales en el brief, ni la estrategia ni las piezas salen de ellos. Sin canales,
     sugiere pocos y los justifica (no IG + TikTok + YouTube para todos).
   - Insight: si dice venir del ADN o del brief pero no se apoya en ellos, se guarda como
     `strategic_hypothesis` y la UI lo muestra como **Hipótesis estratégica**.
   - Sin duplicación evidente: repetir el concepto o el mensaje de una campaña reciente o de una
     versión anterior → falla; una pieza casi igual a un contenido reciente se descarta; entre piezas
     de la misma estrategia solo se descarta la copia exacta (mismo título y canal).
   - Todo lo descartado se cuenta (`generation.discarded*`) y se registra en el log.

**Sin IA disponible no hay estrategia de respaldo** (a diferencia del Daily Director): 503
`campaign_generation_unavailable`. La campaña manual sigue funcionando. Con `AI_PROVIDER=demo` (sin
clave), el `DemoProvider` compone la estrategia con reglas a partir del ADN real
(`demoCampaignStrategy.ts`, marcada `mode: demo`): origen, diferenciadores, tensión de la audiencia,
arquetipo y elementos recurrentes como palancas; tono, paleta con roles, materiales, composición y
movimiento del ADN. Rota la palanca si una campaña reciente o una versión anterior ya usó el mismo
concepto. Por eso TINTO e INVENTIA producen campañas distintas ante el mismo objetivo.

## 3. API

Bajo `requireAuth` + `requireWorkspaceAccess`; el servicio exige la capacidad `campaigns`
(Personal → 400 `feature_not_available`, `expected: 'enterprise'`). Recurso de otro workspace
(aunque sea del mismo dueño) o de otro usuario → **404**.

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/api/workspaces/:id/campaigns` | 201 `{ campaign }` (manual) |
| POST | `/api/workspaces/:id/campaigns/generate` | 201 `{ campaign, strategy, deliverables }` |
| GET | `/api/workspaces/:id/campaigns` (`status`, `limit`, `offset`) | `{ campaigns, total }` (sin archivadas por defecto) |
| GET · PATCH · DELETE | `/api/workspaces/:id/campaigns/:campaignId` | `{ campaign }` (DELETE archiva) |
| GET | `…/:campaignId/strategy[?version=n]` | `{ strategy \| null, versions }` |
| POST | `…/:campaignId/strategy/generate` | 201 `{ campaign, strategy, deliverables }` (nueva versión; cambios opcionales del brief) |
| GET | `…/:campaignId/deliverables[?strategyVersion=n&status=…]` | `{ deliverables }` (por defecto: las de la vigente + las convertidas de versiones anteriores) |
| PATCH | `…/deliverables/:deliverableId` | `{ deliverable }` (solo sin convertir; si no, 409 `campaign_deliverable_converted`) |
| POST | `…/deliverables/:deliverableId/accept` | 201 `{ deliverable, created: true, contentItem \| project }`; 200 si ya existía |
| POST | `…/deliverables/:deliverableId/reject` | `{ deliverable }` (no borra; 409 si ya está convertida) |

Errores de generación: 409 `brand_dna_missing` / `enterprise_company_missing` (sin ADN no se genera
nada), 503 `campaign_generation_unavailable`, 502 `campaign_generation_failed`.

## 4. Conversión de piezas

`acceptCampaignDeliverable`: reserva atómica `converted*Id: null → nuevoId` (solo una llamada gana,
también con dos aceptaciones simultáneas) → crea el recurso con ese id en el **mismo** workspace →
si falla, deshace la reserva. Segunda llamada: 200 con lo existente.

| Tipo | Crea | Con |
|---|---|---|
| `content` | ContentItem | título, descripción → concepto, objetivo, canal y formato mapeados a los enums (`platformFromText`, `formatFromText`), `status: idea`, `source: pixel`, `campaignId`, notas con la campaña y el porqué |
| `design`, `video`, `photo`, `web`, `print` | Project `creative` | `status: planned`, objetivo como meta, fechas de la campaña, `campaignId` |
| `event` / `other` | Project `event` / `campaign` | ídem |

Editar y rechazar son una sola operación condicionada a "no convertida": no hay carrera con una
aceptación simultánea (evita el R7 del Content Planner).

## 5. Interfaz (Enterprise)

Navegación: **Inicio · Trabajo** (Campañas, Proyectos, Tareas, Contenido) **· Marca** (ADN de marca,
Personaje, Chat). Rutas workspace-first (`enterpriseStaysInWorkspace`):

| Ruta | Pantalla |
|---|---|
| `/workspace/:id/campaigns` | Filtros Todas · Borrador · Planificadas · Activas · Completadas · Archivadas; tarjetas con estado, mensaje y piezas en ejecución; **Crear con Pixel** y **Nueva campaña** (formulario en línea; `?new=pixel\|manual`) |
| `/workspace/:id/campaigns/:campaignId` | Nombre, estado (editable), objetivo, periodo, producto, público y canales; secciones **Estrategia · Piezas · Proyectos · Contenido** |

- Crear con Pixel: brief simple (solo el objetivo es obligatorio). Mientras genera, el personaje de
  la marca en `thinking` y «Pixel está construyendo la estrategia de campaña…», sin progreso falso.
  Si falla, el formulario conserva lo escrito.
- Estrategia: documento de dirección creativa (concepto y big idea arriba, mensaje, problema,
  oportunidad, insight, narrativa, mensajes, tono, canales, pilares, dirección visual y "Por qué
  representa a la marca"); selector de versiones; **Regenerar estrategia**. Un insight
  `strategic_hypothesis` lleva la etiqueta **Hipótesis estratégica** y una nota para validarlo.
- Piezas: tipo, canal, formato, objetivo y "¿Por qué?"; **Aceptar · Editar · Rechazar**; convertida
  → "Ver en Contenido" / "Ver el proyecto"; aviso "Creado en Contenido" / "Proyecto creado".
- Proyectos y Contenido: los del mismo workspace con ese `campaignId`.
- Inicio Enterprise: contador **Campañas activas** junto a proyectos, tareas y contenido. Un
  proyecto vinculado muestra "Ver su campaña".

Personal no ve la navegación ni las rutas (`FeatureOnly feature="campaigns"`).

## 6. Resumen operacional y chat

- `operations/summary` → `counts.activeCampaigns` (0 en Personal).
- `getOperationsStatus` (chat Enterprise): conteos + hasta **3 campañas activas** con nombre,
  objetivo (≤ 160) y estado. Nunca la estrategia ni las de otro workspace. El prompt dice que solo
  existen esas y que no invente otras ("¿Cómo va la campaña Navidad?" → no la inventa). Sin búsqueda
  de campañas desde el chat ni tools.

## 7. Limitaciones (no implementado)

Creative Workflow y aprobaciones formales, equipo, roles y responsables, Brand Guardian y scores,
Enterprise Content Planner, Enterprise Daily Director, analytics, publicación o redes externas,
Gmail/Calendar, presupuestos, media buying, ads, automatizaciones de campaña y memoria creativa
avanzada. Sin vincular a mano un proyecto existente a una campaña desde la UI (la API lo admite con
`PATCH /projects/:id { campaignId }`). La estrategia demo escribe en español aunque el idioma de la
marca sea otro. Sin prueba con Claude real (falta `ANTHROPIC_API_KEY`).

## 8. Siguientes pasos

1. Probar `CAMPAIGN_SYSTEM` con Claude real y ajustar el prompt según el resultado.
2. Vincular proyectos y contenidos existentes a una campaña desde la UI.
3. Creative Workflow (aprobaciones formales sobre las piezas) y Brand Guardian (evaluación de piezas
   contra el ADN), encima de esta base.
4. Enterprise Content Planner a partir de la estrategia de una campaña.
