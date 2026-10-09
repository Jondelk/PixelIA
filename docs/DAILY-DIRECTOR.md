# Daily Director — la dirección del día

Prompt 11. Pixel deja de solo responder: al abrir **Inicio**, analiza el estado real del trabajo
de la persona y propone qué merece atención hoy, qué puede esperar, qué se está quedando atrás,
qué contenido conviene mover y cómo organizar el día en bloques. **Son recomendaciones**: el Daily
Director nunca modifica tareas, proyectos ni contenido.

| | Pregunta que responde |
|---|---|
| Tareas (Task Manager) | ¿Qué tengo pendiente? |
| **Daily Director** | ¿Qué merece mi atención hoy y por qué? |
| Chat | Lo que la persona pregunte (reactivo); puede apoyarse en la dirección del día |

Código: `apps/api/src/modules/daily-director/`, `packages/contracts/src/{dailyBrief,timezone}.ts`,
`apps/web/src/features/daily-director/`.

## 1. Pipeline

```
Datos del workspace ──► DailyDataCollector        (consultas acotadas, solo lectura)
                    ──► PriorityScorer            (puntuación determinística y legible)
                    ──► ProjectHealth / ContentHealth
                    ──► DailyAnalysis             (hechos, avisos, refs TASK_1…)
                    ──► DailyDirectorEngine ──► AIProvider (salida estructurada, Zod)
                                            └─► fallback determinístico
                    ──► validación (refs, fundamento, lo crítico)
                    ──► DailyBrief persistido (versión del día)
```

**La IA interpreta; el backend controla los hechos.** Títulos, urgencias, minutos, avisos, conteos
e ids los pone el backend. La IA solo elige entre candidatos reales (por referencia) y redacta.

## 2. DailyBrief (`daily_briefs`)

Recurso del **workspace** (`tenantScoped` por `workspaceId`), reutilizable en Enterprise
(`contextType`). Es un resultado **derivado**: no tiene PATCH ni DELETE.

| Campo | Notas |
|---|---|
| `workspaceId`, `contextType` | Hoy siempre `personal` |
| `localDate`, `timezone` | Día local `YYYY-MM-DD` en la zona horaria del workspace |
| `version` | Regenerar crea la siguiente versión del día; se devuelve siempre la última |
| `personalDnaVersion` | ADN con el que se generó |
| `generationMode` | `ai` · `deterministic` |
| `summary` | Primera frase útil y basada en hechos |
| `priorities` | Hasta 3 (`rank`, `type` task/project/content, `resourceId`, `title`, `rationale`, `suggestedAction`, `urgency`). **Nunca se rellenan** |
| `warnings` | Avisos de hechos (`overdue`, `deadline`, `overload`, `stalled_project`, `content_gap`…) con `relatedResourceIds` |
| `contentSuggestion` | Pieza existente → propuesta de un plan → proyecto convertible. Nunca una idea nueva |
| `focusBlocks` | Bloques **ordenados, sin horario** (`order`, `title`, `objective`, recurso). `suggestedMinutes` solo si sale de `estimatedMinutes` |
| `closingNote` | Opcional |
| `facts` | `openTasks`, `overdueTasks`, `dueToday`, `dueTomorrow`, `activeProjects`, `activeContent` |
| `generation` | `provider`, `model`, `latencyMs`, `inputTokens`, `outputTokens` (base para medir coste), `fallbackReason` (`demo` · `ai_unavailable` · `invalid_output` · `no_work`), `sanitizedFields` |
| `fingerprint` | Conteos para detectar borrados (interno) |
| `contextSnapshotAt`, `generatedAt` | Cuándo se leyó el estado / cuándo se generó |

Índice único `{ workspaceId, localDate: -1, version: -1 }`. Sirve para la versión vigente (prefijo +
`version` desc), para el historial (prefijo `workspaceId`) y para que dos generaciones nunca escriban
la misma versión.

## 3. Zona horaria

"Hoy" es el día local del **workspace**, nunca UTC.

- `Workspace.timezone`: zona IANA explícita (`America/Bogota`), editable con
  `PATCH /api/workspaces/:id { timezone }`. Se valida con `Intl` y una zona inválida es un 400.
- Si no hay una, se usa `DEFAULT_TIMEZONE` del servidor (variable de entorno; por defecto
  `America/Bogota`). Es el fallback documentado.
