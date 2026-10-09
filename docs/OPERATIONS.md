# Operations — Shared Workspace Operations (Projects, Tasks y ContentItems)

Capa operacional de Pixel (Prompt 09; compartida con Enterprise en el Prompt 12). **Cualquier**
workspace (Personal o Enterprise) gestiona **proyectos**, **tareas** y **piezas de contenido** con
los mismos modelos, endpoints, servicios y pantallas: no existen `EnterpriseProject`,
`EnterpriseTask` ni `EnterpriseContentItem`. Operations no decide nada por sí misma: no planifica,
no prioriza y no genera contenido. Encima de ella viven el Daily Director y el Content Planner
(Personal) y, más adelante, Campaign Manager (Enterprise). Detalles de Enterprise:
`docs/ENTERPRISE-OPERATIONS.md`.

```
Workspace (personal | enterprise)
└── Operations
     ├── Projects ─┬── Tasks         (projectId opcional)
     │             └── ContentItems  (projectId opcional)
     ├── Tasks          (sin proyecto)
     └── ContentItems   (sin proyecto)
```

## 1. Principio: recursos del Workspace, no de Personal

Projects, Tasks y ContentItems son **recursos del workspace**. Su frontera de aislamiento es
`workspaceId`, nunca `personalProfileId` ni `companyId`. No dependen del PersonalDNA ni del BrandDNA.

- **Backend.** La API sirve a ambos tipos con los mismos endpoints (`/api/workspaces/:id/...`). La
  diferencia está solo en `workspace.type` y en el contexto de negocio que usa Pixel.
- **Frontend.** Las pantallas viven en `/workspace/:workspaceId/{projects,tasks,content}` para
  ambos tipos, protegidas por `FeatureOnly` (capacidades de contracts). Enterprise **no** redirige
  estas rutas a `/company/:companyId` (`enterpriseStaysInWorkspace`): son workspace-first.
- **Feature gating.** `workspaceSupportsFeature(type, feature)` (`packages/contracts/src/capabilities.ts`)
  decide qué existe en cada tipo: `projects`, `tasks` y `content` en ambos; `contentPlanner` y
  `dailyDirector` solo en Personal. La API (`assertWorkspaceFeature` → 400 `feature_not_available`)
  y la web (navegación y `FeatureOnly`) leen la misma tabla. Nada se guarda en Mongo.
- No hay rutas tipo `/personal/tasks` ni `/company/:companyId/projects`.

Código: `apps/api/src/modules/operations/`, `packages/contracts/src/{operations,project,task,contentItem,operationsSummary}.ts`,
`apps/web/src/features/operations/`.

## 2. Modelos

Todos con `timestamps`, `tenantScoped({ key: 'workspaceId' })` y fechas en **UTC**.

### Project (`projects`)

| Campo | Tipo | Notas |
|---|---|---|
| `workspaceId` | ObjectId | Requerido. Frontera de aislamiento |
| `name` | string (1–120) | Único campo obligatorio para crear |
| `description` | string \| null | ≤ 2000 |
| `type` | `general` · `content` · `client` · `creative` · `study` · `personal` · `campaign` · `branding` · `product_launch` · `event` · `internal` · `other` | Por defecto `general` en ambos tipos. La API acepta el enum completo; la web ofrece `PROJECT_TYPES_BY_WORKSPACE[type]` (y conserva el tipo actual al editar). Solo se añadieron valores: los documentos anteriores siguen siendo válidos, sin migración. `campaign` es una etiqueta humana, no Campaign Manager |
| `status` | `planned` · `active` · `on_hold` · `completed` · `archived` | Por defecto `active` |
| `priority` | `low` · `medium` · `high` | Por defecto `medium` |
| `goals` | string[] | ≤ 10 |
| `startDate`, `dueDate` | Date \| null | `dueDate ≥ startDate` (validado también contra lo guardado al editar) |
| `campaignId` | ObjectId \| null | Prompt 13: campaña del **mismo** workspace (solo Enterprise) o ninguna; `null` en los documentos anteriores. Ver `CAMPAIGNS.md` |

