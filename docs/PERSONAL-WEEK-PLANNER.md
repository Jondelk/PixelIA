# Personal Week Planner (Prompt 19)

Una **capacidad** de Pixel Personal, no una sección nueva: se pide hablando con Pixel
(«Organízame la semana: tengo parcial de cálculo el viernes, el miércoles tengo una reunión familiar
y quiero estudiar tres veces») y usa Google Calendar (`docs/GOOGLE-CALENDAR.md`). Planificar no
escribe nada; guardar es una confirmación.

> Estado: implementado, pendiente de revisión.

## Piezas

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Intenciones | contracts `plan_week`, `replan_block` (capacidad `calendar`) | Solo Personal |
| Intérprete | IA con `WEEK_PLANNING_SYSTEM` + `GeneratedWeekPlanningSchema`; reglas `ai/weekPlanningRules.ts` (demo y respaldo) | Solo lenguaje: horizonte, compromisos, sesiones, ventana y días a evitar |
| Motor de disponibilidad | `modules/calendar/availability.ts` | Puro: unir y restar intervalos, ventanas por día local, huecos, horizontes |
| Planificador | `modules/calendar/weekPlanner.ts` | Determinista: reparte, respeta lo duro y dice lo que no cabe |
| Orquestación | `modules/calendar/weekPlanning.service.ts` | Lee con las capacidades de lectura de `google.calendar`, calcula y propone |
| PixelCommand | `pixelCommand.service.ts` (`usesCalendar`, `calendarFields`) | Propuesta, pregunta, conectar o respuesta |

## Zona horaria

Prioridad: la del Pixel (`Workspace.timezone`) → la del Google Calendar conectado → la del navegador
(`timezone` en la petición, validada) → **preguntar**. Nunca la del servidor y nunca
`America/Bogota` fija. Todo se calcula con luxon en la zona IANA: cambios de horario, ventanas que
cruzan la medianoche y semanas de lunes a domingo. A la IA se le pasan la hora local actual, la zona
y el día de hoy; nunca eventos ni ids.

## Restricciones

- **Duras:** lo ocupado en Google (free/busy), el pasado, la fecha límite (las sesiones terminan
  **antes del día** del parcial) y los propios bloques del plan (nunca se solapan).
- **Blandas:** la ventana horaria (provisional de 8:00 a 21:00 si no la dijo, y se muestra como
  supuesto), los días a evitar, el reparto en días distintos y la hora preferida.
- Un compromiso mencionado **sin hora** deja ese día libre, y Pixel lo dice («Dejé libre el miércoles
  por «Reunión familiar», porque no me dijiste la hora»). Con hora, ocupa 60 min.

## Reglas del plan

- Horizontes: `this_week` (desde ahora hasta el domingo), `next_week` y `next_7_days`.
- Duración estimada de 90 min si no la dijo, marcada en cada bloque y como supuesto: «He reservado
  bloques de 90 minutos porque no indicaste la duración.»
- Bloques en punto o y media, el primer hueco que cabe (o la hora pedida), uno por día por sesión.
- Lo que no cabe va a `unscheduledItems` con su motivo («No encontré otro hueco libre de 90 minutos
  antes del viernes.»). Nunca se crea un conflicto.
- `WeekPlan`: `timezone`, `range`, `assumptions`, `fixedCommitments`, `proposedBlocks`,
  `unscheduledItems`, `conflicts` y `rationale`. La vista (`WeekPlanView`) va en
  `PixelCommand.weekPlan`.

## Propuesta → autorización → escritura

1. `plan_week` → la propuesta: un paso `schedule_blocks` que se expande en **N acciones
   `create_event`** (una por bloque, con su propio resultado). Botones [Guardar semana] [Ajustar].
2. «Ajustar» («Ese bloque del martes pásalo al jueves») crea la revisión N+1, recalculada contra el
   calendario real y dentro del rango del plan. La revisión anterior ya no se puede confirmar.
3. Confirmar congela el snapshot. Si el calendario se desconectó entre medias, no se ejecuta nada
   (409 `action_requires_auth`).
4. Cada acción revalida su hueco antes de escribir (`calendar_conflict` si apareció algo), escribe
   con su id determinista y se verifica releyendo el evento.
5. Resultado: «3 de 3 bloques guardados y comprobados en Google Calendar.», o un parcial
   («Guardé 2 de los 3 bloques. No pude guardar el del martes (…).») con [Reintentar], que no duplica.

## Replanificar (`replan_block`)

- «No pude estudiar (cálculo) hoy» → los bloques de **Pixel** de hoy, filtrados por tema si se
  menciona. Con uno: propone el primer hueco libre desde mañana con la misma duración. Con varios:
  **una** pregunta («¿Cuál bloque muevo: … o …?»).
- «Muévelo al jueves a las 6» → jueves 18:00 (de 1 a 7 sin am/pm se entiende tarde). Si está ocupado,
  lo dice y no cambia nada.
- Solo se mueven eventos con la marca privada de Pixel de este workspace; los demás son
  restricciones. El botón es [Mover bloque] y lo hace `update_event`.

## Lo que no hace

No sincroniza el calendario en Mongo, no muestra un calendario completo, no borra eventos, no
sustituye al Daily Director y no aprende solo. Creative Memory puede informar preferencias (franjas),
pero nunca crea memorias desde aquí. La voz entra por PixelCommand y nunca autoriza («Guardar
semana» es un botón); se mantiene `es-CO`.

## Presencia

thinking (entender y leer) → idle (propuesta) → thinking (guardar) → success, warning (parcial) o
error.

## Relación con «Mi agenda» (Prompt 20)

El planificador **decide**; «Mi agenda» **muestra** (`docs/PERSONAL-AGENDA.md`). Comparten la lectura
(`readCalendar`), la zona (`planningTimezone`) y los rangos (`weekRange` en `availability.ts`, que
ahora también usa `horizonRange`). Nuevo en `replan_block`: **liberar una franja**.

- «El jueves en la tarde no puedo» mueve solo los bloques de Pixel de esa franja (mañana 6–12,
  tarde 12–19, noche 19–24) al primer hueco libre fuera de ella.
- Es un `move_block` por bloque, con una sola confirmación.
- Dentro de «organízame la semana…», «no puedo el miércoles» sigue siendo un día a evitar del plan.