- **Nunca** se infiere de `PersonalProfile.location` (texto libre).
- La web propone, sin imponer, usar la zona del navegador ("Usar la mía") cuando el workspace no
  tiene zona y la del navegador es distinta.
- Las fechas de tareas y contenido siguen guardándose como el mediodía local en UTC (Operations).
  Su día se calcula en la zona del workspace (`localDateIn`, `daysUntil`).

## 4. DailyDataCollector

Solo lee, siempre filtrando por `workspaceId`, con límites (`DAILY_COLLECT_LIMITS`):

| Datos | Límite |
|---|---|
| Proyectos `active`/`planned` (con progreso y última actividad de sus tareas y contenido) | 20 |
| Tareas abiertas con fecha (ordenadas por fecha: vencidas y próximas primero) | 100 |
| Tareas abiertas sin fecha (más recientes) | 60 |
| Tareas completadas en los últimos 7 días | 10 |
| Contenido no publicado (recientes + con fecha) | 60 + 40 |
| Planes `draft`/`active` y sus propuestas pendientes | 3 / 20 |

Al modelo solo llegan los mejor puntuados (`DAILY_CONTEXT_LIMITS`): 12 tareas, 6 proyectos,
6 contenidos y 5 propuestas, más los conteos totales.

## 5. PriorityScorer (determinístico)

| Señal | Tarea | Contenido (no publicado) |
|---|---|---|
| Vencida / prevista y pasada | +40 (+2 por día, máx. +10) | +35 (+2 por día, máx. +10) |
| Hoy | +35 | +30 |
| Mañana | +25 | +22 |
| En ≤ 3 días | +15 | +12 |
| En ≤ 7 días | +8 | +6 |
| Prioridad alta / media | +20 / +10 | — |
| Estado | en curso +8 · inbox −3 | lista +12 · revisión +8 · producción +6 · planificada +4 |
| Proyecto en riesgo / necesita atención | +12 / +6 | +6 (en riesgo) |

Urgencia: ≥ 60 **crítica** · ≥ 40 alta · ≥ 20 media · resto baja. Ejemplos: vencida + alta = 60+
(crítica); vence hoy + alta = 55 (alta); alta para la semana próxima = 28 (media).

No hay modelo de dependencias entre tareas, así que "bloquea a otra" no se puede saber y **no se
afirma**. El plazo del proyecto actúa como señal de impacto. Las propuestas de un plan solo puntúan
por su fecha sugerida.

## 6. ProjectHealth y ContentHealth

**ProjectHealth** (proyectos `active`/`planned`):
- **at_risk**: venció con tareas abiertas · vence en ≤ 1 día con ≥ 2 abiertas · vence en ≤ 3 días con ≥ 4.
- **attention**: vence en ≤ 3 días con alguna abierta · vence en ≤ 7 días con ≥ 5 · activo sin
  actividad en ≥ 14 días (estancado).
- **healthy**: lo demás. **Sin fecha límite no se infiere ningún riesgo de plazo.**

**ContentHealth**: detecta lo previsto y pasado, lo listo sin publicar, lo previsto en ≤ 3 días y la
falta de contenido previsto o en marcha en 7 días.
- Esa falta solo se convierte en el aviso `content_gap` si el contenido es relevante para la
  persona: `wantsHelpWith` menciona contenido, redes, marca personal, comunidad…, o tiene
  `goals.content`.
- El contenido que la persona fijó y ya pasó **siempre** se avisa: es un hecho, no una idea.

## 7. Personalización (PersonalDNA)

Usa `goals`, `workStyle`, `supportNeeds`, `contentIdentity`, `preferences` y `restrictions`.

| Forma de trabajar (`workStyle`) | Bloques de enfoque |
|---|---|
| "trabajo profundo", "una cosa a la vez", "pocas tareas"… → `deep` | Máx. 2 (lo que no cabe se agrupa en el último) |
| sin indicación → `balanced` | Máx. 3 |
| "sesiones cortas", "sprints cortos", "pomodoro"… → `short` | Máx. 4 (añade el siguiente candidato) |

- **Contenido**: si no es un área de ayuda, no se fuerza una recomendación de contenido cada día
  (salvo contenido urgente que la propia persona programó).
- Los mismos hechos producen las mismas prioridades y urgencias. La dirección, en cambio, cambia
  con la persona: los bloques, la sugerencia de contenido y el resumen (cubierto por tests).

