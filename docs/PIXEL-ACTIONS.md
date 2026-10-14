# Pixel Action Foundation (Prompt 18)

> «Pixel must distinguish between answering, planning and acting.»
> «Not every request should execute an action.»
> «Pixel must never claim an action was completed unless execution evidence confirms it.»
> «Important persistent or external actions require explicit user authorization.»
> «Tools extend Pixel. They do not replace PixelCommand.»
> «AI proposes. Backend validates and executes.»

La infraestructura común para **proponer → autorizar → ejecutar → verificar**. No conecta todavía
ningún servicio externo: demuestra el recorrido completo con herramientas internas reales (proyectos
y tareas) y deja el contrato para que el Prompt 19 añada Google Calendar sin reconstruir PixelCommand.
Las herramientas se describen en [`PIXEL-TOOLS.md`](./PIXEL-TOOLS.md).

Código: `apps/api/src/modules/actions/` y su integración en `modules/pixel-command/`.

## 1. Decisión principal: PixelActionPlan ES la propuesta

La auditoría encontró que PixelCommand ya tenía casi todo: `PixelActionPlan` (lo que Pixel propone,
en lenguaje humano), `revision` (confirmar exige la revisión vista), reserva atómica con
`executionId`, estados `completed | partial | failed` y recursos por paso. Por eso **no se creó un
segundo agregado `ActionProposal` ni una segunda máquina de estados**:

| Concepto de producto | Implementación |
|---|---|
| ActionProposal | `PixelCommand.plan` (PixelActionPlan) + `plan.actions` (cada acción en lenguaje humano) |
| Autorización | La confirmación de siempre («Organizar») con su revisión, ahora con `authorizedBy` / `authorizedAt` |
| Snapshot autorizado | `PixelCommand.authorization` (embebido, inmutable) |
| ActionExecution | La ejecución reservada por `executionId` + `executionStartedAt` / `executionUpdatedAt` |
| ActionResult | `PixelCommand.actionResults[]` (embebidos) |
| Estado externo | **Solo `PixelCommand.status`** (`completed`, `partial`, `failed`); no hay `partially_completed` |

El frontend sigue recibiendo todo por el PixelCommand: no coordina dos APIs.

```
PixelCommand ─ intención + contexto ─▶ PixelActionPlan (pasos humanos)
                                          │  «Organizar» (revisión N, usuario de la sesión)
                                          ▼
                              Snapshot autorizado (acciones congeladas)
                                          ▼
                     ActionExecutor ─▶ PixelToolRegistry ─▶ PixelTool.capability
                                          ▼                        │
                                   verificación ◀──────────────────┘
                                          ▼
                              ActionResult[] ─▶ PixelCommand.status + respuesta veraz
```

## 2. Responsabilidades

| Pieza | Responde a |
|---|---|
| PixelCommand | El ciclo de vida de la solicitud y la conversación |
| PixelActionPlan | Qué propone Pixel |
| PixelActionStep | Unidades humanas del plan («Crear 3 tareas») |
| Snapshot autorizado | Qué se autorizó EXACTAMENTE (y quién, cuándo) |
| PixelTool / capacidad | Cómo se hace (adaptador sobre un servicio) |
| ActionAuthorizationPolicy | Si la confirmación del plan basta |
| ActionExecutor | La ejecución controlada |
| ActionResult | Qué pasó de verdad |
| Verificación | Si el efecto existe |
| Creative Memory | Cómo prefiere trabajar el usuario (no es un registro de acciones) |
| Brand Guardian | Coherencia de marca y de hechos (no es autorización) |

## 3. De pasos a acciones

Los pasos **migrados** se expanden en acciones (`action.snapshot.ts`, un mapa de expansores, sin
`switch`):

- `create_project` → 1 acción `workspace.projects/create_project`;
- `create_tasks` → **una acción por tarea** `workspace.tasks/create_task`. El paso humano («Crear 3
  tareas») se conserva y el resultado es por tarea: ✓ ✓ ✕ ✓.

Los demás pasos (`generate_campaign`, `generate_content_plan`, `create_content_item`,
`remember_memory`, `forget_memory`) siguen por el ejecutor anterior **sin cambios** (su plan tiene
`actions: []`). Migrarlos es trabajo futuro, uno a uno.

## 4. Snapshot autorizado (inmutable)

