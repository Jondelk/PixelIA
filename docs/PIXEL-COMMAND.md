# PixelCommand — Pixel como interfaz principal (zero-entry-first)

Prompt 14.1. Pixel deja de pedir al usuario que alimente el sistema formulario a formulario. La
entrada principal es una frase:

```
¿Qué necesitas hacer?
[ Necesito lanzar TINTO 500 g la próxima semana en Instagram.      → ]
```

Pixel entiende, usa lo que ya sabe, pregunta solo lo indispensable, propone y, tras **una**
confirmación, organiza los recursos con los módulos de siempre. Los módulos (Campañas, Plan de
contenido, Proyectos, Tareas, Contenido) son la memoria operativa de Pixel y la superficie de control
avanzado: siguen ahí para quien quiera revisar o editar.

> **Decisión de producto y arquitectura (ADR 32).** Pixel is conversation-first and
> zero-entry-first. Structured resources exist primarily as Pixel's operational memory and as an
> advanced control surface for the user. Users should not have to maintain Pixel's internal model
> manually for the product to be useful.

## 1. Flujo

```
Solicitud natural (texto; en el futuro, transcripción de voz: mismo campo)
      ↓
PixelIntentResolver        IA si hay modelo; reglas en modo demo y como respaldo si la IA falla
      ↓                    + saneado del backend (capacidades, entidades presentes en el texto)
PixelContextResolver       lo que Pixel ya sabe, solo del workspace activo y solo lo necesario
      ↓
MissingInformationResolver ¿falta algo que cambie MATERIALMENTE el resultado? → UNA pregunta
      ↓
ActionPlan (propuesta)     lo que entendí · lo que propongo · qué voy a crear   (no ejecuta nada)
      ↓  Organizar (una confirmación para todo el plan aprobado)
Servicios existentes       Campaign Manager · Content Planner · Projects · Tasks · Content
```

PixelCommand **no es otro cerebro**: no duplica `CampaignStrategyEngine`, `ContentPlanningEngine`,
`EnterprisePlanningStrategy` ni los servicios de Operations, y nunca escribe en Mongo directamente.
Código: `apps/api/src/modules/pixel-command/`, `apps/api/src/ai/pixelCommand{Payload,Rules}.ts`,
`packages/contracts/src/pixelCommand.ts`, `apps/web/src/features/pixel-command/`.

## 2. Intenciones

| Intención | Qué hace | Personal | Enterprise |
|---|---|---|---|
| `create_campaign` | Campaña + estrategia (y su plan de contenido si la frase incluye contenido o canales) | — (se trata como `plan_content`) | ✅ |
| `plan_content` | Plan de contenido de un periodo (con la campaña que se mencione, si existe) | ✅ | ✅ |
| `create_content` | Guarda UNA pieza en Contenido (Idea) | ✅ | ✅ |
| `organize_project` | Crea un proyecto (y sus tareas) u ordena uno existente con tareas | ✅ | ✅ |
| `create_tasks` | Apunta tareas (en un proyecto si se menciona) | ✅ | ✅ |
| `creative_advice` | Responde con el contexto del chat; **no crea nada** | ✅ | ✅ |
| `work_status` | Estado real del trabajo; **no modifica nada** | ✅ | ✅ |
| `external_action` | (Prompt 18) Una acción en un servicio externo (calendario, correo, mensajería, pagos): la entiende y responde con honestidad; **no crea nada** sin una herramienta conectada (`PIXEL-ACTIONS.md` §10) | ✅ | ✅ |
| `unknown` | Explica qué puede hacer, con ejemplos | ✅ | ✅ |

La disponibilidad se **deriva** de las capacidades de contracts (`pixelIntentAvailable`:
`create_campaign` ↔ `campaigns`, `plan_content` ↔ `contentPlanner`…), nunca de `if (type === …)`.

### Intérprete (`PixelIntentResolver`)

- Entrada controlada (`<pixel_command_input>`): `workspaceType`, `availableIntents`, `userRequest` y,
  si es un ajuste o una respuesta, la interpretación anterior. Ni ADN, ni ids, ni nombres de recursos.
- Salida estructurada `GeneratedPixelInterpretationSchema` (Zod): `intent`, `confidence`,
  `entities` y `missingRequiredInformation`. Doble validación.
- Entidades: solo lo que el usuario **dijo** (producto, objetivo, tipo de campaña, plazo, plataformas
  y exclusiones, formatos y exclusiones, número de piezas, campaña o proyecto mencionados, tema,
  tareas). Nunca tono, colores, audiencia ni personalidad: ya viven en el ADN.
- El backend sanea: una intención no disponible se degrada (`create_campaign` en Personal →
  `plan_content`; otra → `unknown`) y una entidad de texto que no aparece en lo escrito se descarta.