## 8. DailyDirectorEngine y salida estructurada

`createDailyDirectorEngine({ ai, logger }).generate(analysis)`:

| Caso | Resultado |
|---|---|
| Sin trabajo registrado | Determinístico (`no_work`), sin llamar a la IA: "Aún no tienes suficiente trabajo registrado…" + CTA "Crear una tarea" |
| Proveedor demo | Determinístico (`demo`) |
| IA real | `generateStructuredOutput` con `DailyBriefGenerationSchema` y `DAILY_SYSTEM` |
| IA caída / error | Determinístico (`ai_unavailable`) |
| Salida inválida o referencia desconocida | Determinístico (`invalid_output`): **nunca se guarda un brief corrupto** |

`DailyBriefGenerationSchema` (Zod) contiene:
- `summary`;
- `priorities` (≤ 3): `{ ref, rationale, suggestedAction }`;
- `contentSuggestion`: `{ ref, reason, suggestedAction }` o null;
- `focusBlocks` (≤ 4): `{ title, objective, ref }`;
- `closingNote`.

**No** incluye títulos, urgencias, minutos ni avisos.

## 9. Anti-alucinación

1. **Referencias controladas**:
   - Antes de llamar al modelo, cada elemento recibe una referencia (`TASK_1`, `PROJECT_2`,
     `CONTENT_1`, `PLANITEM_1`), y la IA nunca ve los ObjectId.
   - Una referencia desconocida (`TASK_999`), repetida o del tipo equivocado invalida toda la salida
     → fallback.
2. **Fundamento del texto**: `unfoundedClaims` (Content Planner) + `dailyClaims` detecta:
   - cifras y nombres propios ausentes del contexto ("Nike");
   - reuniones, llamadas o eventos (salvo que estén en una tarea real: "Preparar reunión con TINTO");
   - horas del día ("a las 10:00");
   - duraciones ("3 horas");
   - tiempo libre ("tienes la tarde libre").

   El campo afectado se sustituye por su versión determinística: frase a frase en el resumen, el
   rationale o el bloque completo en los demás. Se cuenta en `sanitizedFields`. Un rationale
   genérico ("Es importante.") también se sustituye.
3. **Lo crítico nunca se omite**: si la IA deja fuera un candidato de urgencia crítica, entra
   **primero** en las prioridades.
4. **Avisos 100 % determinísticos**: la IA no puede inventarlos ni ocultarlos.

## 10. Persistencia, stale y concurrencia

- **Un brief vigente por workspace y día**. `GET` nunca regenera: el refresco devuelve el mismo
  brief y no llama a la IA (cubierto por test).
- **Stale**: al responder se comprueba si alguna tarea, proyecto, contenido o propuesta tiene un
  `updatedAt` posterior a `contextSnapshotAt`, o si cambió la huella de conteos (borrados). Si es
  así, responde `stale: true` y la UI muestra "Hay cambios en tu trabajo desde esta recomendación.
  [Actualizar]".
  - **No se regenera automáticamente** al cambiar una tarea (sería gasto de IA innecesario).
  - Coste: 6 consultas pequeñas por `GET`.
- **Doble clic**: hay un candado en memoria por `workspaceId:localDate`, así que dos "generar"
  simultáneos comparten la misma generación. Además, el índice único con reintento evita
  versiones duplicadas.
  - El candado es por proceso: con varias instancias, el índice sigue garantizando la integridad,
    pero podrían hacerse dos llamadas a la IA.
- **Cambio de día**: al cambiar el día local, el `GET` responde 404 `daily_brief_not_generated` y el
  Inicio genera la del nuevo día una vez.

## 11. Endpoints

