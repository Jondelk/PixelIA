# Pixel Presence V1 (Prompt 17)

> «Pixel should feel present, not merely available.»

Pixel Presence es la capa que hace visible **qué está haciendo Pixel** en cada momento (escuchar,
pensar, hablar, revisar, terminar) en toda la interfaz de un workspace, y que añade la voz como
**otra entrada** de PixelCommand. No es un asistente nuevo, ni un motor nuevo, ni un modelo de Mongo:
es estado efímero de la web más dos cambios pequeños en la API (contexto del recurso y vista previa
del personaje en el resumen del workspace).

Código: `apps/web/src/features/presence/` (web) y, en la API, `pixel-command` (contexto del recurso)
y `workspaces` (vista previa del avatar). Contrato del asset 3D futuro: `docs/AVATAR-ASSET-CONTRACT.md`.

## 1. Arquitectura

```
AppShell
└─ PixelPresenceProvider            estado compartido + proveedores de voz (uno por app)
   └─ WorkspaceLayout / CompanyLayout
      └─ PresenceScope              liga el Pixel activo {workspaceId, name, avatar, configured}
         ├─ PresenceStatus          chip de la topbar («Pixel listo», «Pensando…»)
         ├─ PixelHomeHero           Inicio: Pixel interactivo + «¿Qué necesitas hacer?»
         ├─ WithAmbientPixel        Campañas / Plan de contenido: Pixel pequeño (2D)
         ├─ PixelThinking           planner: Pixel en foco mientras piensa
         └─ PixelDock               Pixel persistente fuera del Inicio, con el recurso en contexto
```

- **Fuente de verdad del personaje:** `AvatarProfile` (derivado del ADN). Presence no crea otra
  entidad: `VoiceProfile` y `BehaviorProfile` se **derivan** del personaje en el cliente
  (`presenceProfile.ts`).
- **Quién mueve el estado:** solo los flujos existentes, con eventos. `PixelCommand` (think → la
  respuesta → success/warn/fail), el Guardian (`review` → `presenceAfterReview`), el compositor
  (`listen`) y la voz (`speak`). Ninguna pantalla manipula clases a mano.
- **Lo que no hace:** no persiste nada en Mongo, no llama a la IA, no decide capacidades (eso sigue
  en `capabilities.ts`) y nunca confirma una propuesta.

## 2. Sistema de estados

`presenceMachine.ts` (puro y testeado).

| Estado | Evento | Cuándo | Pose del avatar procedural |
|---|---|---|---|
| `idle` | `idle` | reposo | `idle` |
| `listening` | `listen` | micrófono abierto | `listening` |
| `thinking` | `think` | PixelCommand espera la respuesta | `thinking` |
| `speaking` | `speak` | la voz está diciendo la respuesta | `speaking` |
| `reviewing` | `review` | el Guardian revisa | `thinking` |
| `success` | `success` | algo quedó organizado o el informe salió bien | `happy` |
| `warning` | `warn` | el Guardian pide ajustes o bloquea | `idle` |
| `error` | `fail` | falló la petición | `idle` |

- Las transiciones están en una tabla (`ALLOWED`); una no permitida deja el estado como estaba.
  Cualquier estado puede volver a `idle` o pasar a `error`: nunca queda colgado.
- `success` (2,4 s), `warning` (3,6 s) y `error` (3,6 s) son **transitorios**: vuelven solos a `idle`.
- Cada estado tiene un texto honesto (`PRESENCE_LABELS`): nunca un porcentaje ni un progreso
  inventado. El estado nunca se comunica solo con movimiento o color.

## 3. Avatar Runtime

`PixelPresenceAvatar.tsx` con **tres niveles de presencia** para no poner un personaje grande en
todas partes:

| Nivel | Dónde | Render | WebGL |
|---|---|---|---|
| `ambient` | Campañas, Plan de contenido, estados vacíos, Dock plegado, Tus Pixels | 2D (`PixelPreview`, SVG) | nunca |
| `interactive` | Inicio (Enterprise y Personal) | 3D (`AvatarStage`) | uno por pantalla |
| `focus` | `PixelThinking` (planner) | 3D | temporal |

- **Uno solo en 3D por pantalla.** El Inicio Personal tenía dos (el Pixel y el del Daily Director):
  el Daily Director usa ahora la vista 2D.