- **Reglas** (`pixelCommandRules.ts`, español): las usa el proveedor demo y son el respaldo si la IA
  falla. Distinguen, por ejemplo, "lanzar X" (campaña) de "contenido para el lanzamiento de X" (plan)
  y "la campaña de INVENTIA" (referencia) de "una campaña de Amor y Amistad" (crear).

## 3. Contexto (`PixelContextResolver`)

Siempre del workspace autorizado; sin ADN → 409 (`brand_dna_missing`, `enterprise_company_missing`
o `personal_context_not_configured`), nunca datos inventados.

| Intención | Carga |
|---|---|
| Todas | Empresa o PersonalDNA (nombre; en Personal, sus plataformas) |
| `plan_content`, `work_status`, `create_content` (Enterprise) | Hasta 20 campañas no archivadas (nombre, producto, canales, estado, si tienen estrategia) |
| `organize_project`, `create_tasks` | Hasta 30 proyectos activos o planificados (nombre, estado) |

Una campaña o un proyecto mencionados se resuelven **en el backend** por coincidencia de palabras
clave contra ese contexto: el modelo nunca elige ids. Por eso "usa la campaña de INVENTIA" desde
TINTO no encuentra nada y la propuesta lo dice ("No encontré una campaña «INVENTIA» en este Pixel").
Una campaña enviada por la pantalla (`contextHint.campaignId`) se valida: de otro workspace → 400.

**Recurso en contexto (Prompt 17).** El Pixel Dock envía el recurso abierto como
`contextHint.resource = { type, id }` (`campaign`, `content_plan`, `project` o `content_item`).
`resolveContextResource` lo busca con `{ _id, workspaceId }`; si no es de este workspace → 400
`VALIDATION_ERROR` en `contextHint.resource.id`. Del recurso se derivan la campaña y el proyecto
(`chosenProject` en el planificador), así que «Hazme tres Reels con esto» dentro de una campaña no
pregunta «¿de qué campaña?». Ver `docs/PIXEL-PRESENCE.md` §8.

## 4. Información que falta

`planCommand` (puro) decide con lo dicho + lo sabido. Pregunta **una** cosa, y solo si cambia
materialmente el resultado:

| Caso | Pregunta |
|---|---|
| "Quiero lanzar el nuevo producto" (producto indeterminado) | ¿Qué producto o servicio vamos a lanzar? |
| "Haz una campaña" (sin objetivo ni tema) | ¿Qué quieres lograr con la campaña? |
| Contenido sin plataforma en la frase, la campaña ni el PersonalDNA | ¿En qué plataforma quieres publicarlo? |
| Varias campañas encajan igual | ¿Para cuál campaña? «A», «B», o sin campaña |
| Tareas sin lista | ¿Qué tareas agrego? |
| "Organiza este proyecto" con varios proyectos | ¿Qué proyecto quieres organizar? Por ejemplo… |

Nunca pregunta tono, colores, personalidad ni audiencia. No pregunta por descuentos: una campaña sin
promoción mencionada se propone **sin** descuentos y la propuesta lo dice. La respuesta del usuario
rellena el dato que faltaba (`pendingField`) y el flujo continúa.

**Valores por defecto del contexto:** plataformas de la frase → canales de la campaña → plataformas
del PersonalDNA; periodo por plazo en el día local del workspace ("esta semana" = hoy → domingo,
"la próxima semana" = lunes → domingo, sin plazo = los próximos 7 días); frecuencia desde el número
de piezas pedido o la del planner (3/semana en Enterprise; la del ADN en Personal); formatos pedidos
o los de la plataforma menos los excluidos.

## 5. Propuesta (ActionPlan) y confirmación

La propuesta (`PixelActionPlan`) habla en lenguaje humano —campaña, plan, piezas, tareas—, nunca
con nombres internos: `summary`, `understood` (lo que entendí), `proposal` (lo que propongo),
`creates` (qué voy a crear) y `steps`, cada uno con un título humano. Los parámetros de cada paso
son internos: se guardan en el `PixelCommand` y no salen de la API.

- **Frontera de confirmación:** leer y responder (`creative_advice`, `work_status`, `unknown`) ocurre
  en el acto. Todo lo que crea recursos queda `proposed` hasta **Organizar**.
- **Una confirmación para el conjunto aprobado:** sin "¿creo la campaña? ¿creo el plan?".
- **Encadenar solo lo pedido:** "Necesito una campaña" crea la campaña (y ofrece el plan); si la frase
  incluye contenido o canales, el plan va en la misma propuesta. No se aceptan piezas automáticamente
  ni se crean proyectos o tareas que nadie pidió.