Todos bajo `requireAuth` + `requireWorkspaceAccess` (workspace ajeno → **404**).

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/workspaces/:id/daily-brief` | `{ brief, stale }` · 404 `daily_brief_not_generated` |
| POST | `/api/workspaces/:id/daily-brief/generate` | 201 `{ brief, stale: false }` (nueva versión del día) |
| GET | `/api/workspaces/:id/daily-briefs?limit&offset` | `{ briefs, total }` (todas las versiones, el día más reciente primero) |
| GET | `/api/workspaces/:id/daily-briefs/:briefId` | `{ brief }` · 404 `daily_brief_not_found` |

Errores: `personal_context_not_configured` (409, sin PersonalDNA) · `feature_not_available`
(400, workspace Enterprise) · `daily_brief_generation_failed` (500, error inesperado) ·
`daily_brief_not_generated` / `daily_brief_not_found` (404).

**Logs estructurados**:
- `daily_brief_generation_started`, `_completed` (con `provider`, `model`, `mode`,
  `fallbackReason` y `sanitizedFields`), `_failed`;
- `daily_brief_fallback_used`;
- `daily_brief_ai_failed` y `daily_brief_invalid_refs`.

Nunca se registra el PersonalDNA ni el contenido de las tareas.

## 12. Frontend (Inicio Personal)

La primera sección del Inicio es **TU DÍA** (`DailyDirector` → `DailyDirectorView`):
- **Cabecera**: el personaje de la persona (estado `thinking` mientras genera, `idle` al mostrar).
  En móvil se oculta para dejar espacio al texto. Al lado, "Tu día · Hola, {nombre}" y el resumen
  como titular.
- **Actualización**: "Actualizado hace X", el modo de generación dicho con honestidad ("Dirección
  básica, calculada con tus fechas y prioridades (sin IA)") y **Actualizar dirección**.
- **Prioridades**: tarjetas `01`/`02`/`03` con urgencia, título, porqué, acción sugerida y "Ver
  tarea / proyecto / contenido". No hay detalle de tarea: el enlace va a Tareas. Nada se completa
  desde aquí.
- **Requiere atención**: solo si hay avisos.
- **Contenido**: solo si hay sugerencia, con "Abrir contenido / Ver en el plan / Ver proyecto".
- **Enfoque recomendado**: "Bloque 1, 2…", sin horas; minutos solo "≈ N min, según tu estimación".
- **Estados**: carga, generación (se genera **una vez** si no hay dirección hoy), error con
  reintento, stale con "Actualizar" y sin trabajo con "Crear una tarea".
- **Responsive**: las prioridades van en una columna en móvil y en tres en escritorio.
- Después siguen el resumen operacional (contadores), Tu Pixel, el ADN y el Chat.

## 13. Chat

El `PersonalContextBuilder` añade **solo la dirección vigente de hoy**, nunca el historial:
- su resumen, prioridades, avisos, contenido y bloques;
- un aviso si quedó desactualizada;
- la instrucción de responder desde ella a "¿qué hago primero?", "¿qué es urgente?" o "¿qué estoy
  dejando atrás?".

El chat **no puede** modificar nada: si se le pide marcar una tarea como hecha, lo dice y remite a
Tareas (sin herramientas de acción todavía). El proveedor demo responde a esas preguntas desde la
dirección (`composeDailyReply`).

## 14. Seguridad y aislamiento (cubierto por tests)

- B recibe 404 al leer, generar, ver el historial o pedir por id cualquier brief de A, y el brief de
  A nunca contiene tareas de B.
- `tenantScoped` en `DailyBrief`: sin un `workspaceId` concreto, o con operadores, falla.
- El engine solo recibe datos del workspace activo; las referencias impiden apuntar a recursos que
  no estén en ese contexto.

## 15. Límites

- La generación es síncrona. Sin cron ni notificaciones: se genera al abrir Inicio o al pulsar
  "Actualizar dirección".
- No hay dependencias entre tareas ni calendario: los bloques son un orden, no una agenda.
- La detección de alucinaciones es heurística, como la del Content Planner: no ve un nombre propio
  al inicio de frase.
- La comprobación de stale es por proceso de petición (6 consultas).
- **Pendiente con `ANTHROPIC_API_KEY`**: probar `DAILY_SYSTEM` con Claude real. Hoy, en local, el
  Daily Director siempre usa el fallback (`demo`).

## 16. Evolución

- **Enterprise**: el mismo `DailyBrief` (`contextType: enterprise`) con BrandDNA, proyectos y
  campañas de la marca. Hoy responde `feature_not_available`.
- **Acciones con consentimiento** desde el brief o el chat (completar, reprogramar), con
  confirmación explícita.
- **Calendario**: convertir bloques en franjas horarias solo cuando haya un calendario
  conectado.
- **Memoria creativa**: aprender de qué prioridades se siguen y qué propuestas se rechazan.
- Usar el historial de briefs para comparar días y detectar patrones (sin analytics invasivos).
