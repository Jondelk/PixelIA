# Creative Memory (Prompt 16)

> **Creative Memory is decision memory, not conversation storage.** Pixel remembers high-signal
> creative preferences, exceptions and recurring decision patterns. A single isolated action must
> not silently redefine the user's or brand's identity.

Estado: implementado el 2026-10-13 en Personal y Enterprise, verificado con tests y en navegador
(modo demo). No se ha probado con Claude real porque no hay `ANTHROPIC_API_KEY`
(`apps/api/test/creativeMemory.live.test.ts` queda en SKIPPED). Código:
`apps/api/src/modules/creative-memory/`, `packages/contracts/src/creativeMemory.ts` y
`apps/web/src/features/creative-memory/`.

## 1. Filosofía

- **ADN ≠ memoria.** El PersonalDNA o el BrandDNA es lo que la persona o la marca **declaró** que
  es. La Creative Memory es cómo **decide de verdad**: preferencias aprendidas, excepciones,
  patrones de formato, comunicación, estilo visual y forma de trabajar.
- La memoria **nunca reescribe el ADN** ni es historial de chat. No se guardan clics, pantallas,
  mensajes ni generaciones.
- **Decisiones, no actividad:** decisión humana → evidencia estructurada → candidata →
  confirmación → memoria activa → recuperación relevante → mejores propuestas.
- **La memoria orienta, no encierra.** Lo que el usuario pide en cada momento siempre manda.

## 2. Dos capas

| | `CreativeDecisionEvent` (`creative_decision_events`) | `CreativeMemory` (`creative_memories`) |
|---|---|---|
| Qué es | Evidencia histórica de **una** decisión | Conocimiento operativo, confirmado o explícito |
| Escritura | Solo `recordCreativeDecision` desde servicios | Servicio de memoria (recordar, confirmar, reemplazar…) |
| Cambios | **Inmutable** (los hooks de update lanzan error) | Cambia de estado; nunca se borra |
| Idempotencia | Índice único `{ workspaceId, sourceEventKey }` | Índices únicos parciales: una activa y una candidata por clave y alcance |
| API | Sin CRUD; solo resumen humano en el detalle de una memoria | `/api/workspaces/:id/creative-memories` |

Las dos llevan `tenantScoped` por `workspaceId`. El actor (`actorUserId`) es el dueño del
workspace: hoy no hay miembros.

## 3. CreativeDecisionEvent y CreativeSignal

Campos del evento:
- `eventType`, `resourceType`, `resourceId`, `campaignId`, `projectId`, `contentPlanId`;
- `signals[]`, `before` y `after` compactos (solo el campo relevante, ≤ 300 caracteres);
- `sourceEventKey`;
- `description`: la frase humana para «¿Por qué Pixel piensa esto?»;
- `metadata { source, dimension, reason, influencedByMemory }` y `occurredAt`.

Tipos de evento y dónde se registran:

| Evento | Dónde | Señal | Fuerza |
|---|---|---|---|
| `guardian_override` | Override manual y "Continuar de todas formas" del preflight | `visual:<tema>:prefer`, urgencia o mayúsculas; los factuales, **ninguna** | media |
| `guardian_correction_applied` | "Aplicar" corrección del Guardian | lo quitado (urgencia, mayúsculas, temas del léxico) se evita | alta |
| `pixel_command_adjusted` | Ajuste a una propuesta ("sin Stories") | `format:story:avoid`, `platform:x:avoid` | media |
| `explicit_memory_instruction` | Recordar (PixelCommand o página) | — (la memoria ya es activa) | — |
| `campaign_deliverable_accepted` / `rejected` | Aceptar / rechazar pieza de campaña | formato prefer (baja) / formato avoid (media) + plataforma avoid (baja) | |
| `content_plan_item_accepted` | Aceptar tal cual | `format:x:prefer` | baja |
| `content_plan_item_rejected` | Rechazar ítem | `format:x:avoid` | media |
| `content_plan_item_edited_then_accepted` | Editar (formato, plataforma, título, hook) y aceptar | antes → evitar, después → preferir, o edición de texto | alta |
| `generated_content_edited_then_kept` | Editar un ContentItem que propuso Pixel (`source: pixel`) | ídem | alta |
| `memory_candidate_confirmed` / `dismissed` | Confirmar o descartar una candidata | — | — |
| `creative_resource_rejected` | Reservado en el enum; **no se emite todavía** | | |