- **Ajustar:** texto libre ("Mejor solo Instagram y no quiero Stories"). La interpretación nueva se
  **mezcla** de forma determinista con la anterior (lo nuevo manda; las exclusiones se acumulan) y la
  propuesta pasa a la revisión siguiente. No ejecuta nada.
- **Cancelar:** 0 escrituras de recursos (solo el estado del comando).

### Estados

`needs_information` → `proposed` → `executing` → `completed` | `partial` | `failed`; `cancelled`;
`answered` para lo que solo se responde. `interpreting` es un estado de la interfaz (petición en
curso), no se persiste.

## 6. Ejecución, idempotencia y fallos parciales

- `POST …/confirm { revision }`: **reserva atómica** `proposed|partial|failed → executing` con un
  `executionId`, condicionada a la revisión que el usuario vio. Solo una confirmación ejecuta; una
  segunda (o simultánea) responde 200 `executed: false` sin crear nada. Una revisión vieja → 409
  `pixel_command_revision_changed`.
- **Prompt 18 (Action Foundation, `PIXEL-ACTIONS.md`):** al confirmar se congela un snapshot de
  lo autorizado (revisión, `authorizedBy` de la sesión, `authorizedAt`, acciones exactas) en la
  misma operación atómica. Los pasos `create_project` y `create_tasks` se ejecutan con
  herramientas (`workspace.projects`, `workspace.tasks`): una acción por proyecto y por CADA tarea,
  cada una verificada (`plan.actions` muestra ✓ ✕ – por acción). Un fallo no detiene las acciones
  independientes; las que dependen de una fallida se omiten. Una ejecución abandonada más de 5 min
  se libera al consultar o reintentar.
- Los demás pasos validan sus parámetros con el schema del servicio (`GenerateCampaignSchema`,
  `GenerateContentPlanSchema`, `CreateContentItemSchema`) y llaman al servicio existente. Lo creado
  se guarda en el paso.
- Si un paso anterior a las herramientas falla, los siguientes no corren: `partial` (algo se creó; la respuesta dice qué y por
  qué falló el resto) o `failed` (nada). Reintentar retoma desde el paso que falló: lo hecho no se
  duplica. La generación de campaña y de plan ya tienen su propia compensación (si fallan, no dejan
  nada a medias).
- Ajuste concurrente: el ajuste se guarda solo si el comando no cambió (`updatedAt`): si no, 409
  `pixel_command_changed`.

## 7. API

Bajo `requireAuth` + `requireWorkspaceAccess`. Solicitud de otro workspace (aunque sea del mismo
dueño) o de otro usuario → **404**.

| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/api/workspaces/:id/pixel/commands` | 201 `{ command }` — `{ request, source?, tzOffset?, contextHint? }` |
| GET | `…/pixel/commands/:commandId` | `{ command }` |
| POST | `…/:commandId/adjust` | `{ command }` — `{ message }` (responder la pregunta o ajustar) |
| POST | `…/:commandId/confirm` | `{ command, executed }` — `{ revision }` |
| POST | `…/:commandId/cancel` | `{ command }` |

Errores con `details.reason`: `brand_dna_missing`, `enterprise_company_missing`,
`personal_context_not_configured` (409); `pixel_command_not_adjustable`,
`pixel_command_not_confirmable`, `pixel_command_revision_changed`, `pixel_command_changed`,
`pixel_command_not_cancellable` (409); `pixel_command_reply_unavailable` (503, consejo creativo sin
IA disponible).

Modelo `PixelCommand` (`pixel_commands`): `workspaceId` + `tenantScoped`, índice
`{ workspaceId, createdAt: -1 }`.

## 8. Interfaz

- **Inicio Enterprise** (con ADN): "¿Qué necesitas hacer?" → **En marcha** (trabajo de la marca) →
  **Tu marca** (personaje y datos). Sin ADN, primero el onboarding, como antes.
- **Inicio Personal:** "¿Qué necesitas hacer, {nombre}?" → **Tu día** (Daily Director) → trabajo →
  Tu Pixel, ADN y chat.
- **Campañas:** principal "¿Qué quieres lograr?" (`contextHint: create_campaign`); secundarios
  **Brief detallado** (el formulario del Prompt 13) y **Crear manualmente**.
- **Plan de contenido:** principal "¿Qué quieres comunicar?" (`contextHint: plan_content`);
  **Opciones avanzadas** (periodo, frecuencia, plataformas, campaña: el formulario del Prompt 14) y
  **Nuevo plan** (manual). `?campaign=<id>` sigue abriendo las opciones avanzadas con la campaña.
- **Navegación Enterprise:** Inicio · Trabajo (Campañas, Plan de contenido, Proyectos, Tareas,
  Contenido) · Marca (ADN, Personaje, Chat). Antes eran cuatro grupos con el mismo peso.
- Componentes: `PixelCommand` (contenedor), `PixelCommandPanel` (vista por fase, testeable),
  `PixelProposalCard` (Lo que entendí · Lo que propongo · Qué voy a crear; Organizar · Ajustar ·
  Cancelar) y `PixelRequestInput`. Mientras interpreta u organiza, el personaje en `thinking`.

## 8 bis. Brand Guardian preflight (Prompt 15)

En Enterprise, antes de mostrar "Organizar", la propuesta de una campaña, un plan o una pieza pasa
por el Brand Guardian (`docs/BRAND-GUARDIAN.md` §6): si algo se puede corregir sin inventar, Pixel lo
corrige una vez y lo dice; la propuesta muestra una línea compacta del Guardian con el detalle bajo
demanda. Un BLOCK (promoción o claim sin fundamento, restricción explícita) desactiva "Organizar"
(409 `guardian_preflight_blocked`) hasta ajustar o, si es una decisión creativa, "Continuar de todas
formas" (`POST …/:commandId/guardian-override`, registrado). Personal y las consultas no pasan por el
Guardian.

## 8 ter. Creative Memory (Prompt 16)

- **Antes de proponer**, las propuestas de campaña, plan o pieza consultan el
  CreativeMemoryResolver y lo dicen («Tengo en cuenta lo que he aprendido: «Evitar Stories…»»). Si
  la solicitud pide justo lo que la memoria evita, manda la solicitud («Esta vez incluyo Stories
  porque lo pediste»). Los motores aplican la memoria después (`docs/CREATIVE-MEMORY.md` §11).
- **`manage_memory`** (capacidad `creativeMemory`, Personal y Enterprise), un solo flujo:
  - *remember*: «De ahora en adelante evita los CTA de urgencia» → «Voy a recordar para TINTO: …»
    → **una** confirmación («Recordar», paso `remember_memory`). Si el alcance es ambiguo y hay
    campañas, UNA pregunta («¿solo para esta campaña o para TINTO en general?»). «Solo en la campaña
    X podemos usar neón» crea una excepción de esa campaña. Lo factual, sensible o con credenciales
    se explica y no se guarda. Una contradicción reemplaza a la anterior (se dice en la propuesta).
  - *forget*: «Olvida lo de evitar Stories» → «Voy a dejar de usar esta preferencia: …» →
    «Olvidar» (paso `forget_memory`); con varias coincidencias, UNA pregunta.
  - *show*: «¿Qué has aprendido de TINTO?» → responde en el acto con las activas y, aparte, las
    candidatas (nunca reconstruye una personalidad desde la actividad).
- Solo expresiones inequívocamente persistentes activan la intención; «hoy no quiero Stories» o
  «esta vez…» son la solicitud actual.
- **Ajustes como evidencia**: «sin Stories» sobre una propuesta registra un
  `pixel_command_adjusted` (idempotente por revisión), nunca una memoria directa.

## 9. Voz (Prompt 17)

La voz es **otra entrada**, no otro flujo. `PixelComposer` (antes `PixelRequestInput`, que sigue
exportado como alias) entrega la transcripción final por el mismo `onSubmit(text, 'voice')`, y la API
la trata igual que el texto. Pixel dice en voz alta la pregunta o el resumen de la propuesta **solo
en una sesión de voz** (`spokenFor`), y la propuesta se muestra siempre: «Organizar» sigue siendo un
clic, nunca una orden de voz. Sin soporte, sin permiso o con fallo, todo sigue por texto. La
presencia sigue el flujo: `think` antes de la petición; después, `presenceAfterCommand`: `completed`
→ `success`; `partial` o `failed` → `error`; una propuesta cuyo preflight del Guardian no es `pass` →
`warning`; lo demás → `idle`. Un fallo de red también pasa a `error`.
Detalle: `docs/PIXEL-PRESENCE.md` §4. Sin lip-sync ni voz en tiempo real.

## 10. Limitaciones

- Intérprete por reglas (demo y respaldo) heurístico y solo en español; con Claude real
  (`PIXEL_COMMAND_SYSTEM`) **sin probar** (no hay `ANTHROPIC_API_KEY`).
- Coincidencia de campañas y proyectos por palabras clave (sin búsqueda semántica).
- "Esta semana" un viernes son 3 días: con la frecuencia por defecto, 1 pieza (la propuesta lo dice).
- `organize_project` no inventa tareas: si no se dicen, las pregunta.
- Creative Memory: léxico de memoria en español; el intérprete con Claude real para `manage_memory`
  **sin probar** (`creativeMemory.live.test.ts`, SKIPPED sin `ANTHROPIC_API_KEY`).
- La ejecución es síncrona; un comando que se queda en `executing` por una caída del proceso no se
  recupera solo.
- Sin historial de solicitudes en la interfaz (el modelo las guarda).