`progress` y `stats` **no se guardan**: se calculan en cada respuesta (ver §5).

### Task (`tasks`)

| Campo | Tipo | Notas |
|---|---|---|
| `workspaceId` | ObjectId | Requerido |
| `projectId` | ObjectId \| null | Proyecto **del mismo workspace** o ninguno |
| `title` | string (1–160) | Único campo obligatorio |
| `description` | string \| null | ≤ 4000 |
| `status` | `inbox` · `todo` · `doing` · `done` · `cancelled` | Por defecto `inbox` |
| `priority` | `low` · `medium` · `high` | |
| `dueDate` | Date \| null | |
| `estimatedMinutes` | int \| null | 1 – 10 080 |
| `tags` | string[] | ≤ 12, sin duplicados |
| `source` | `manual` · `pixel` | Lo asigna el servidor (`manual` desde la API) |
| `completedAt` | Date \| null | Lo gestiona el servidor |

### ContentItem (`content_items`)

Una pieza **en proceso**, no un post publicado en una red: no hay integración con Instagram, TikTok…

| Campo | Tipo | Notas |
|---|---|---|
| `workspaceId` | ObjectId | Requerido |
| `projectId` | ObjectId \| null | Proyecto del mismo workspace o ninguno |
| `campaignId` | ObjectId \| null | Prompt 13: campaña del mismo workspace (solo Enterprise) o ninguna |
| `title` | string (1–160) | Único campo obligatorio |
| `concept`, `objective`, `hook`, `caption`, `script`, `notes` | string \| null | Desarrollo creativo |
| `platform` | `instagram` · `tiktok` · `youtube` · `facebook` · `linkedin` · `x` · `blog` · `newsletter` · `other` \| null | |
| `format` | `reel` · `carousel` · `story` · `post` · `photo` · `short_video` · `long_video` · `article` · `podcast` · `newsletter` · `other` \| null | |
| `status` | `idea` · `planned` · `production` · `review` · `ready` · `published` · `archived` | Por defecto `idea` |
| `scheduledFor` | Date \| null | Fecha prevista (sin calendario todavía) |
| `publishedAt` | Date \| null | Lo gestiona el servidor (ver §4) |
| `tags` | string[] | |
| `source` | `manual` · `pixel` | Lo asigna el servidor |

## 3. Estados (UI en español)

| Project | | Task | | ContentItem | |
|---|---|---|---|---|---|
| `planned` | Planificado | `inbox` | Inbox | `idea` | Idea |
| `active` | Activo | `todo` | Por hacer | `planned` | Planificado |
| `on_hold` | En pausa | `doing` | En curso | `production` | Producción |
| `completed` | Completado | `done` | Hecha | `review` | Revisión |
| `archived` | Archivado | `cancelled` | Cancelada | `ready` | Listo |
| | | | | `published` | Publicado |
| | | | | `archived` | Archivado |

Las etiquetas viven en contracts (`PROJECT_STATUS_LABELS`, `TASK_STATUS_LABELS`,
`CONTENT_STATUS_LABELS`, `PRIORITY_LABELS`, `CONTENT_PLATFORM_LABELS`, `CONTENT_FORMAT_LABELS`).

## 4. Reglas de dominio

- **El workspace sale siempre de la URL autorizada.** Los schemas de entrada son `strict`:
  `workspaceId`, `source`, `completedAt` o `progress` en el cuerpo responden **400**.
- **Relación con Project.** Al crear o editar una tarea o una pieza con `projectId`, el servicio
  comprueba `Project.exists({ _id, workspaceId })`. Si el proyecto no existe o es de otro workspace,
  la respuesta es la misma: **400** `VALIDATION_ERROR` con `details: [{ path: 'projectId', message:
  'Proyecto no encontrado' }]`, sin revelar si existe en otro sitio. Nunca puede quedar
  `Task.workspaceId = A` con `Project.workspaceId = B`.
- **`completedAt`**: al pasar a `done` se fija con "ahora". Si la tarea ya estaba hecha, se conserva.
  Al salir de `done` se limpia. Crear una tarea directamente como `done` también lo fija.