`PixelCommand.authorization = { revision, authorizedBy, authorizedAt, actions[] }`. Cada acción:
`id`, `stepId`, `toolKey`, `capabilityKey`, `kind`, `effect`, `target`, `authorization`, `title`,
`label`, `input`, `inputRefs`, `dependsOnActionId`.

- Se construye **antes** de reservar (con el plan de esa revisión) y se escribe **en la misma
  operación atómica** que reserva la ejecución. El filtro exige que no hubiera snapshot (o que sea de
  esa misma revisión): nunca se pisa.
- `authorizedBy` es `getAuth(req).userId`: el cuerpo de `/confirm` es estricto (`{ revision }`), así
  que `authorizedBy`, `workspaceId`, `toolKey` o acciones enviadas por el cliente → 400.
- Validación previa: cada acción debe existir en el registro, estar disponible en el workspace,
  quedar cubierta por la confirmación del plan y tener entrada válida para su capacidad. Si una falla
  → 409 (`action_capability_unavailable`, `action_unauthorized` o `action_invalid_input`) y **no se
  ejecuta nada**; la propuesta sigue en `proposed`.
- Un ajuste («Quita la segunda») crea la revisión N+1 **antes** de confirmar. Tras autorizar,
  ajustar responde 409 (`pixel_command_not_adjustable`): cambiar exige otra propuesta.
- Un reintento usa el MISMO snapshot.

## 5. Dependencias

Una tarea del proyecto recién creado lleva `dependsOnActionId: 'step_1.project'` e
`inputRefs: [{ field: 'projectId', fromAction: 'step_1.project', kind: 'project' }]`. El ejecutor
rellena el campo con el recurso **verificado** de esa acción; nunca hay interpolación de texto. La
capacidad declara qué campos admite así (`refFields`). Ejecución **secuencial** (V1).

- Si la acción de la que depende no salió bien → `skipped` con `dependency_failed` (nunca se crea una
  tarea sin su proyecto).
- Un fallo **no detiene** las acciones independientes: Tarea 2 falla y la Tarea 3 sigue.

## 6. Ejecutor y resultados

`ActionExecutor` (`action.executor.ts`), por acción:

1. ya `success` en esta revisión → se conserva (idempotencia del reintento);
2. dependencia → `dependency_failed`;
3. herramienta y capacidad resueltas y disponibles → si no, `tool_unavailable` /
   `capability_unavailable`;
4. autorización cubierta por la confirmación → si no, `unauthorized`;
5. referencias resueltas y entrada validada con el schema de la capacidad → si no, `invalid_input`;
6. ejecución con límite de tiempo (`ACTION_TIMEOUT_MS`, 30 s; no cancela el trabajo de la
   herramienta, solo la deja de esperar);
7. salida validada si la capacidad declara `outputSchema`;
8. **verificación**: sin verificación positiva → `verification_failed`.

Cada resultado se persiste al producirse (filtrado por `executionId`). `ActionResult`: `actionId`,
`stepId`, `revision`, `toolKey`, `capabilityKey`, `status` (`success | failed | skipped`), `verified`,
`summary`, `resourceRefs`, `errorCode`, `executionId`, `executedAt`. Se guarda el último intento de
cada acción.

### Errores normalizados

`tool_unavailable` · `capability_unavailable` · `unauthorized` · `invalid_input` ·
`resource_not_found` · `resource_conflict` · `execution_failed` · `verification_failed` ·
`dependency_failed` · `execution_interrupted`. Al frontend solo llega un texto humano
(`ACTION_ERROR_TEXT`), nunca un stack ni el código.

## 7. Lenguaje veraz

La respuesta de Pixel sale de los resultados (`action.report.ts`), nunca de la IA:

| Resultado | Respuesta |
|---|---|
| Todo verificado | «Listo. Creé el proyecto «X» y sus 3 tareas: …» |
| Parcial | «Creé el proyecto «X» y 2 de las 3 tareas. No pude crear «B». Puedes reintentarlo…» |
| Verificación fallida | «No pude confirmar que «C» se creara.» |
| Proyecto fallido | «No pude crear el proyecto «X», así que no creé sus 3 tareas. No se creó nada.» |

Antes: «Creo el proyecto…» (propuesta). Durante: «Pixel está organizándolo…». Después: el resultado.

## 8. Idempotencia y bloqueo

Se reutiliza lo que ya funcionaba: reserva atómica por estado + `revision` + `executionId`; una
segunda confirmación devuelve `executed: false`; todas las escrituras de la ejecución filtran por su
`executionId`. Encima, el ejecutor salta las acciones con `success` de la misma revisión. Probado: dos
POST simultáneos → 1 ejecución, 1 proyecto, 3 tareas (API y doble clic en el navegador).