Lo que **no** crea eventos: abrir pantallas, ver campañas, el login, navegar, abrir el Guardian,
generar sin decidir y la solicitud inicial («hoy no quiero Stories» afecta solo a esa solicitud).

`CreativeSignal`:
- `dimension`: communication, visual, strategy, content, campaign, workflow, platform, format u
  other;
- `subject`, `action` (prefer · avoid · replace · approve · reject · override), `value`,
  `previousValue`;
- `normalizedKey = dimension:tema:polaridad` (p. ej. `format:story:avoid`,
  `communication:urgency:avoid`, `visual:neon:allow`) y `strength` (low · medium · high).

El **léxico determinista** (`memory.lexicon.ts`) agrupa expresiones distintas en la misma clave:
«evita las Stories», «nunca uses Stories» y quitar Stories de un plan producen `format:story:avoid`.
«Historia» suele significar narrativa: solo cuentan las *Stories* explícitas («stories», «historias
de Instagram»). Las ediciones de texto que el léxico no sabe resumir producen
`communication:copy_edit:neutral` y van al sintetizador (§8).

Pesos en el detector: baja 1, media 2, alta 3. Las señales débiles refuerzan una memoria existente,
pero **nunca crean** una candidata.

## 4. CreativeMemory

El modelo anterior se extiende de forma compatible (no hay un segundo sistema de memoria):
- `content` es el enunciado (`statement` en el DTO) y `memoryScope` es el `contextType`;
- `source {message|manual}` se conserva; la procedencia nueva va en `origin`: explicit,
  decision_pattern, guardian, pixel_command o legacy;
- campos nuevos: `status`, `dimension`, `normalizedKey`, `polarity` (prefer · avoid · allow ·
  neutral), `value` («3» en «máximo 3 prioridades»), `scope { type, id, label }`, `confidence`,
  `occurrenceCount`, `evidenceCount`, `evidenceEventIds` (máximo 20, los más recientes),
  `evidenceSummary`, `confirmedByUser`, `confirmedAt`, `supersedesMemoryId`,
  `supersededByMemoryId`, `forgottenAt`, `dismissedAt` y `lastObservedAt`;
- `kind`, un enum pequeño: preference, avoid, approved_pattern, rejected_pattern, exception,
  workflow_preference, communication_preference, visual_preference, strategic_preference. Los
  valores antiguos (decision, insight, rejection) se conservan en el enum para no romper documentos
  guardados, pero ya no se crean.

`status` **no tiene default** en Mongoose: aplicaría al leer y activaría memorias antiguas.

## 5. Explícita frente a derivada

- **Explícita.** Expresiones inequívocamente persistentes: «de ahora en adelante», «desde ahora»,
  «recuerda que», «no vuelvas a», «no volvamos a», «para esta marca», «habitualmente», o «solo en la
  campaña X podemos…» (una excepción). «Siempre», «nunca» y «prefiero» solo cuentan si la frase no
  pide otra cosa.
  - Pixel propone «Voy a recordar para TINTO: …» y, tras **una** confirmación («Recordar»), la
    memoria queda activa con `origin: explicit` y `confirmedByUser: true`.
- **Temporal.** «Hoy no quiero Stories» o «esta vez quiero Stories» afectan solo a la solicitud
  actual: no crean memoria.
- **Derivada.** Un patrón crea siempre una **candidata**, nunca una memoria activa.

## 6. Ciclo de vida, umbral y confianza

```
candidate ──confirm──▶ active ──forget──▶ forgotten
    └──dismiss──▶ dismissed      └──replace / contradicción──▶ superseded (+ nueva active)
instrucción explícita ──▶ active (refuerza si ya existe; confirma la candidata equivalente)
```

**Umbral de candidata:**
- al menos **3 señales independientes** (fuerza media o alta, sin `influencedByMemory`)
- en al menos **2 recursos distintos** (el plan, si lo hay; si no, el recurso).

Dos rechazos en el mismo plan no bastan. Si todas las decisiones son de la misma campaña, la
candidata es de esa campaña.