- **`publishedAt`**: al pasar a `published` se usa el valor enviado o, si no hay, el actual o
  "ahora". Si la pieza vuelve a una etapa anterior (`idea…ready`), se limpia. Al archivarla se
  conserva.
- **`source`**: `manual` para todo lo que llega por la API. Los servicios aceptan
  `{ source: 'pixel' }` internamente (`createTask`, `createContentItem`) para la planificación
  futura, sin migraciones.

### Borrado (decisión)

| Recurso | DELETE | Motivo |
|---|---|---|
| Project | **Archiva** (`status = archived`, 200 con el proyecto). Idempotente | Tiene hijos: nunca se borra en cascada ni deja huérfanos. Se reactiva con `PATCH { status }` |
| Task | Elimina (204) | Recurso hoja. Para conservarla: `status = cancelled` |
| ContentItem | Elimina (204) | Recurso hoja. Para conservarla: `status = archived` |

Las listas excluyen por defecto los proyectos y contenidos archivados (se piden con `status=archived`).

## 5. Progreso y relaciones

```
progress = round(completedTasks / tasks × 100)   (0 si no hay tareas)
tasks          = tareas del proyecto que no están canceladas
completedTasks = tareas del proyecto en `done`
contentItems   = piezas del proyecto que no están archivadas
```

Se calcula en `projectStatsFor(workspace, projectIds)` con **dos agregaciones por página** (tareas y
contenido agrupados por `projectId`). Cada una empieza por `$match: { workspaceId }`, así que una
tarea de otro workspace con el mismo `projectId` (solo posible saltándose la API) no cuenta. Sin N+1.

El detalle de proyecto hace tres peticiones: el proyecto, `GET /tasks?projectId=…` y
`GET /content?projectId=…`.

## 6. Endpoints

Todos bajo `requireAuth` + `requireWorkspaceAccess`: workspace ajeno, inexistente o con id malformado
→ **404**. Un recurso ajeno, inexistente o con id malformado → **404** (nunca 403).

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/api/workspaces/:workspaceId/projects` | 201 `{ project }` |
| GET | `/api/workspaces/:workspaceId/projects` | `{ projects, total }` |
| GET | `/api/workspaces/:workspaceId/projects/:projectId` | `{ project }` |
| PATCH | `/api/workspaces/:workspaceId/projects/:projectId` | `{ project }` |
| DELETE | `/api/workspaces/:workspaceId/projects/:projectId` | `{ project }` (archivado) |
| POST | `/api/workspaces/:workspaceId/tasks` | 201 `{ task }` |
| GET | `/api/workspaces/:workspaceId/tasks` | `{ tasks, total }` |
| GET | `/api/workspaces/:workspaceId/tasks/:taskId` | `{ task }` |
| PATCH | `/api/workspaces/:workspaceId/tasks/:taskId` | `{ task }` |
| DELETE | `/api/workspaces/:workspaceId/tasks/:taskId` | 204 |
| POST | `/api/workspaces/:workspaceId/content` | 201 `{ contentItem }` |
| GET | `/api/workspaces/:workspaceId/content` | `{ contentItems, total }` |
| GET | `/api/workspaces/:workspaceId/content/:contentItemId` | `{ contentItem }` |
| PATCH | `/api/workspaces/:workspaceId/content/:contentItemId` | `{ contentItem }` |
| DELETE | `/api/workspaces/:workspaceId/content/:contentItemId` | 204 |
| GET | `/api/workspaces/:workspaceId/operations/summary` | `{ summary }` (Inicio) |

### Filtros (query string, validados con Zod)

| Recurso | Filtros | Orden |
|---|---|---|
| Projects | `status` (lista), `priority`, `search` | `updatedAt` desc |
| Tasks | `status` (lista), `priority`, `projectId`, `due` (`today` · `overdue` · `upcoming`) + `tzOffset`, `search` | con `due`: `dueDate` asc · `status=done`: `completedAt` desc · si no: `createdAt` desc |
| Content | `status` (lista), `platform`, `format`, `projectId`, `search` | `updatedAt` desc |

- Listas: `status=todo,doing` o `status=todo&status=doing`. Un valor fuera del enum → 400.
- `search`: texto literal (se escapa; no es una regex), sin distinguir mayúsculas, ≤ 100 caracteres.
- Paginación: `limit` (1–100, por defecto 50) y `offset`. La respuesta incluye `total`.
- `due` filtra **solo por fecha**; el estado se filtra aparte (la web envía
  `status=inbox,todo,doing`). Los límites del día se calculan con `tzOffset` (el valor de
  `Date#getTimezoneOffset()` del navegador; por defecto 0 = UTC). No se guarda ninguna preferencia de
  zona horaria.

