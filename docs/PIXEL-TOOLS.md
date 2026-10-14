# Pixel Tools (Prompt 18)

Las herramientas son **adaptadores controlados** sobre servicios que ya existen (hoy) o sobre APIs
externas (después). No son function calling de un proveedor de IA ni MCP: el backend decide qué
herramientas y capacidades existen, qué entrada es válida, quién puede actuar y qué se ejecuta. El
flujo completo está en [`PIXEL-ACTIONS.md`](./PIXEL-ACTIONS.md).

Código: `apps/api/src/modules/actions/` (`action.types.ts`, `toolRegistry.ts`,
`authorization.policy.ts`, `capability.catalog.ts`, `external.capabilities.ts`, `tools/`).

## 1. PixelTool

```ts
interface PixelTool {
  key: string;                 // estable, no ligada a rutas HTTP: 'workspace.tasks', 'google.calendar'
  name: string;
  description: string;
  contextTypes: ('personal' | 'enterprise')[];
  feature?: WorkspaceFeature;  // capacidad de contracts que exige (además del tipo)
  capabilities: ToolCapabilityDefinition[];
  availability(ctx): 'available' | 'requires_auth' | 'disconnected' | 'unavailable';
}
```

## 2. Capacidad

```ts
interface ToolCapabilityDefinition<I, O> {
  key: string;                    // 'create_task'
  description: string;            // lo que verá la IA (sin claves)
  inputSchema: ZodType<I>;        // el schema REAL del servicio (CreateTaskSchema…)
  outputSchema?: ZodType<O>;
  effect: 'read' | 'create' | 'update' | 'delete';
  target: 'internal' | 'external';
  resourceKind: PixelResourceKind;
  significant?: boolean;          // update que exige confirmación
  financial?: boolean;            // dinero: nunca en esta etapa
  reversible?: boolean;
  sensitive?: boolean;
  refFields?: Record<string, PixelResourceKind>; // campos que puede rellenar otra acción
  execute(input, ctx): Promise<ToolExecutionResult<O>>;
  verify(result, input, ctx): Promise<boolean>;   // relee con { _id, workspaceId }
}
```

`ToolExecutionContext`: `workspace` (autorizado por la ruta), `contextType`, `actorUserId`,
`commandId`, `executionId`, `idempotencyKey` (`commandId:revision:actionId`).
`ToolExecutionResult`: `status`, `summary`, `resourceRefs` (`{ kind, id, label }`), `output?`,
`errorCode?`. Sin secretos.

## 3. Registro

`PixelToolRegistry`: `register`, `get`, `availability`, `listAvailable`, `resolve(tool, capability,
workspace)` → `{ tool, capability, authorization }` o `null`. Distingue **registrada** (existe),
**disponible** (tipo de workspace + capacidad de contracts) y **conectada** (`availability` de la
herramienta). Rechaza al registrar capacidades duplicadas o financieras. Producción:
`createDefaultToolRegistry()` (`tools/index.ts`); en tests se inyecta otro con `createApp({ tools })`.

## 4. Política de autorización

| Efecto | Interno | Externo |
|---|---|---|
| read | none | none (conexión ya autorizada) |
| create | confirm («Organizar») | confirm |
| update significativo | confirm | confirm |
| update menor | none | confirm |
| delete | confirm | elevated |
| financiero | unsupported | unsupported |

La confirmación única del plan cubre `none` y `confirm`. `elevated` exigiría una confirmación
reforzada que V1 no ofrece (no se ejecuta). `unsupported` nunca. La política es determinista: ni la
IA ni el Brand Guardian la deciden.

## 5. Herramientas V1 (internas)

| Herramienta | Capacidad | Servicio | Verificación |
|---|---|---|---|
| `workspace.projects` | `create_project` (`CreateProjectSchema`) | `projects.service.createProject` (idempotente por `actionKey`) | Relee el proyecto `{ _id, workspaceId }` y compara el nombre y la clave de la acción |
| `workspace.tasks` | `create_task` (`CreateTaskSchema`, `refFields: { projectId }`) | `tasks.service.createTask` (`source: pixel`, idempotente por `actionKey`) | Relee la tarea y compara título, proyecto y la clave de la acción |
| `workspace.tasks` | `update_task` (`{ taskId, changes: UpdateTaskSchema }`, significativo) | `tasks.service.updateTask` | Relee y compara cada campo cambiado |

Sin CRUD propio: las reglas (proyecto del mismo workspace, `completedAt`, fechas) son las del
servicio. `update_task` está registrada, probada y lista, pero **ningún flujo de PixelCommand la
propone todavía** (no hay una intención de editar tareas).

## 6. Añadir una herramienta (Prompt 19: Google Calendar)

1. Escribir `tools/googleCalendar.tool.ts` con `key: 'google.calendar'` y sus capacidades
   (`read_events` y `find_availability` → `read`; `create_event` y `update_event` → `create` /
   `update`, `target: 'external'`), cada una con su schema, `execute` y `verify` (releer el evento).
2. Creación idempotente por `ctx.idempotencyKey` (la de la API externa o una marca en el recurso),
   como las internas (`PIXEL-ACTIONS.md` §8).
3. `availability`: `requires_auth` hasta que el usuario conecte su cuenta (las credenciales se
   resuelven en el servidor; nunca en el snapshot ni en los resultados).
4. Registrarla en `createDefaultToolRegistry()`.
5. Un expansor o el planificador de IA (§7) para traducir la solicitud a acciones.

PixelCommand, la confirmación, el ejecutor, la verificación y los resultados no cambian. La
respuesta honesta de `external.capabilities.ts` cambia sola: de «no tengo acceso» a «conecta tu
Google Calendar» y, conectada, a la propuesta.

## 7. Catálogo para la IA

`buildCapabilityCatalog(registry, workspace, { effects })` da solo lo **relevante y disponible**;
`catalogForAI` lo reduce a `{ ref: 'CAPABILITY_n', description, requiresConfirmation }` (sin claves
ni ids). La IA devuelve `GeneratedActionPlanSchema` (contracts): `responseMode` (`answer |
proposal`) y acciones con `capabilityRef`, `title`, `input` (con recursos como `PROJECT_n`) y
`dependsOn`. `resolveActionDrafts` rechaza —y no propone NADA— si una referencia no está en el
catálogo (`CAPABILITY_999`, `send_whatsapp`), una dependencia no es anterior, un recurso no está en
el contexto o una entrada no valida. Nunca inventa un dato que falte.

**V1:** los pasos los sigue construyendo el planificador determinista de PixelCommand (sin llamada
extra a la IA por solicitud). Catálogo y resolución están probados y listos para cuando una solicitud
necesite IA para traducirse (eventos de calendario).

## 8. Lo que no se implementa

Google Calendar, OAuth, Gmail, Drive, Slack, CRM, Meta, publicación, Ads, pagos, compras, webhooks,
schedulers, automatizaciones recurrentes, notificaciones, equipos, roles, aprobaciones formales,
agentes autónomos ni multiagente.
