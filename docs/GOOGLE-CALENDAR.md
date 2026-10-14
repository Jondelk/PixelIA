# Google Calendar (Prompt 19)

La primera herramienta **externa** de Pixel, construida sobre la Action Foundation
(`docs/PIXEL-ACTIONS.md`, `docs/PIXEL-TOOLS.md`). **Solo Pixel Personal** (capacidad `calendar` de
contracts). Planificar con ella está en `docs/PERSONAL-WEEK-PLANNER.md`.

> Estado: implementado, pendiente de revisión. Probado con un Google **falso** (CI y smoke). La
> prueba en vivo existe y queda SKIPPED sin un calendario de prueba configurado.

## Flujo

```
conversación → contexto personal → calendario real (lecturas) → disponibilidad → plan
→ propuesta (0 escrituras) → UNA autorización («Guardar semana») → create_event por bloque
→ releer cada evento en Google (verificación) → resultado veraz
```

Replanificar: «No pude estudiar cálculo hoy» o «Muévelo al jueves a las 6» → propuesta →
«Mover bloque» → `update_event` del **mismo** evento de Pixel → verificación.

## Estados (`CalendarConnectionStatus`)

| Estado | Cuándo | Qué dice Pixel |
| --- | --- | --- |
| `unconfigured` | La instalación no tiene las 4 variables (o son inválidas) | «Google Calendar todavía no está configurado en esta instalación de Pixel.» (sin botón) |
| `requires_auth` | Configurado, el usuario no conectó (o desconectó) | «Para consultar tu disponibilidad necesito conectar tu Google Calendar.» + [Conectar Google Calendar] |
| `connected` | Conexión válida | — |
| `requires_reauth` | Refresh token revocado/caducado o tokens imposibles de descifrar | «Necesito volver a conectar tu Google Calendar.» + [Volver a conectar] |
| `unavailable` | Google caído, cuota o error temporal | No propone horarios: «no voy a proponerte horarios sin ver tu disponibilidad real» |

Pixel **nunca** inventa eventos ni disponibilidad. Sin la configuración o con Google caído, la API
arranca y todo lo demás funciona: es una capacidad opcional.