**Confianza:** es interna y no es una certeza; la UI no la muestra.
- Explícita: 0,95.
- Candidata confirmada: 0,9.
- Candidata derivada: `min(0,85, 0,35 + 0,1·señales + 0,05·(recursos − 1) + 0,05·fuertes)`.
- Sintetizada: como mucho 0,8.

**Sin duplicados:** se identifica por clave + alcance + estado. Nueva evidencia de una memoria
existente actualiza `occurrenceCount`, `evidenceCount`, `evidenceEventIds` (los últimos 20) y
`lastObservedAt`. **Sin caducidad automática:** `lastObservedAt` queda para un decay futuro que
todavía no se implementa.

## 7. Protecciones

- **Auto-refuerzo.** El plan y la estrategia guardan `generation.memoryKeys` (las memorias que
  aplicaron). Aceptar *tal cual* una pieza cuyo formato eligió una memoria se registra con
  `influencedByMemory: true` y el detector no lo cuenta.
- **Anti-reaprendizaje.** Para una clave olvidada o descartada, solo cuenta la evidencia
  **posterior** a `forgottenAt` o `dismissedAt`: los mismos eventos no la recrean.
- **Nunca hechos.** «Somos el #1», «20.000 clientes», «cuesta $80.000» o «tenemos certificación»
  se rechazan (400 `creative_memory_not_allowed`, o una respuesta de PixelCommand que lo explica).
  Las memorias tampoco entran al vocabulario que fundamenta claims en el Guardian, el Campaign
  Manager o el planner.
- **Credenciales.** Contraseñas, tokens, API keys, secretos y credenciales nunca se guardan.
- **Privacidad (Personal).** Nunca se infiere ni se guarda salud, salud mental, sexualidad,
  religión, política, etnia, finanzas sensibles ni antecedentes. La memoria personal es solo
  creativa y profesional.

## 8. CreativeMemorySynthesizer (IA)

- Solo para ediciones de texto libre (`copy_edit`) con evidencia suficiente: ≥ 3 ediciones
  independientes en ≥ 2 recursos, aún no usadas por otra memoria.
- Hace una llamada cada 3 ediciones nuevas, nunca una por evento.
- Entrada controlada `<memory_input>` con `EVENT_1…n` (antes y después): sin ids, fechas ni
  puntuaciones.
- Salida Zod `GeneratedCreativeMemorySynthesisSchema`, que se valida (`validateSynthesis`):
  - las referencias desconocidas (`EVENT_999`) se descartan;
  - con menos de 3 válidas en 2 recursos, no se crea nada;
  - la clave debe tener la forma `dimension:tema:prefer|avoid`;
  - todo tema del léxico que nombre el enunciado debe aparecer en los eventos («prefiere TikTok»
    cuando solo quitaron Stories se rechaza);
  - se descarta lo factual, lo sensible, las credenciales y los enunciados vagos («le gusta lo
    elegante»).
- El resultado siempre es una **candidata**.
- En modo demo (`demoCreativeMemory.ts`) se resuelve con reglas que distinguen comunicación,
  formato, visual y forma de trabajar. Sin un patrón mayoritario, no propone nada.

## 9. Alcance, especificidad y conflictos

- **Alcances:** `workspace · campaign · project · content_plan`. Hoy se crean `workspace` y
  `campaign`; los de proyecto y plan están en el contrato y el resolver.
- **Especificidad:** plan > proyecto / campaña > workspace.
- **Excepción:** «Solo en la campaña Cosecha podemos usar neón» crea `kind: exception`,
  `visual:neon:allow` con alcance de esa campaña. En esa campaña la excepción suspende `avoid neón`
  del workspace; fuera de ella, todo sigue igual. Una excepción nunca borra la preferencia general.
- **Contradicción en el mismo alcance:** «desde ahora sí quiero Stories» frente a una activa
  «evitar Stories». Se crea una memoria nueva, la anterior pasa a `superseded`, y la nueva lleva
  `supersedesMemoryId`. Nada se edita en silencio.
- **Editar** es también reemplazar (`POST /:id/replace`).
- **Olvidar:** «Olvida lo de evitar Stories» → `forgotten` con `forgottenAt`. Sin borrado.