### Idempotencia del EFECTO (crear proyecto / crear tarea)

Lo anterior no cubre una caída entre que el servicio crea el recurso y que se guarda su resultado. Por
eso cada acción tiene una clave estable, `ToolExecutionContext.idempotencyKey =
commandId:revision:actionId` (igual en reintentos y recuperación: el snapshot no cambia), y la
creación es idempotente por ella:

- Project y Task tienen un campo técnico opcional `pixelActionKey` (lo fija solo el servidor al
  ejecutar una acción; los schemas de la API son estrictos, nadie lo envía; no sale en ningún DTO).
- Índice **único parcial** `{ workspaceId: 1, pixelActionKey: 1 }` con
  `partialFilterExpression: { pixelActionKey: { $type: 'string' } }`
  (`workspace_pixel_action_key_unique`): lo creado a mano (sin clave) no entra.
- Antes de crear, `findProjectByActionKey` / `findTaskByActionKey` buscan con `{ workspaceId,
  pixelActionKey }`: si existe, no se crea otro; la herramienta lo devuelve, se verifica y el
  resultado `success` se reconstruye («ya lo había creado esta acción»).
- Dos creaciones simultáneas de la misma acción: la segunda choca con el índice (E11000) y recibe el
  recurso de la primera. No depende de «buscar y luego crear».
- Nunca por nombre o título: dos acciones distintas con el mismo nombre crean dos recursos.
- Siempre con `workspaceId`: la clave de una acción de TINTO nunca encuentra un recurso de INVENTIA.
- La verificación comprueba además que el recurso lleva la clave de ESTA acción.
- `update_task` no lo necesita: repetir la misma actualización deja el mismo estado final.
- **Despliegue (no depende de `autoIndex`):** el índice se crea de forma explícita en dos sitios,
  los dos idempotentes, reiniciables y sin tocar documentos:
  - al arrancar la API, como mantenimiento **crítico** (`startDatabase({ critical })`,
    `db/connection.ts`): `ensureActionKeyIndexes()` (`operations/operations.indexes.ts`) crea los
    índices declarados de Project y Task y COMPRUEBA que `workspace_pixel_action_key_unique` existe
    con exactamente esa clave, único y parcial. Un índice con ese nombre y otra configuración se
    repara (se elimina solo el índice, nunca datos, y se vuelve a crear). **Fail closed:** hasta que
    termina bien, la base no cuenta como lista (`getDatabaseStatus` → `connecting`) y una compuerta
    en `app.ts` responde 503 `database_not_ready` a todo `/api` salvo `/api/health`; si no puede
    garantizarlo (p. ej. datos que ya violan la unicidad), el servidor registra
    `FATAL: índices de idempotencia de Action Foundation no garantizados` con el índice, la colección
    y el motivo, y termina con código 1. Igual en desarrollo y producción; los tests de integración
    inyectan su estado de base y no pasan por el arranque;
  - en `npm run migrate:workspaces` (y con `--sync-indexes`): Project y Task forman parte de
    `EXPLICIT_INDEX_MODELS` (`db/indexedModels.ts`) y el script falla si el índice no queda bien.
  - Al ser parcial, los proyectos y tareas anteriores o manuales (sin clave) no entran: el índice se
    construye sobre datos legacy sin conflictos.

## 9. Recuperación de una ejecución abandonada

Antes, una caída del proceso dejaba el comando `executing` para siempre. Ahora:

- `executionStartedAt` y `executionUpdatedAt` (se actualiza en cada resultado persistido).
- Umbral `STALE_EXECUTION_MS = 5 min` (una acción interna tarda milisegundos; una campaña con IA,
  segundos).
- Al **consultar** el comando o al **confirmar** de nuevo, si lleva más del umbral sin actividad, se
  libera de forma atómica (filtro: `executing` + el `executionId` abandonado + la marca vieja):
  `partial` si algo quedó hecho, `failed` si no, con «La ejecución anterior se interrumpió…» y
  `executionId: null` (el ejecutor viejo ya no puede escribir). Si dos peticiones lo detectan, solo
  una lo libera.
- Reintentar retoma con el mismo snapshot y no repite lo que ya tiene resultado `success`.
- Si el proceso cae justo después de crear un proyecto o una tarea y antes de guardar su resultado,
  el reintento reconoce el recurso por la clave de la acción (§8) y no lo duplica. Una herramienta
  externa futura deberá ofrecer lo mismo (la `idempotencyKey` de su API, o un recurso marcado).