- **Sin personaje** (marca o persona sin configurar): Pixi neutral, nunca un avatar inventado.
- **Fallback:** `AvatarStage` ya detecta WebGL y tiene un `ErrorBoundary`; si el 3D no carga, cae a la
  vista 2D. Verificado en el navegador desactivando WebGL.
- **Movimiento reducido:** `AvatarStage`, `AvatarController` y `PixelAvatar` aceptan `reducedMotion`
  (tiempo congelado: pose fija). Se activa con `prefers-reduced-motion` o con «Reducir animaciones
  de Pixel»; el anillo deja de pulsar.
- **Animaciones:** hoy el avatar es procedural (`pose.ts`): `idle`, `thinking`, `listening`,
  `speaking`, `happy`. `avatarStateFor` traduce los 8 estados a esas 5 poses. Para un GLB futuro,
  `CLIP_PREFERENCES` / `resolveClip` eligen el primer clip disponible por estado (contrato en
  `AVATAR-ASSET-CONTRACT.md`); **hoy ningún avatar trae clips**, así que siempre devuelve `null`
  (pose procedural). Está preparado y testeado, no conectado a un loader.

## 4. Voice Runtime

`voice.ts`. La voz es **otra entrada** de PixelCommand, no otro asistente.

- `VoiceInputProvider` (`start(handlers)`, `stop()`, `supported`) y `VoiceOutputProvider`
  (`speak(text, options, handlers)`, `cancel()`, `voices()`, `onVoicesChanged()`, `supported`).
- **Proveedor V1:** Web Speech API del navegador (`SpeechRecognition` / `webkitSpeechRecognition`
  y `speechSynthesis`), con `lang: es-ES`. Sin dependencias nuevas ni servicio externo; la API no
  recibe audio. Un STT/TTS externo sería otro adaptador sin tocar PixelCommand.
- **Flujo:** micrófono → `listening` → transcripción final → `onSubmit(text, 'voice')` (el mismo que
  el teclado) → `thinking` → la respuesta se **muestra siempre** y, en una sesión de voz, también se
  **dice** (`speaking`) → `idle`. La API recibe `source: 'voice'` y lo trata igual que el texto
  (test en `apps/api/test/presence.test.ts`).
- **Nunca confirma por voz:** «Organizar» sigue siendo un clic. Una pregunta de Pixel también se dice
  en voz alta; la respuesta del usuario puede llegar por voz o por texto.
- **Qué se dice:** `spokenFor(command)` (pregunta, resumen del plan o respuesta) pasado por
  `spokenText`: ≤ 260 caracteres, sin viñetas, ids ni llaves. El detalle queda en pantalla.
- **Cuándo habla** (`speechFor`): solo dentro de una **sesión de voz** (empieza al pulsar el
  micrófono), con la voz activada, «Hablar en sesiones de voz» activado y TTS disponible. **Pixel
  nunca habla al abrir una pantalla.** «Escuchar a Pixel» (en Personaje) es la única otra salida y
  es una acción explícita.
- **Controles:** «Detener» (micrófono), «Dejar de hablar», «Seguir solo por texto» (cierra la sesión).
- **Sesión y cierres:** el micrófono y la voz se cierran al terminar, al desmontar la app y **al
  cambiar de Pixel** (`scopeSwitchStopsVoice`): TINTO nunca sigue hablando dentro de INVENTIA.
  Verificado en el navegador (la síntesis se cancela y el nuevo Pixel arranca en `idle`).
- **Lectura en el momento:** la sesión, las preferencias y el Pixel activo se leen de una referencia
  viva al hablar (la respuesta llega tras un `await` y el texto del micrófono desde un handler creado
  al pulsar). Así una respuesta tardía no habla con la sesión de otro Pixel ni se pierde.
- **Lip-sync:** fuera de alcance. `speaking` es una pose procedural (boca que oscila), no sincronía.
  El contrato reserva morph targets de visemas (`AVATAR-ASSET-CONTRACT.md` §6) para cuando se pida.

### 4.1 Degradación (siempre a texto)

| Situación | Qué ve el usuario |
|---|---|
| Navegador sin reconocimiento de voz (p. ej. Firefox) | Sin botón de micrófono; todo funciona por texto |
| Sin síntesis | Pixel no habla; la respuesta se ve igual |
| Permiso denegado | «El micrófono no está disponible. Puedes seguir escribiendo.» |
| Sin voz detectada / fallo | Aviso breve; el campo sigue editable |
| Voz desactivada en ajustes | Sin micrófono ni voz; texto intacto |

