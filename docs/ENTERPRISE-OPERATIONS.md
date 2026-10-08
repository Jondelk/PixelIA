# Enterprise Operations — Projects, Tasks y Content para una marca

Prompt 12. Un Pixel de empresa (workspace `enterprise`) organiza el trabajo real de la marca con las
**mismas** Operations que Pixel Personal (`docs/OPERATIONS.md`): Project, Task y ContentItem. No
hay modelos, endpoints ni pantallas duplicados por tipo.

```
PIXEL CORE
├── Workspace
├── Projects · Tasks · ContentItems      ← Shared Workspace Operations
├── Avatar · Chat · Memory
│
├── PERSONAL
│    ├── PersonalDNA
│    ├── Content Planner                 (solo Personal)
│    └── Daily Director                  (solo Personal)
│
└── ENTERPRISE
     ├── Company
     ├── BrandDNA
     └── Operations                      (las compartidas, sobre el workspace de la empresa)
```

## 1. Cómo Enterprise reutiliza Operations

| Pieza | Compartida | Diferencia Enterprise |
|---|---|---|
| Modelos `Project`, `Task`, `ContentItem` | Sí, sin cambios conceptuales | Ninguna. No hay `companyId`: el workspace ya conoce su empresa |
| Endpoints `/api/workspaces/:workspaceId/{projects,tasks,content,operations/summary}` | Sí | Ninguna |
| Servicios `modules/operations/*` | Sí | Ninguna (no se movieron archivos) |
| Progreso (`completedTasks / tasks`) | Sí | Misma regla |
| Pantallas `ProjectsPage`, `ProjectDetailPage`, `TasksPage`, `ContentPage`, `QuickTask`, `ContentList`, `OperationsOverview` | Sí | Copy (`operationsCopy`) y tipos de proyecto que se ofrecen |
| Contexto del chat | — | Enterprise recibe solo conteos (§7) |

### Relación Workspace → Company

```
User ─┬─ Workspace (enterprise) ── Company (TINTO) ── BrandDNA
      │        └─ Projects · Tasks · ContentItems     (workspaceId)
      ├─ Workspace (enterprise) ── Company (INVENTIA) ── BrandDNA
      │        └─ Projects · Tasks · ContentItems
      └─ Workspace (personal) ── PersonalProfile ── PersonalDNA
               └─ Projects · Tasks · ContentItems · ContentPlans · DailyBriefs
```

1 workspace enterprise = 1 Company (`Company.workspaceId`). Las Operations cuelgan del workspace,
nunca de la empresa: **una sola frontera de tenant** (`workspaceId`).

## 2. Project

Mismo modelo y contrato. Cambios del Prompt 12:

- `type` admite además `campaign`, `branding`, `product_launch`, `event`, `internal`. Solo se
  añadieron valores: los documentos existentes (`personal`, `study`…) siguen siendo válidos. No hubo
  migración.
- Por defecto `general` en ambos tipos (nunca `personal`).
- La API acepta el enum completo en cualquier workspace; la web ofrece
  `PROJECT_TYPES_BY_WORKSPACE.enterprise`: General, Contenido, Creativo, Campaña, Branding,
  Lanzamiento, Evento, Interno, Otro. Al editar se conserva el tipo actual aunque no esté en la lista.
- Sin metadata `enterprise` (departamento, clientFacing…): no había una necesidad real todavía.
- `campaign` es una **clasificación humana**. No implica Campaign Manager ni crea nada más.

Ejemplos: TINTO → "Lanzamiento presentación 500 g"; INVENTIA → "Lanzamiento laboratorio 2027";
Rollerpoints → "Campaña Sharp Ultra".

## 3. Task

Sin cambios. Vistas Inbox · Hoy · Próximas · Todas · Completadas y Quick Task, igual que Personal.
Sin responsables, aprobaciones, equipo ni flujos por departamento (llegarán después).

## 4. ContentItem

Sin cambios. Pipeline Idea → Planificado → Producción → Revisión → Listo → Publicado (+ Archivado).
**No hay `campaignId`**: no se referencia una entidad que todavía no existe. Prompt 13 lo añadirá
como campo opcional (no destructivo).

## 5. Feature gating

Capacidades **derivadas** del tipo (no se guardan): `packages/contracts/src/capabilities.ts`.

| Funcionalidad | Personal | Enterprise |
|---|---|---|
| `projects` | ✅ | ✅ |
| `tasks` | ✅ | ✅ |
| `content` | ✅ | ✅ |
| `contentPlanner` (generar con IA) | ✅ | ❌ |
| `dailyDirector` | ✅ | ❌ |

- API: `assertWorkspaceFeature(workspace, feature, message)` (`modules/workspaces/workspaceFeatures.ts`)
  → **400** `{ reason: 'feature_not_available', feature, expected: 'personal' }`. Lo usan
  `generateContentPlan`, el Daily Director y su lectura para el chat (`hasWorkspaceFeature`).
- Web: `workspaceNav`/`enterpriseNav` filtran los enlaces y `<FeatureOnly feature>` protege las
  rutas (sin capacidad → vuelve al inicio del workspace).

