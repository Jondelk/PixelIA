# Mi agenda (Prompt 20)

«¿Cómo está organizado mi tiempo?» La vista unificada del tiempo de un **Pixel Personal**
(capacidad `agenda` de contracts; Enterprise no la tiene en esta etapa). No es otro calendario ni
otra integración: Google Calendar es una fuente; **Mi agenda es Pixel**.

> Estado: implementado, pendiente de revisión. Probado con Google falso (tests y smoke 45/45). Sin
> prueba con la cuenta real de Google ni con Claude real.

## Inicio vs Mi agenda

- **Inicio** → qué necesito hacer ahora (PixelCommand, «Tu día»). «Tu día» muestra «Próximos hoy»
  (como mucho 4) y «Ver agenda completa» → `Mi agenda · Hoy`. Con Google conectado, la sugerencia
  «Organizar mi semana» se sustituye por «Ver mi agenda» (→ Semana); organizar sigue a un mensaje.
- **Mi agenda** → cómo está organizado mi tiempo. Navegación Personal: `Inicio · Mi agenda ·
  Trabajo · Pixel` (sin «Calendario», «Google Calendar» ni «Week Planner»).

## Ruta y vistas

`/workspace/:workspaceId/agenda?view=today|week|month|upcoming[&anchor=YYYY-MM-DD][&horizon=N]` —
una sola ruta, recargable (la vista vive en la URL). Cambiar de vista es leer: nunca pide
confirmación.

| Vista | Pregunta | Forma |
| --- | --- | --- |
| Hoy | ¿Qué tengo que hacer hoy? | «Durante el día» (todo el día y fechas límite) → «Con hora» (cronológico; lo pasado atenuado) → «Por organizar» (tareas de hoy y vencidas, sin horario inventado) |
| Semana | ¿Cómo está distribuido mi tiempo? | 7 columnas compactas en escritorio ancho (≥ 1280 px); día por día en tablet y móvil. Días pasados atenuados; «Reorganizar este día» |
| Mes | ¿Qué compromisos importantes tengo? | Cuadrícula de carga (semanas completas): número, hasta 2 títulos y «+N más» en escritorio, puntos por tipo en móvil; seleccionar un día abre su detalle debajo con «Hablar con Pixel sobre este día». ‹ › y «Hoy»; cualquier mes |
| Próximos | ¿Qué se me viene después? | Grupos: Vencidas · Esta semana · Este mes · los 2 meses siguientes · Más adelante. Horizonte 90 días; «Ver más» suma 90 (máximo 360) |

## Tipos visibles (`AgendaItem.kind`)

| Marca | Tipo | Qué es | Acción |
| --- | --- | --- | --- |
| ● | Compromiso | Un evento de tu calendario que Pixel respeta | «Hablar con Pixel» (nunca «Mover») |
| ◆ | Organizado por Pixel | Un bloque que creó Pixel en ESTE Pixel (marca privada) | «Reorganizar» |
| ○ | Por organizar | Una tarea con fecha, sin tiempo reservado | «Pedirle a Pixel que lo organice» |
| ◇ | Fecha límite | La fecha de un proyecto (sin duración inventada) | «Hablar con Pixel» |

Forma + texto, nunca solo color. Estados breves: «Vence hoy», «Vencida · por organizar», «Vence el 23
oct». Todo el día → «Todo el día» (nunca 00:00). Varios días → una entrada con rango («21–23 de
octubre»); en el Mes, «↳» en los días siguientes.

## Arquitectura

```
AgendaPage (web, sin cálculo de fechas)
  → GET /api/workspaces/:id/agenda?view&anchor&horizon&timezone   (solo lectura, capacidad agenda)
  → PersonalAgendaService (modules/calendar/agenda.service.ts)
      zona: planningTimezone (la del Pixel → la del Google Calendar → la del navegador; si no, la
            DEFAULT_TIMEZONE de la instalación)
      rango: todayRange · weekRange · monthRange · upcomingRange (availability.ts, luxon)
      fuentes: google.calendar/list_events (por la herramienta, como el planificador) +
               Task (abiertas con fecha) + Project (fechas límite), de ESTE workspace
      → AgendaItem normalizados → orden → días, grupos, resumen determinista, aviso de conexión
```

- **Sin duplicar el planificador.** La agenda usa la misma lectura (`readCalendar`), la misma zona y
  las mismas utilidades de fechas; `horizonRange` del planificador ahora usa `weekRange`. El
  planificador **decide**; la agenda **muestra**.
- **Respuesta** (`AgendaResponseSchema`): `timezone`, `view`, `anchor`, `today`, `range`, `title`,
  `navigation`, `summary`, `counts`, `days`, `items`, `pendingItems`, `groups`, `connection`,
  `horizonDays`, `canExtend` y `generatedAt`. Cada elemento trae sus días (`dates`) y etiquetas ya
  resueltos.
- **Resumen determinista**, sin IA: cantidades, el día más cargado y el próximo plazo.
- **Rendimiento.** Hoy lee 1 día, Semana 7, Mes el mes visible y Próximos el horizonte. Al cambiar
  de mes se consulta ese rango y nada más; no se precarga el año.

## Google Calendar en la agenda

- **Nada se copia en Mongo**: se consulta en cada petición y la respuesta no lleva payload crudo.
- **Referencias controladas.** Los eventos llevan un id opaco (`evt_…`, hash de workspace + evento);
  las tareas y proyectos, su id de Pixel. Ningún parámetro admite calendario, usuario, workspace ni
  evento (400).