## Configuración (`apps/api/.env`, nombres en `.env.example`)

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: cliente OAuth «Aplicación web» de Google Cloud.
- `GOOGLE_CALENDAR_REDIRECT_URI`: debe coincidir con la URL autorizada. En desarrollo, por el proxy
  de Vite: `http://localhost:5173/api/calendar/google/callback`.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: 32 bytes en base64 o hex
  (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
- Solo pruebas en vivo: `GOOGLE_CALENDAR_TEST_CALENDAR_ID` (un calendario de PRUEBA, nunca
  `primary`) y `GOOGLE_CALENDAR_TEST_REFRESH_TOKEN`.

Todo vacío = `unconfigured`, sin aviso. Incompleto o inválido = `unconfigured` y un aviso en el
arranque que nombra solo las variables (`calendar.config.ts`), nunca sus valores.

## Scopes (mínimos)

| Scope | Para qué |
| --- | --- |
| `calendar.events` | Leer eventos (título y horas) para planificar alrededor; crear y mover los bloques de Pixel. Nunca se borra nada (no hay `delete_event`). |
| `calendar.freebusy` | Ocupado/libre sin leer el contenido. |
| `calendar.settings.readonly` | Solo la zona horaria del calendario. |

Si el usuario concede menos, el callback lo rechaza (`insufficient_scope`), revoca lo concedido y no
guarda nada.

## OAuth (Authorization Code + PKCE S256)

- `POST /api/workspaces/:id/calendar/connect` (`{ returnTo: 'home' | 'pixel' }`, estricto) →
  `{ authUrl }`. El servidor crea un **nonce** aleatorio de 32 bytes (viaja como `state`), guarda solo
  su **hash** SHA-256 con el usuario, el workspace, el verificador PKCE **cifrado**, el destino y una
  caducidad de 10 min (`calendar_oauth_states`, índice TTL). `access_type=offline`, `prompt=consent`.
- `GET /api/calendar/google/callback` lee la sesión de la cookie (SameSite=Lax viaja en esa
  navegación). El estado se **consume de forma atómica** (`usedAt`), así que es de un solo uso. Se
  comprueba que el usuario de la sesión es el del estado y que el workspace sigue siendo suyo y
  Personal. El workspace y el destino salen del estado guardado, **nunca** de la URL.
- La redirección siempre es una ruta interna de una lista cerrada (`/workspace/:id` o
  `/workspace/:id/pixel`) más `?calendar=connected` o `?calendar=error&reason=…`. No hay open
  redirect. La respuesta lleva `Cache-Control: no-store` y `Referrer-Policy: no-referrer`.
- Errores con mensaje humano en la web (`calendarReturnMessage`): `denied`, `state_invalid`,
  `state_expired`, `state_replayed`, `session_mismatch`, `workspace_invalid`, `exchange_failed`,
  `missing_refresh_token`, `insufficient_scope`, `unconfigured`.
- `POST …/calendar/disconnect`: revoca en Google (best-effort), pone los tokens a `null` y el estado
  `disconnected`. **No borra eventos**, y la UI lo dice.
- `GET …/calendar/connection`: estado, permisos en lenguaje humano, zona y fecha. Sin tokens ni correo.

No hay endpoints para leer ni escribir eventos: las escrituras solo ocurren por PixelActionPlan →
ActionExecutor, y el frontend nunca elige `toolKey`, `calendarId`, `eventId`, `workspaceId` ni el
payload.

## Tokens

- Solo en el servidor, en `calendar_connections` (tenantScoped por `workspaceId`, único por
  workspace + dueño + proveedor), **cifrados** con AES-256-GCM (`lib/secretBox.ts`,
  `v1.iv.tag.ciphertext`, IV aleatorio) y con `select: false`.
- Nunca en localStorage, la web, PixelCommand, el snapshot autorizado, ActionResult, Creative Memory
  ni los logs. Hay tests que lo verifican. El `requestLogger` registra `/api/calendar/*` sin la query
  (el `code` y el `state`).
- Renovación **centralizada** en `openCalendarSession` (`calendarConnection.service.ts`): token
  vigente → se usa; si no, se relee y se renueva una vez en vuelo único por conexión (dos lecturas en
  paralelo comparten una renovación). Un 401 renueva y reintenta **una** vez. `invalid_grant`,
  descifrado imposible o clave distinta → `requires_reauth` persistido; las siguientes peticiones no
  vuelven a intentarlo (sin bucle).

## La herramienta `google.calendar`

`modules/actions/tools/googleCalendar.tool.ts`, `contextTypes: ['personal']`, `feature: 'calendar'`.
Su disponibilidad sale del estado de la conexión (`unconfigured`, `requires_auth`,
`requires_reauth` → no ejecuta).

| Capacidad | Efecto | Autorización |
| --- | --- | --- |
| `list_events` | read / external | none |
| `find_availability` | read / external | none |
| `create_event` | create / external | confirm (la del plan) |
| `update_event` | update / external, significant | confirm |

No hay `delete_event`, y `get_event` no se expone (la herramienta relee internamente).

- **Entrada estricta.** `create_event` acepta `summary`, `start`, `end`, `timezone` (IANA válida),
  `description?` y `location?`, con fin > inicio y como mucho 12 h. El calendario lo decide el
  servidor (`calendarId` de la conexión). `update_event` acepta `eventId`, `start`, `end`, `timezone`
  y `summary?`.
- **Idempotencia externa.** El id del evento = `sha256(idempotencyKey)` en hexadecimal (válido en
  base32hex). Un doble clic, un reintento o una caída después de crear encuentran el mismo evento;
  si dos ejecuciones compiten, Google devuelve 409 y se reutiliza el ganador si su `pixelAction`
  coincide. Nunca se deduplica por título.
- **Revalidación.** Antes de crear se consulta free/busy del hueco; si apareció algo, falla con
  `calendar_conflict` y **nunca** se mueve a otro hueco por su cuenta. Al mover se comprueba con los
  eventos del rango, excluido el propio.
- **Solo eventos de Pixel.** Propiedades privadas `pixelManaged=true`, `pixelWorkspace` (hash del
  workspace) y `pixelAction` (hash de la clave). `update_event` sobre cualquier otro evento →
  `calendar_permission_denied`. Los eventos del usuario son restricciones duras.
- **Verificación.** Se relee en Google: existe, no está cancelado, título, inicio y fin, marca de Pixel
  del workspace y la acción. Al mover se comparan los campos cambiados.
- **Referencias controladas.** `resourceRefs` = `{ kind: 'calendar_event', id, label }`.
- **Errores normalizados.** `calendar_not_connected`, `calendar_requires_reauth`,
  `calendar_permission_denied`, `calendar_rate_limited`, `calendar_unavailable`,
  `calendar_event_not_found`, `calendar_conflict`, `calendar_invalid_time`,
  `calendar_execution_failed` y `calendar_verification_failed`. Nunca la respuesta cruda de Google.
- **Sin tormenta de reintentos.** El adaptador no reintenta (timeout de 15 s). Las escrituras solo se
  reintentan con «Reintentar», que es idempotente.

## Adaptador

`google.provider.ts`: OAuth con `google-auth-library@11.1.0` y Calendar v3 con `fetch`. Ningún tipo
del SDK sale del adaptador (`calendar.types.ts` define los de Pixel). Para tests y el smoke,
`test/support/fakeGoogleCalendar.ts` (en memoria, cuenta llamadas y simula fallos).

## Datos que Pixel guarda

Solo la conexión (tokens cifrados, scopes, zona, fechas) y el estado OAuth temporal. El calendario
**no** se sincroniza en Mongo: las lecturas son por petición y se reutilizan dentro de ella. El plan
propuesto (`PixelCommand.weekPlan`) guarda títulos y horas de los bloques de Pixel, no los eventos
del usuario.

## Pruebas

- `test/googleCalendar.test.ts` (Google falso): seguridad del OAuth, cifrado, estados, lectura, plan,
  idempotencia, conflictos, mover y replanificar, y logs.
- `test/weekPlanner.unit.test.ts`: disponibilidad, planificador, reglas, cifrado y configuración.
- `test/googleCalendar.live.test.ts`: Google real (solo el calendario de PRUEBA) y Claude real.
  SKIPPED sin su configuración.