**Precedencia:**
1. Solicitud explícita actual.
2. Seguridad, tenant y reglas factuales.
3. Excepción explícita con alcance.
4. Estrategia o recurso actual.
5. Memoria con alcance.
6. Memoria del workspace.
7. Preferencias blandas del ADN.

La memoria derivada nunca invalida en silencio una restricción fuerte del BrandDNA; solo una
instrucción explícita crea una excepción con alcance.

## 10. CreativeMemoryResolver

`resolveCreativeMemories(workspace, { dimensions, campaignId, projectId, contentPlanId })`:
- **una sola consulta**: activas, solo los alcances que aplican y las dimensiones pedidas, como
  máximo 60;
- después, conflictos por tema, ranking y límites;
- **ranking:** especificidad → confirmada por el usuario → relevancia de la dimensión → confianza →
  última observación (la recencia nunca es la única señal);
- **límites:** 8 con alcance + 8 del workspace, con referencias `MEMORY_n`;
- devuelve también las preferencias **suspendidas** por una excepción, para explicarlo.

Nunca entran memorias `legacy`, candidatas, descartadas, olvidadas ni reemplazadas. Lo que recibe
la IA es compacto: `MEMORY_1: Evitar Stories salvo petición explícita`, sin timestamps, puntuaciones
ni ids.

## 11. Integraciones

| Motor | Dimensiones | Qué hace |
|---|---|---|
| PixelCommand | según la intención | `manage_memory` (remember · forget · show); la propuesta dice «Tengo en cuenta lo que he aprendido: …» y respeta lo pedido («esta vez incluyo Stories porque lo pediste») |
| CampaignStrategyEngine | communication, strategy, visual, campaign, platform, format | `creativeMemory` en el payload + `applyCampaignMemories` determinista tras el grounding: sin CTA de urgencia, sin formatos o plataformas evitados (salvo que el brief los pida), visuales evitados en `visualDirection.avoid`; `generation.memoryKeys` |
| Content Planner (Personal y Enterprise) | format, platform, content, communication | formatos preferidos primero, `avoidedFormats` y plataformas evitadas (nunca vacías); lo que pide la solicitud manda; `respectAvoidedFormats` después de validar; `generation.memoryKeys` |
| Daily Director (Personal) | **solo workflow** | `workflowMemory` en el contexto; «máximo N prioridades» limita las prioridades con IA o sin ella; las memorias visuales nunca entran |
| Chat (ambos context builders) | todas, acotadas | resumen compacto; el prompt solo permite «como has indicado…» sobre memorias reales |
| Brand Guardian | communication, visual, strategy, content, campaign, format, platform | `MEMORY_n` como evidencia **creativa**, nunca factual; excepciones con alcance (§12) |

## 12. Brand Guardian

- `MEMORY_n` entra a las referencias controladas y al payload semántico. Una memoria puede respaldar
  un hallazgo creativo, **nunca** uno de claims.
- **Excepción con alcance:** en la campaña de la excepción se suspenden los avisos creativos sobre
  ese tema: restricción visual, choque de estilo visual o de identidad, rechazo de la marca y
  restricción explícita. A cambio queda un hallazgo informativo, `memory_exception_applied`
  («Excepción de «Cosecha»: se permite neón»). En otra campaña, el ADN sigue mandando.
- **Preferencia contradicha** (una Story cuando se evitan): aviso leve, `memory_preference_conflict`,
  que se puede pasar por alto.
- Override y corrección aplicada son **decisiones** (§3), nunca memorias directas.
- El Guardian sigue siendo solo de Enterprise: la memoria Personal no habilita un Guardian Personal.

## 13. API

| Ruta (`/api/workspaces/:id/creative-memories`) | Método | Notas |
|---|---|---|
| `/` | GET `?view=active\|candidate\|history\|all` | máximo 100, por `updatedAt` |
| `/:memoryId` | GET | `{ memory, evidence[] (descripción + fecha, sin ids), related[] }` |
| `/remember` | POST `{ text, scope? }` | 201 al crear, 200 si refuerza; 400 `creative_memory_not_allowed` / `creative_memory_unclear`; alcance ajeno → 400 en `scope.id` |
| `/:memoryId/confirm` · `/dismiss` · `/forget` | POST | 409 `creative_memory_not_candidate` / `creative_memory_not_active` |
| `/:memoryId/replace` | POST `{ text }` (201) | nueva activa; la anterior queda `superseded` |