## 6. Aislamiento entre workspaces del mismo usuario

`requireWorkspaceAccess` solo prueba que el workspace es del usuario. **Cada consulta hija** filtra
además por `workspaceId` (`{ _id, workspaceId }`, `tenantScoped`) y todo `projectId` del cuerpo se
valida contra el mismo workspace (`assertProjectInWorkspace`). Cubierto por
`apps/api/test/enterpriseOperations.test.ts`:

- **Prueba crítica**: Jhon con Personal, TINTO e INVENTIA, cada uno con un Project, una Task y un
  ContentItem llamados "Lanzamiento". Cada workspace lista y busca solo lo suyo; GET, PATCH y DELETE
  de los recursos de los otros dos → **404** (sin revelar que existen ni de quién son) y nada cambia.
- Una tarea o un contenido de INVENTIA no se puede crear ni mover a un proyecto de TINTO (**400**
  `projectId`).
- Personal ↔ Enterprise, en ambos sentidos.
- El resumen operacional cuenta solo el workspace activo.

## 7. Inicio Enterprise y chat

**Inicio** (`/company/:companyId`): bajo los datos de la marca, la sección **"Trabajo de la marca"**
(`BrandWorkSection`) con los mismos contadores y listas que el Inicio Personal (proyectos activos,
tareas pendientes con vencidas, contenido en producción; próximas tareas, proyectos recientes,
contenido próximo) y el CTA **Nuevo proyecto** → `/workspace/:workspaceId/projects?new`. Solo datos
reales: sin "Pixel recomienda" (no hay Daily Director Enterprise).

**Chat**: `EnterpriseContextBuilder` añade un estado operativo compacto
(`getOperationsStatus`, zona horaria del workspace) con **solo conteos**:

```
Estado del trabajo de TINTO (solo conteos …):
- Proyectos activos: 3
- Tareas pendientes: 8 (vencidas: 1)
- Contenido en curso: 4
No ves nombres, fechas ni el detalle … no lo inventes … el detalle está en Proyectos, Tareas o Contenido.
<operations_status>{"activeProjects":3,…}</operations_status>
```

- Nunca entran nombres, títulos ni listas (ni de este workspace ni de otro).
- "¿Cómo vamos con el lanzamiento?" → responde con los conteos reales. "¿Cómo va la campaña
  Navidad?" o "dime todas las tareas" → no inventa: dice que desde el chat solo ve conteos y que el
  detalle está en las secciones. Sin tools ni retrieval todavía.
- El proveedor demo lo implementa con `composeOperationsReply` (detecta `OPERATIONS_QUESTION`).
- El chat Personal no cambia (sigue usando su dirección del día).

## 8. Rutas y convergencia

| Ruta | Pantalla |
|---|---|
| `/company/:companyId` | Inicio de la empresa (+ Trabajo de la marca) |
| `/company/:companyId/{brand,pixel,chat,onboarding}` | ADN, personaje, chat y onboarding (sin cambios) |
| `/workspace/:workspaceId/projects[/:projectId]` | Proyectos de la marca (pantalla compartida) |
| `/workspace/:workspaceId/tasks` | Tareas |
| `/workspace/:workspaceId/content` | Contenido |
| `/workspace/:workspaceId/content-planner` | No existe en Enterprise: redirige al Inicio de la empresa |

Navegación Enterprise (en ambas familias de rutas): **Inicio · Trabajo** (Proyectos, Tareas,
Contenido) **· Marca** (ADN de marca, Personaje, Chat). Sin Campañas hasta el Prompt 13.

Estrategia (`docs/WORKSPACES.md`): **toda funcionalidad nueva es workspace-first**. `WorkspaceLayout`
deja en `/workspace/:workspaceId` las rutas cuya funcionalidad Enterprise admite
(`enterpriseStaysInWorkspace`) y redirige el resto a `/company/:companyId`. Las pantallas de marca se
moverán después, una a una; no se crearon rutas `/company/:companyId/projects` ni endpoints
`/api/companies/:id/projects`.

## 9. Limitaciones

- Sin Campaign, aprobaciones, equipo, roles, responsables ni Brand Guardian.
- Sin Content Planner IA ni Daily Director para Enterprise.
- El chat solo conoce conteos: no lista ni busca proyectos o tareas.
- Sin integraciones externas ni acciones automáticas.
- Las pantallas de marca siguen en `/company/:companyId` (dos familias de rutas conviven).

## 10. Preparación para Campaign Manager (Prompt 13)

```
BrandDNA → Campaign → Projects → Tasks
                          └────→ ContentItems
```

- `Campaign` será una entidad estratégica nueva del workspace (`workspaceId` + `tenantScoped`), no
  un tipo de Project.
- Relación prevista: `Project.campaignId` y `ContentItem.campaignId` opcionales (índice
  `{ workspaceId, campaignId }`), validados contra el mismo workspace como hoy `projectId`. Sin
  reescribir Operations ni migrar datos.
- Nueva capacidad `campaigns` en la tabla (Enterprise ✅) y el grupo "Campañas" en `enterpriseNav`.
- El chat podrá recibir el resumen de UNA campaña cuando exista retrieval acotado.