### Resumen (`operations/summary?tzOffset=…`)

`counts: { activeProjects, openTasks, overdueTasks, contentInProduction, activeContentItems }`
(`activeContentItems` = de idea a listo, sin publicados ni archivados) y tres listas de hasta 5:
`upcomingTasks` (pendientes con fecha desde hoy), `recentProjects` (no archivados, más recientes) y
`upcomingContent` (sin publicar, con fecha prevista desde hoy). Solo datos reales: no hay
recomendaciones. Lo usan el Inicio Personal y el Inicio Enterprise ("Trabajo de la marca").

`getOperationsStatus(workspace, { timezone })` reutiliza los mismos conteos (sin listas) con la zona
horaria del workspace: es el estado compacto que recibe el chat Enterprise (ver
`docs/ENTERPRISE-OPERATIONS.md`).

## 7. Índices

| Colección | Índices |
|---|---|
| `projects` | `{ workspaceId, status, updatedAt: -1 }` · `{ workspaceId, dueDate }` |
| `tasks` | `{ workspaceId, status, createdAt: -1 }` · `{ workspaceId, dueDate }` · `{ workspaceId, projectId, status }` |
| `content_items` | `{ workspaceId, status, updatedAt: -1 }` · `{ workspaceId, scheduledFor }` · `{ workspaceId, projectId, status }` |

No hay índice suelto `{ workspaceId }`: lo cubre el prefijo de cualquiera de los compuestos (sería
redundante). Los índices de `projectId` empiezan por `workspaceId`, así que también sirven las
agregaciones de progreso. Un test verifica la lista exacta de índices.

## 8. Aislamiento (cubierto por tests)

- `tenantScoped` en los tres modelos: `find`, `findOne`, `findById`, `countDocuments`,
  `estimatedDocumentCount`, `updateOne/Many`, `deleteOne/Many`, `aggregate` (primer `$match`) y
  `bulkWrite` sin un `workspaceId` concreto lanzan `TenantScopeError`; también con `$exists`, `$ne`,
  `$in` o `''`.
- Usuario B recibe **404** en los 16 endpoints del workspace de A, y también al pedir los ids de A
  desde su propio workspace. Nada de A cambia tras los intentos.
- Operadores en la query (`projectId[$ne]=x`, `status[$ne]=done`…) no saltan el aislamiento: la
  query simple de Express no anida objetos y Zod valida cada filtro.
- Dos workspaces del mismo dueño (Personal + Enterprise, o dos Enterprise como TINTO e INVENTIA) no
  comparten proyectos ni pueden vincular operaciones a proyectos del otro. Prueba crítica: los tres
  workspaces de un mismo usuario con un "Lanzamiento" (proyecto, tarea y contenido) cada uno; cada
  uno ve solo el suyo y los demás responden 404.
- El progreso solo cuenta operaciones del workspace del proyecto.

Tests: `projects.test.ts`, `tasks.test.ts`, `content.test.ts`, `operationsIsolation.test.ts`,
`enterpriseOperations.test.ts` (API), `operations.test.ts`, `capabilities.test.ts` (contracts),
`operationsApi.test.ts`, `operationsLogic.test.ts`, `operationsViews.test.tsx`,
`enterpriseOperations.test.tsx` y `navigation.test.ts` (web).