- Capacidad `creativeMemory`: Personal ✅ · Enterprise ✅.
- Recurso de otro workspace o de otro usuario → 404.
- La ruta legacy `/api/companies/:id/memories` sigue vacía.

## 14. Migración

`migrateLegacyCreativeMemories` corre al arrancar la API; también está
`npm run migrate:creative-memories [-- --dry-run]`.
- Marca `status: legacy`, `origin: legacy` y `active: false` en los documentos sin `status`.
- No clasifica ni inventa: su texto libre se conserva y queda fuera del retrieval.
- Es idempotente y nunca borra.
- Los context builders del chat ya no leen esas memorias.

## 15. Política de fallos

Memory es un efecto secundario: la acción principal siempre gana.
- `recordCreativeDecision` registra después de la acción, captura todo error y solo lo registra en
  el log (`creative_memory_capture_failed`, `creative_memory_detection_failed`).
- Si el detector o el sintetizador fallan, el evento queda guardado y la acción del usuario no se
  deshace (cubierto por un test).
- No hay change streams, watchers ni middleware que adivine intenciones: solo llamadas explícitas
  desde la capa de servicios.
- Logs: `creative_decision_recorded`, `creative_memory_candidate_created`,
  `creative_memory_remembered`, `creative_memory_forgotten`, `creative_memory_synthesis_failed` y
  `creative_memory_synthesis_discarded`.

## 16. Web

- `/workspace/:id/memory`, «Lo que Pixel ha aprendido».
  - Enterprise: dentro de **Marca** (etiqueta corta «Lo aprendido»).
  - Personal: junto a **Mi Pixel**. No hay grupos de navegación nuevos.
- Secciones: «Pixel ha notado» (candidatas, con el píxel señal), «Lo que tiene en cuenta» (activas)
  e historial plegado.
- **Tarjeta activa:** enunciado, «Aplica a», «Origen», Editar y Olvidar (con confirmación).
- **Tarjeta candidata:** el patrón, «¿Quieres que recuerde…?», Recordar y No fue intencional.
  Avisa si reemplazaría una memoria activa.
- «¿Por qué Pixel piensa esto?» muestra la evidencia humana, sin ids.
- PixelCommand confirma con «Recordar» u «Olvidar» en lugar de «Organizar».
- La vía principal sigue siendo hablar con Pixel; la página sirve para ver, confirmar, editar,
  olvidar y entender.

**Prompt 17 (Pixel Presence):** la navegación conserva «Lo aprendido» (Enterprise: Marca = ADN de
marca · Brand Guardian · Lo aprendido · Personaje; Personal: junto a Mi Pixel). «Recordar» y
«Olvidar» funcionan igual desde el Pixel Dock y por voz, pero la confirmación sigue siendo un clic.
Las preferencias de voz y movimiento **no** son memoria creativa: son del dispositivo
(`docs/PIXEL-PRESENCE.md` §5) y nunca entran al contexto de la IA.

## 17. Coste y rendimiento

- Registrar una decisión cuesta 1 inserción + 2 consultas por clave (memorias de la clave y eventos
  de la clave desde el corte), con índices `{ workspaceId, signals.normalizedKey, occurredAt }` y
  `{ workspaceId, normalizedKey, status }`.
- El resolver hace 1 consulta, sin N+1.
- No se llama a la IA por evento.
- Sin base vectorial, sin colas ni workers: las interfaces (`resolveCreativeMemories`,
  `synthesizeCopyEdits`) quedan listas para cambiar el retrieval más adelante.

## 18. Limitaciones (no implementado)

- No hay pruebas con Claude real (SKIPPED).
- Léxico en español y acotado: lo que no cubre solo se recuerda si se pide explícitamente, o vía
  sintetizador en ediciones de texto.
- Los alcances `project` y `content_plan` no se crean desde la conversación.
- El evento `creative_resource_rejected` aún no se emite.
- Sin decay.
- Sin equipos, roles ni aprobaciones.
- Sin aprendizaje por métricas o engagement.
- Sin embeddings ni base vectorial.
- Sin reescritura automática del ADN.