- **Estados**, sin bloquear la agenda interna:

  | Estado | Aviso | Acción |
  | --- | --- | --- |
  | `requires_auth` | «Conecta Google Calendar para incluir tus compromisos reales.» | Conectar (vuelve a `/agenda`) |
  | `requires_reauth` | «Necesito volver a conectar Google Calendar para actualizar tu agenda.» | Volver a conectar |
  | `unavailable` | «No pude actualizar tus compromisos de Google en este momento. Tu agenda interna sigue disponible.» | — |
  | `unconfigured` | Lo dice | Sin OAuth que ofrecer |

- **Cambios en el adaptador:**
  - los eventos de todo el día conservan su fecha (`startDate` / `endDate`); antes se convertían en
    «00:00 UTC», el día anterior en América;
  - `list_events` pagina, hasta 1000 eventos, y acepta rangos de hasta 370 días.

## Leer vs cambiar

- **VER:** pestañas, meses y días; nunca hay confirmación ni escrituras (hay tests que lo comprueban).
- **CAMBIAR:** siempre por PixelCommand → propuesta → confirmación → Action Foundation → Google →
  verificación. No hay `POST` ni `PATCH` de agenda, ni arrastrar, ni «+ Nuevo evento».
- **«Reorganizar con Pixel»** (botón principal) abre en la propia página «¿Qué quieres cambiar?». Ahí
  el Dock no aparece, para no duplicar la entrada.
- **Borradores sin ids:** las acciones de un elemento o de un día rellenan el campo con un texto como
  «Mueve «Avanzar Pixel» del sábado 17 de octubre al » o «Quiero reorganizar el jueves 12 de
  noviembre: ». El cursor queda al final; el usuario completa y envía.
- **Liberar una franja (nuevo):** «El jueves en la tarde no puedo.» → `replan_block`.
  - Mueve **solo** los bloques de Pixel que caen en esa franja (mañana 6–12, tarde 12–19,
    noche 19–24), cada uno al primer hueco libre fuera de ella.
  - Los compromisos no se tocan.
  - Es una propuesta con un `move_block` por bloque y una sola confirmación.
  - Resultado: «Listo. Moví N bloques…», o un parcial con su motivo.
  - Dentro de «organízame la semana…», «no puedo el miércoles» sigue siendo un día a evitar del plan.

## Tarea ↔ bloque de Pixel

Una tarea que Pixel ya organizó **no** aparece como «Por organizar». Nunca se une por título ni por
parecido de texto.

- **Origen.** «Pedirle a Pixel que lo organice» envía la tarea como recurso en contexto
  (`contextHint.resource = { type: 'task', id }`, el mecanismo del Dock). La API la valida contra el
  workspace (de otro → 400) y la guarda en el comando (`contextHint.taskId`). Así sobrevive a
  «Ajustar», y cada bloque del plan lleva `taskRef` en su entrada de `create_event`.
- **Dónde se guarda:**
  - en la marca privada del evento de Google, `pixelTask = taskEventRef(workspace, taskId)`: un hash
    opaco de 32 caracteres que incluye el workspace (ni el id de Mongo ni el título);
  - en el snapshot autorizado, como parte de la entrada congelada de la acción.

  La verificación comprueba que el evento releído lleva esa referencia.
- **Cómo decide la agenda.** En cada petición lee Google:
  - el rango de la vista;
  - solo los bloques de Pixel, desde ahora hasta la fecha límite más lejana de las tareas, como
    mucho un año.

  Una tarea está **organizada** si existe al menos un bloque de ESTE Pixel con su referencia que aún
  no ha terminado. Entonces sale de «Por organizar» y el bloque enlaza con ella («Ver tareas»).
- **Lo que no cambia el vínculo:**
  - programar no es completar: el estado de la tarea no cambia;
  - varios bloques para una tarea siguen siendo una sola tarea;
  - mover un bloque (`update_event`) solo cambia las horas, y la marca se conserva.
- **Cuándo se pierde:**
  - si el bloque se borra fuera de Pixel o ya pasó, la tarea vuelve a «Por organizar»;
  - si Google no responde, no se sabe, y la tarea sigue «Por organizar» (nunca se inventa).
- **Bloques genéricos** («reserva 2 horas para estudiar»): no tienen tarea y no cubren ninguna.
- **Proyectos:** sin este vínculo, por ahora.

## Presencia y accesibilidad

- Sin un segundo avatar grande: la presencia ambiental del workspace y la de PixelCommand al
  reorganizar (thinking → idle → thinking → success o warning).
- Pestañas con `tablist` / `tab` / `tabpanel`, `aria-selected`, una sola tabulable y flechas
  ←/→.
- Mes como `grid` de botones con etiqueta («Jueves 12 de noviembre: 1 elemento»), `aria-pressed` en
  el seleccionado; los días de otros meses no se seleccionan.
- Elementos con etiqueta completa (tipo, título, hora, estado, día) y foco visible.
- Responsive comprobado a 390, 820 y 1440 px sin desbordes.

## Limitaciones

- Un solo calendario (el principal): sin varios calendarios, Outlook ni Apple.
- «Ver más» llega como mucho a 360 días.
- Liberar una franja busca huecos en los próximos 8 días, en la ventana de 8:00 a 21:00.
- Sin recordatorios, notificaciones, eventos recurrentes editables ni colores por calendario.