- Sin heartbeat, workers ni scheduler.

## 10. Responder, actuar o reconocer el límite

| Solicitud | Resultado |
|---|---|
| «¿Qué es una campaña?» | Respuesta (`creative_advice`), 0 acciones |
| «¿Cuántas tareas pendientes tengo?» | Lectura en el acto (`work_status`), sin propuesta |
| «Crea un proyecto llamado X y tres tareas: …» | Propuesta con 4 acciones; una confirmación |
| «…y agrega tres tareas.» (sin decir cuáles) | UNA pregunta; nunca tareas inventadas |
| «Pon mañana una reunión en mi Google Calendar» | `external_action`: «Puedo ayudarte a preparar eso, pero todavía no tengo acceso a tu Google Calendar…» |
| «Envíale un correo a Laura» | `external_action`: sin acceso a tu correo |
| «Compra / paga / transfiere…» | `external_action`: «No hago compras, pagos ni transferencias» |

La acción externa no tiene plan, ni snapshot, ni ejecución. La respuesta la decide el registro
(`external.capabilities.ts`): registrar una herramienta conectada cambiaría la respuesta sin tocar
PixelCommand. Las reglas la detectan antes que cualquier otra intención y **mandan sobre la IA**
(saneado del backend), así que «calendario» ya no lleva a un plan de contenido; «calendario de
contenido» sigue siendo planear contenido.

## 11. Seguridad

- El workspace llega autorizado por la ruta; las herramientas lo reciben en el contexto, nunca de la
  entrada (los schemas son estrictos: un `workspaceId` en la entrada no valida).
- Mismo dueño: una propuesta de TINTO con un proyecto de INVENTIA falla (`tasks.service` lo rechaza)
  y no crea nada; el Dock de TINTO no resuelve un recurso de INVENTIA (400).
- Sin endpoint de herramientas: el usuario confirma PixelCommand; el ejecutor usa las herramientas.
- Snapshot y resultados sin secretos: las credenciales de herramientas futuras se resolverán en el
  servidor. Los logs no llevan entradas.
- Política determinista: ni la IA ni el Guardian deciden la autorización.

## 12. Presencia

Sin estado nuevo: `thinking` cubre una ejecución interna (milisegundos). Confirmar → `thinking` →
`success` (todo verificado), `warning` (parcial) o `error` (nada) → `idle`. Un estado `executing`
tendrá sentido con herramientas externas o lentas.

## 13. Persistencia: embebido, no colección aparte

Snapshot y resultados viven **dentro del PixelCommand**:

- **Atomicidad**: la reserva escribe estado + snapshot en una operación; cada resultado se escribe
  junto con los pasos, filtrado por el `executionId` que es dueño de la ejecución.
- **Consulta**: siempre se leen con su comando (mostrar el resultado, reintentar, recuperar); no hay
  consultas transversales que justifiquen otra colección ni índices nuevos.
- **Auditoría**: qué propuso Pixel (plan), quién autorizó y cuándo (snapshot), qué ejecutó y qué
  obtuvo (resultados) — en un documento.
- **Async futuro**: los estados y `executionUpdatedAt` ya sirven; si un día hay ejecuciones largas o
  consultas por herramienta, los resultados pueden pasar a una colección sin cambiar el contrato.
- Rendimiento: 1 escritura por resultado + 1 lectura de verificación por acción; para 4 acciones,
  ~10 operaciones. Sin N+1 adicional.

## 14. Logs

`action.proposed`, `action.authorized`, `action.execution_started`, `action.completed` /
`action.failed` (por acción, con `toolKey`, `capability`, `workspaceId`, `commandId`,
`executionId`, `errorCode`), `action.partial` / `action.completed` / `action.failed` (por comando) y
`action.execution_interrupted`. Nunca entradas ni salidas completas.

## 15. Futuro

- Google Calendar (Prompt 19): registrar `google.calendar` con `read_events`, `find_availability`,
  `create_event`, `update_event` (`PIXEL-TOOLS.md` §6).
- Migrar los pasos anteriores (campaña, plan, pieza, memoria) a herramientas, uno a uno.
- Confirmación reforzada (`elevated`) para borrados externos; voz que autorice («sí, hazlo»): no en V1.
- Pagos y compras: no implementar (la política los marca `unsupported`).