Los fallos se reportan con `reportPresence` (evento de ventana `pixel:presence`, sin datos del
usuario) y nunca bloquean PixelCommand.

### 4.2 Privacidad

- El micrófono solo se abre con una acción explícita y se cierra al terminar, navegar o cambiar de
  Pixel. Nunca graba en segundo plano.
- No se guarda audio ni transcripciones aparte: la transcripción entra como la petición de texto
  (y se guarda como cualquier PixelCommand).
- El reconocimiento del navegador puede usar el servicio del fabricante (Chrome envía el audio a
  Google): es una limitación del proveedor V1. **La primera vez que se pulsa el micrófono** en un
  dispositivo, Pixel lo explica antes de abrirlo: «Pixel utiliza las funciones de reconocimiento de
  voz disponibles en tu navegador. Dependiendo del navegador, el audio puede ser procesado por su
  proveedor. Pixel no almacena el audio.», con «Entendido» (abre el micrófono como siempre) y «Ahora
  no». Se recuerda por dispositivo (`localStorage` `pixel:voice-notice` = `seen`, con try/catch y
  respaldo en memoria para la sesión); el texto queda en Personaje → «Voz y movimiento» →
  «Privacidad de la voz».
- Sin clonación de voz ni «la voz de X»: `VoiceProfile` solo describe idioma, ritmo y energía.

## 5. Perfiles derivados

- **VoiceProfile** (`voiceProfileOf`): `language` (es-ES), `pace = 0.9 + energía · 0.2` (0,85–1,15),
  `energy` del `idleBehavior` del personaje. Un Pixel pausado habla más despacio.
- **BehaviorProfile** (`behaviorProfileOf`): `movementEnergy`, `gestureIntensity`, `idleTempo`,
  `responsePace`, derivados de la misma energía. Preparado y testeado; hoy el movimiento ya varía por
  la energía en `pose.ts` y este perfil aún no se consume (lo usará un runtime con clips).
- **Preferencias** (`PresencePreferences`): `voiceEnabled`, `autoSpeak`, `voiceId`, `rate`,
  `reduceMotion`. **Por dispositivo y por Pixel** en `localStorage` (`pixel:presence:<workspaceId>`)
  con try/catch: las voces dependen del navegador. Sin almacenamiento, valores por defecto.
  Se ajustan en Personaje → «Voz y movimiento».

## 6. Acentos por workspace

`workspaceAccent.ts` (`resolveAccent`). PIXELES conserva su sistema visual; cada Pixel solo añade un
acento sutil (anillo de presencia, borde de la miniatura, punto del chip). El color es un **dato**
del personaje (como la paleta del ADN), por eso va en línea y no como token.

- Candidatos: `accentColor` y luego `primaryColor` del personaje.
- Si no llega a **contraste 3:1** sobre Negro Cine (WCAG 1.4.11), se aclara en pasos de 12 %; si aun
  así no llega, acento del sistema (`SYSTEM_ACCENT`, tokens).
- El acento nunca sustituye al píxel señal amarillo ni al azul de las acciones principales.

## 7. Pixel persistente (Pixel Dock)

`PixelDock.tsx` + `dockContext.ts`. Fuera del Inicio, un control pequeño abajo a la derecha
(«Pixel · estado») abre un panel con **PixelCommand del mismo workspace**.

- Visible en las pantallas de trabajo y marca del workspace; oculto en el Inicio (ya tiene la
  entrada), en el chat, en los onboardings y fuera de un workspace (`dockVisibleAt`). Oculto también
  en un Pixel sin configurar.
- Se pliega al navegar y con Escape; «Cerrar Pixel» y «Ver la conversación completa» (→ chat).
- Plegado usa la figura 2D (nunca abre otro WebGL) y tiene nombre accesible propio
  («Abrir Pixel de INVENTIA»).

## 8. Pixel consciente del contexto

Dentro de un recurso, el Dock envía `contextHint.resource = { type, id }` (`dockResourceFor` según la
ruta): `campaign`, `content_plan`, `project` o `content_item`. «Hazme tres Reels con esto» dentro de la
campaña X usa X sin preguntar «¿de qué campaña?».