## 9. Interfaz (Personal y Enterprise)

Las mismas pantallas para ambos tipos; solo cambian algunos textos (`operationsCopy`: "Proyectos" /
"Proyectos de TINTO", ejemplos de los formularios, estados vacíos) y los tipos de proyecto que se
ofrecen.

Navegación Personal: **Inicio · Trabajo** (Proyectos, Tareas, Contenido, Plan de contenido) **·
Pixel** (Mi ADN, Mi Pixel, Chat). Navegación Enterprise: **Inicio · Trabajo** (Proyectos, Tareas,
Contenido) **· Marca** (ADN de marca, Personaje, Chat).

| Ruta | Pantalla |
|---|---|
| `/workspace/:id` | Inicio: 3 contadores (proyectos activos, tareas pendientes, contenido en producción) y bloques "Próximas tareas", "Proyectos recientes", "Contenido próximo" |
| `/workspace/:id/projects` | Tarjetas con estado, prioridad, fecha límite, progreso y conteos. Filtros Todos · Activos · Planificados · Completados · Archivados. "Nuevo proyecto" en línea (sin modal) |
| `/workspace/:id/projects/:projectId` | Datos, objetivos y progreso; Tareas (Quick Task fija al proyecto) y Contenido (+ Nuevo contenido); editar y archivar/reactivar |
| `/workspace/:id/tasks` | Inbox · Hoy (con "Vencidas" arriba) · Próximas · Todas · Completadas. Quick Task "¿Qué necesitas hacer?" con proyecto, prioridad y fecha opcionales. Completar es optimista y se puede deshacer; la fila se edita en línea |
| `/workspace/:id/content` | Pipeline por pestañas con conteo: Ideas · Planificado · Producción · Revisión · Listo · Publicado (+ Archivado). "Pasar a <etapa>" / "Marcar publicado" (con deshacer); edición en línea |

Clientes: `projectsApi`, `tasksApi`, `contentApi` y `operationsApi` (resumen), todos sobre
`/api/workspaces/:workspaceId`. Cada pantalla tiene carga, error con reintento, vacío y aviso de éxito.
Fechas: un día del `<input type="date">` se guarda como el **mediodía local** de ese día en UTC
(`dateInputToIso`) y se muestra en la zona local ("Hoy", "Mañana", "15 oct").

## 10. Qué todavía NO hace Pixel

- No modifica nada por ti. El **Daily Director** (`docs/DAILY-DIRECTOR.md`) lee Projects, Tasks y
  ContentItems para recomendar prioridades del día, pero nunca los cambia.
- No genera tareas. El contenido solo llega desde el **Content Planner** (`docs/CONTENT-PLANNER.md`):
  una propuesta aceptada crea un ContentItem con `source = pixel` y `status = idea`.
- No hay calendario, recordatorios, notificaciones ni integración con Google Calendar o Gmail.
- No publica en redes: `published` es una marca manual.
- Projects, Tasks y ContentItems **no entran en detalle en el contexto del chat**. Personal recibe
  solo la dirección del día; Enterprise recibe solo conteos (`getOperationsStatus`). Sin retrieval
  ni tools: el chat no lista tareas ni busca proyectos concretos.
- CreativeMemory no cambia.
- Sin drag-and-drop, Kanban, equipos, roles ni analítica.

## 11. Evolución

1. ~~Pantallas Enterprise para Operations~~ — hecho en el Prompt 12 (`docs/ENTERPRISE-OPERATIONS.md`).
2. Campaign Manager (Prompt 13): `Campaign` será una entidad nueva del workspace que agrupe
   Projects (y ContentItems) con una referencia opcional (`campaignId`) añadida sin migración
   destructiva. Operations no se reescribe.
3. Equipos/roles: añadir `assigneeId`/`createdByUserId` cuando existan miembros del workspace. La
   frontera seguirá siendo `workspaceId`.
4. Daily Director / Content Planner Enterprise: leer los mismos datos + BrandDNA y crear con
   `source: 'pixel'`; se habilitan cambiando la tabla de capacidades cuando existan.