**Validación (API, `resolveContextResource`):** el id se busca con `{ _id, workspaceId }` del
workspace autorizado. Si no existe en **ese** Pixel → 400 `VALIDATION_ERROR` en
`contextHint.resource.id` («Ese recurso no existe en este Pixel»): un id de TINTO nunca se resuelve
en INVENTIA (test de aislamiento y comprobado en el navegador). De un recurso válido se derivan
`campaignId` / `projectId` para el planificador (`chosenProject`); la IA no ve el id como texto libre.

## 9. Niveles de presencia en la interfaz (UI Presence Pass)

| Pantalla | Presencia | Cambios |
|---|---|---|
| Tus Pixels | ambient (miniatura 2D con acento) | «Pixel Personal / Pixel Enterprise», estados humanos («Listo», «Configurar marca»), nombre del Pixel personal; monograma si no hay personaje |
| Inicio Enterprise | interactive | El Pixel y «¿Qué necesitas hacer?» arriba, sugerencias como inicio de frase (≤ 4); vacío = «INVENTIA está lista.» en lugar de ceros, solo si no existe **ningún** trabajo (una campaña en borrador, un proyecto planificado, una tarea pendiente o una pieza sin publicar ya cuentan: `isEmptyWork` + `counts.currentCampaigns`); el contador de campañas es «Campañas vigentes» (con «N activas»); «Ver todo» en lugar de «Nuevo proyecto»; tarjeta «Tu Pixel» (nombre del personaje, «Listo», una sola acción «Personalizar», sin repetir ADN / Personaje / Chat) |
| Inicio Personal | interactive | Igual; Daily Director debajo, con figura 2D; vacío = «Tu Pixel está listo.» |
| Campañas | ambient | Opciones manuales en «Más opciones» (Brief detallado, Crear manualmente); vacío con el Pixel en reposo |
| Plan de contenido | ambient + focus al pensar | «Más opciones» (Opciones avanzadas, Nuevo plan); microcopy «Pixel ya conoce el ADN…» |
| Brand Guardian | estado `reviewing` → resultado | Sin cambios de layout; la presencia refleja la revisión |
| Topbar | chip de estado | «API en línea» solo en desarrollo |
| Sidebar | — | Chat sale de la navegación (§10); Marca = ADN · Brand Guardian · Lo aprendido · Personaje |
| Personaje | — | Sección «Voz y movimiento» |

Lo manual sigue a un clic: ningún formulario se borró.

## 10. Decisión: Chat

Chat **sale de la navegación lateral** (Personal y Enterprise): se habla con Pixel desde el Inicio o
desde el Dock, que enlaza a «Ver la conversación completa». **La ruta `/chat` y todas las
conversaciones se conservan**; también el acceso «Chat» de la tarjeta de marca del Inicio Enterprise.
«Empresas» y «Personaje» se mantienen.

## 11. Accesibilidad

- Estado en texto con `aria-live="polite"` (avatar con `announce` y chip de la topbar).
- Micrófono, Detener, Dejar de hablar y Cerrar Pixel con nombre accesible; Escape pliega el Dock.
- Movimiento reducido del sistema o del usuario: pose fija y sin pulso.
- Las figuras 2D llevan su descripción; dentro de un botón, el botón tiene nombre propio.

## 12. Rendimiento

- `AvatarStage` se carga perezosamente (chunk de Three aparte); Tus Pixels, Campañas, Plan de
  contenido y el Dock no crean ningún contexto WebGL (todo 2D).
- Como máximo un 3D por pantalla (comprobado en el navegador: Inicio Enterprise y Personal = 1 canvas).
- Miniaturas: SVG de `PixelPreview` desde el `AvatarPreview` del resumen del workspace
  (`WorkspaceOverview.avatar`), sin imágenes generadas ni peticiones extra.

## 13. API

- `WorkspaceOverview.avatar: AvatarPreview | null` (concepto + `id` + `version`) y
  `PersonalSummary.avatarVersion` (contracts `workspace.ts`).
- `PixelCommand.contextHint.resource` (contracts `pixelCommand.ts`, strict) y su validación (§8).
- `pixelCommandRules`: «crea**me**» / «organíza**me**» se reconocen como petición de tareas.

## 14. Futuro (no implementado)


- **Avatar GLB** con clips (contrato listo, loader no): `AVATAR-ASSET-CONTRACT.md`.
- **Lip-sync** con visemas (morph targets reservados).
- **Generación automática de avatares 3D**, **clonación de voz**, voz en tiempo real (streaming) y
  proveedores STT/TTS externos: fuera de alcance hasta que se pidan.
