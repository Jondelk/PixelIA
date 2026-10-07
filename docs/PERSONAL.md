# Pixel Personal

> **Enterprise and Personal share Pixel Core but use different domain contexts.**

## 1. Qué es

Pixel Personal es el **Director Creativo Personal** de una persona. Ayuda a organizar ideas, pensar
creativamente, orientar el contenido, tomar decisiones, mantener coherencia con quien es, planificar
de forma creativa, apoyar proyectos y alinear el trabajo con sus objetivos.

No es un terapeuta, ni un life coach genérico, ni un asistente administrativo genérico.

Comparte con Enterprise todo el **Pixel Core**: auth, `AIProvider`, conversaciones, avatar
(`AvatarProfile` + renderer 3D), memoria creativa, workspace y la UI del chat. Lo que cambia es el
**contexto de dominio**: en lugar de `Company → BrandDNA` usa `PersonalProfile → PersonalDNA`.

```
User
 ↓
Workspace (type: personal)          ← uno por usuario
 ↓
PersonalProfile                     ← quién es (uno por workspace)
 ↓
PersonalDNA                         ← cómo lo entiende Pixel (versionado)
 ↓
AvatarProfile (sourceType: personal, sin companyId)
Conversation → Message · CreativeMemory   (recursos compartidos del workspace)
```

Flujo completo:

```
Login → Crear Pixel Personal → Onboarding (8 pasos, guardado progresivo) → PersonalProfile
→ PersonalDNA → "Así te entiende Pixel" → Avatar personal 3D → Chat con el PersonalDNA
```

## 2. Modelos

### PersonalProfile (`personal_profiles`)

Código: `apps/api/src/modules/personal/personalProfile.model.ts`. Contrato: `PersonalProfileSchema`
(`packages/contracts/src/personal.ts`).

| Campo | Tipo | Notas |
|---|---|---|
| `workspaceId` | ObjectId → Workspace | Requerido, **único** (un perfil por workspace) |
| `userId` | ObjectId → User | Siempre `workspace.ownerId` (nunca del cliente) |
| `name` | string | Del paso "Quién eres" (al crearse, el nombre del workspace) |
| `headline`, `bio`, `profession`, `location` | string \| null | Paso "Quién eres" |
| `roles`, `skills`, `interests` | string[] | Paso "Quién eres" |
| `onboarding` | `{ answers, updatedAt }` | Borrador por pasos; cada paso se valida con Zod al guardarse y al leerse |
| `personalDnaVersion` | number \| null | Versión vigente del ADN (null = "Configurar") |
| `avatarVersion` | number \| null | Versión vigente del avatar personal |

Índices: `{ workspaceId }` único. Plugin `tenantScoped` con clave `workspaceId`: toda consulta debe
llevar un `workspaceId` concreto (no `$exists`, `$ne`, `$in`…).

**Por qué el borrador vive en el perfil.** Es la opción más simple y la misma del Brand Brain
(`Company.onboarding`): el progreso no se mezcla con el ADN final, que es una entidad aparte y
versionada.

### PersonalDNA (`personal_dnas`)

Código: `apps/api/src/modules/personal/personalDna.model.ts`. Contrato: `PersonalDnaSchema`.
Entidad **independiente de BrandDNA** (otra colección, otro schema, otra clave de aislamiento).

| Sección | Contenido |
|---|---|
| `identity` | `name`, `professionalIdentity[]` (profesión + roles), `summary` (bio o frase), `interests[]` |
| `professionalProfile` | `roles`, `skills`, `industries`, `strengths` |
| `goals` | `professional`, `personal`, `content`, `shortTerm`, `longTerm` |
| `audience` | `primaryAudience`, `secondaryAudiences`, `needs`, `problems`, `desiredPerception` |
| `personality` | `traits`, `archetypes` (de la lista cerrada de 12, inferidos solo de los rasgos) |
| `communication` | `tone`, `formality` 1–5, `energy` 1–5, `language`, `preferredWords`, `avoidWords` |
| `creativeIdentity` | `styles`, `colors[{hex, name}]`, `references`, `visualPreferences`, `avoidVisuals` |
| `contentIdentity` | `themes`, `preferredFormats`, `platforms`, `frequencyPreference` |
| `workStyle` | `preferredWorkTimes`, `planningStyle`, `executionStyle`, `focusStyle`, `productivityPreferences` |
| `supportNeeds` | `wantsHelpWith`, `expectations` |
| `preferences` | Preferencias visuales + de productividad |
| `restrictions` | "Evitar visualmente: …" y "No usar «…»" |

Metadatos: `workspaceId`, `personalProfileId`, `version`, `sourceHash`,
`generator { kind: deterministic | ai | manual, version }`, timestamps. Índice `{ workspaceId,
version }` único; `tenantScoped` por `workspaceId`.

`interests` se añadió al ADN (no estaba en la propuesta conceptual) porque el avatar debe combinar
intereses y siempre sale del ADN, nunca del onboarding crudo.

**Completitud** (`personalDnaCompleteness`): 11 comprobaciones (resumen, roles, habilidades,
objetivos, audiencia, personalidad, tono, estilo, contenido, forma de trabajar, ayuda). Se muestra en
"Así te entiende Pixel" con lo que falta.

## 3. Onboarding personal

Ruta: `/workspace/:workspaceId/personal/onboarding` (solo workspaces personales). 8 pasos, cada uno
con su schema Zod en `packages/contracts/src/personalOnboarding.ts`:

| # | Paso (`step`) | Pregunta | Obligatorio |
|---|---|---|---|
| 1 | `identity` | ¿Quién eres y a qué te dedicas? | nombre y profesión |
| 2 | `goals` | ¿Qué quieres conseguir? | al menos un objetivo |
| 3 | `audience` | ¿A quién quieres llegar? | — |
| 4 | `personality` | Si tuvieras que describirte… | al menos un rasgo (sugerencias + propios) |
| 5 | `communication` | ¿Cómo hablas? | al menos un tono |
| 6 | `creative` | ¿Cómo se ve lo que haces? | — |
| 7 | `contentWork` | ¿Qué creas y cómo trabajas? (bloques Contenido y Trabajo) | — |
| 8 | `support` | ¿Qué quieres que Pixel haga por ti? | al menos una ayuda (`wantsHelpWith[]`) |

- **Guardado progresivo**: "Guardar y continuar" guarda solo ese paso (`PUT …/personal-profile`). Se
  puede salir y volver: el asistente retoma en el primer paso pendiente (`nextPersonalOnboardingStep`).
  El progreso (`completedSteps`, equivalente a `completionStep`) se calcula de las respuestas válidas.
- Al completar los 8 pasos, la API genera el PersonalDNA y la web lleva a "Así te entiende Pixel".
- La UI reutiliza los controles del Brand Brain (`TagInput`, `ScaleInput`, `ColorListInput`, `Field`)
  y el esqueleto compartido `WizardLayout` (también lo usa el onboarding de marca).

## 4. Generación del PersonalDNA

`PersonalDnaGenerator` (`apps/api/src/modules/personal/personalDna.generator.ts`), desacoplado del
controlador y del servicio:

```ts
interface PersonalDnaGenerator {
  readonly version: string;           // 'personal-rules-1' (o 'personal-rules-1+ai')
  generate(input: PersonalOnboardingInput): Promise<{ content: PersonalDnaContent; generator }>;
}
```

1. **Determinístico primero** (`generatePersonalDnaContent`): cada campo sale de una respuesta
   concreta. Lo que la persona no contó queda vacío (`null` / `[]`). Los arquetipos salen solo de
   los rasgos, con el léxico de marca ampliado con rasgos personales
   (`personalDna.lexicon.ts`); un rasgo desconocido se conserva, pero no se adivina su arquetipo.
2. **Enriquecimiento IA opcional** (solo con un proveedor real, `ai.mode === 'ai'`): salida
   estructurada con `PersonalDnaEnrichmentSchema` (Zod) y limitada a tres huecos:
   - `summary`, solo si no hay bio ni frase;
   - `strengths`;
   - `archetypes`, solo si los rasgos no revelan ninguno (lista cerrada).

   Cada propuesta se contrasta con el vocabulario de las respuestas y se descarta si no se apoya en
   ellas (p. ej. "ganó un premio en Cannes" no entra). Si la IA falla o devuelve algo inválido,
   queda el resultado determinístico. Con el proveedor demo no se llama a la IA.

**Versiones.** Cada cambio en las respuestas crea una versión nueva; las mismas respuestas no
duplican versiones (`sourceHash` = hash de respuestas + versión del generador).
`PUT …/personal-dna` crea una versión `manual` que conserva el hash de las respuestas de las que
partió: volver a guardar esas respuestas no la pisa, y `POST …/personal-dna/generate` la regenera
explícitamente desde las respuestas (el historial se conserva).

## 5. "Así te entiende Pixel"

Ruta: `/workspace/:workspaceId/personal/dna`. Bloque azul PIXELES con un resumen en frases armado
solo con lo que la persona contó (`personalUnderstanding`), la completitud y lo que falta, y las
secciones: identidad, roles y habilidades, objetivos, audiencia, personalidad (arquetipo), tono,
estilo creativo (con sus colores), contenido, forma de trabajar y en qué ayuda Pixel ("Pixel
nunca"). Los grupos vacíos no se muestran: es un resumen, no un formulario. "Editar mi información"
vuelve al onboarding.

## 6. Avatar personal

Reutiliza `AvatarProfile` (no hay modelo nuevo) y el renderer 3D (no hay renderer nuevo):

```
sourceType = "personal"   workspaceId = workspace personal   companyId = (ausente)
personalDnaVersion = versión del PersonalDNA de origen       brandDnaVersion = (ausente)
```

**Mismo endpoint** `POST /api/workspaces/:workspaceId/avatar/generate`: la API resuelve el ADN de
origen por `workspace.type` (enterprise → BrandDNA de su empresa; personal → PersonalDNA). El
avatar personal nunca lee BrandDNA.

`PersonalAvatarConceptEngine` (`apps/api/src/modules/avatars/engine/personalAvatarEngine.ts`,
versión `personal-avatar-rules-1`) **no** es "profesión → objeto". Combina, con pesos:

- profesión, roles, habilidades e intereses;
- personalidad (rasgos y arquetipo);
- estilo creativo, preferencias visuales y colores;
- temas, formatos y plataformas de contenido;
- forma de trabajar;
- energía y formalidad al comunicar;
- restricciones ("estilos que debe evitar").

Las restricciones vetan tipos de personaje, rostros caricaturescos y accesorios.

| Tipo | Cuándo | Render (variantes existentes) |
|---|---|---|
| `tech_character` | Profesión, rasgos o estilo tecnológicos | `block` con líneas de panel y visor |
| `creative_companion` | Oficio creativo + lado lúdico o cercano | `blob` (lúdico) o `drop` (sereno) |
| `stylized_human` | Oficios de trato con personas (consultoría, docencia…) | `capsule` con extremidades |
| `abstract_character` | Refinado/sereno, o cuando nada domina | `crystal` (preciso) o `drop` (fluido) |
| `object_inspired` | Un objeto con evidencia fuerte en el ADN (cámara, auriculares, gafas, brote) | `block`/`capsule`/`seed` + accesorio |

- **Colores**: los del ADN; sin colores, una paleta derivada del primer estilo elegido (y se dice
  así en la razón creativa), nunca al azar.
- **Nunca infantil**: el `avoid` incluye siempre "Estética infantil o de mascota genérica"; el rostro
  expresivo exige humor + informalidad y respeta "infantil/caricatura" en las restricciones.
- **Rationale**: cada decisión cita rutas del PersonalDNA (`creativeIdentity.styles`,
  `identity.professionalIdentity`…).
- Regenerar sobre el mismo ADN explora la siguiente alternativa viable (variación).

Ejemplos: una fotógrafa editorial minimalista y serena da una cámara reinterpretada, mate, marfil y
carbón, con rostro esculpido y movimiento elegante. Un streamer enérgico y divertido da un
compañero creativo violeta y cian con auriculares de estudio y movimiento juguetón. Un director
creativo de diseño, audiovisual y software, estratégico y tecnológico, da un núcleo tecnológico
oscuro con visor de encuadre: formas limpias, acabado premium y nada de caricatura.

**Renderer**: soporte visual mínimo añadido en `sceneSpec.ts` y `AvatarAccessory.tsx`: `lens` (lente
de cámara en el pecho o visor de encuadre en la mano), `headphones` y `glasses`. El resto
(`PixelAvatar`, cuerpo, rostro, ojos, boca, controlador, estados idle/thinking/listening/speaking/happy)
es el mismo.

## 7. PersonalContextBuilder

`apps/api/src/modules/conversations/context/personalContext.builder.ts`. Carga, siempre filtrando por
el `workspaceId` del workspace autorizado:

```
Workspace → PersonalProfile → PersonalDNA → AvatarProfile (vigente) → CreativeMemory (activas)
```

Todavía no carga Tasks, Projects ni ContentItems porque no existen. Nunca toca `Company` ni `BrandDNA`.

- Sin PersonalDNA → `not_configured` con `reason: personal_context_not_configured`: el chat responde
  **409** y la web lleva al onboarding.
- Con PersonalDNA → `buildPersonalPixelContext` (función pura,
  `personalPixelContext.builder.ts`) compone el prompt:
  - **Director Creativo Personal**, en segunda persona. No terapeuta, no life coach genérico, no
    asistente administrativo genérico.
  - Usa el ADN como criterio, no como contenido.
  - Prohíbe respuestas genéricas ("publica un reel, un carrusel y una historia").
  - No inventa proyectos, clientes ni cifras: si necesita uno, propone y hace una sola pregunta.
  - Palancas creativas propias de la persona: tema → serie, tensión de su público, percepción
    deseada y postura del arquetipo en segunda persona.
- El brief va entre `<personal_context>` (distinto de `<brand_context>`). El proveedor demo lo usa
  para componer respuestas sin IA (`composePersonalReply`) con el objetivo, la audiencia, las
  plataformas, el ritmo según su energía, su estética, su voz y lo que evita.

Los mensajes guardan en `meta` la versión del ADN con la que respondieron: `personalDnaVersion`
(personal) o `brandDnaVersion` (enterprise); el otro es `null`.

**Prueba conceptual** (`apps/api/test/personalChat.test.ts`). Una fotógrafa editorial (objetivo:
vender sesiones premium) y un streamer (objetivo: crecer su comunidad) preguntan "¿Qué debería
publicar esta semana?". Las respuestas comparten menos del 35 % del vocabulario y cada una usa
solo su objetivo, sus plataformas, su ritmo y sus límites.

## 8. Rutas (web)

| Ruta | Pantalla |
|---|---|
| `/workspace/:workspaceId` | Inicio: "Configura tu Pixel Personal" (sin ADN) o Home (Tu Pixel, Tu ADN personal, Chat) |
| `/workspace/:workspaceId/personal/onboarding` | Onboarding de 8 pasos |
| `/workspace/:workspaceId/personal/dna` | "Así te entiende Pixel" |
| `/workspace/:workspaceId/pixel` | Mi Pixel (mismo `PixelStudio` que Enterprise) |
| `/workspace/:workspaceId/chat` | Chat (mismo `ChatStudio` que Enterprise); sin ADN → onboarding |

Navegación personal: **Inicio · Mi ADN · Mi Pixel · Chat** (`workspaceNav(id, 'personal')`).
Enterprise conserva la suya. En "Tus Pixels" la tarjeta personal muestra **Configurado** (hay
PersonalDNA) o **Configurar**. Las rutas `personal/*` en un workspace enterprise redirigen a su inicio.

## 9. Endpoints

Todos bajo `requireAuth` + `requireWorkspaceAccess` (dueño del workspace; ajeno → **404**).

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/workspaces/:id/personal-profile` | `{ profile \| null, onboarding }` |
| PUT | `/api/workspaces/:id/personal-profile` | Guarda un paso `{ step, data }`; con los 8 completos genera el ADN |
| GET | `/api/workspaces/:id/personal-dna` | `{ personalDna \| null, completeness \| null }` |
| PUT | `/api/workspaces/:id/personal-dna` | Corrige secciones (parcial, estricto) → versión `manual`. Sin ADN → 409 |
| POST | `/api/workspaces/:id/personal-dna/generate` | (Re)genera desde las respuestas. Onboarding incompleto → 409 |
| GET/POST | `/api/workspaces/:id/avatar[/generate]` | Mismo endpoint que Enterprise; Personal sin ADN → 409 `personal_dna_missing` |
| GET/POST | `/api/workspaces/:id/conversations[/:cid/messages]` | Mismo chat; Personal sin ADN → 409 `personal_context_not_configured` |

**Tipo incorrecto → 400** con `details.reason = workspace_type_mismatch`. Lo devuelven
`personal-profile` y `personal-dna` en un workspace enterprise (middleware
`requirePersonalWorkspace` + defensa en el servicio), y `POST /api/workspaces/:id/company` en uno
personal. **409** queda para "el tipo es correcto pero falta configurarlo".

`GET /api/workspaces[/:id]` devuelve además `personal: { name, completedSteps, personalDnaVersion }`
en los workspaces personales (`null` en enterprise).

## 10. Aislamiento (cubierto por tests)

- Personal A no puede leer, editar ni regenerar el perfil, el ADN, el avatar ni el chat de B (404).
- Un workspace enterprise no puede usar los endpoints personales (400).
- Un workspace personal no puede tener empresa (400) ni dos perfiles (índice único + test de
  guardados simultáneos).
- `PersonalProfile` y `PersonalDNA` exigen `workspaceId` concreto en cada consulta (`tenantScoped`).
- El avatar personal no usa BrandDNA (no lleva `companyId` ni `brandDnaVersion`).
- El `PersonalContextBuilder` nunca recupera datos Enterprise; dos workspaces del mismo dueño
  (empresa + personal) no se mezclan, tampoco sus memorias creativas.

Tests: `personalProfile.test.ts`, `personalDna.test.ts`, `personalDna.generator.test.ts`,
`personalAvatar.test.ts`, `avatarIndexes.test.ts`, `contextBuilders.test.ts`, `personalChat.test.ts`
(API) y `personal.test.ts` (contracts).

## 11. Índices de AvatarProfile

Los índices legacy por empresa (`companyId_1_version_-1` **único** y `companyId_1_brandDnaVersion_1`)
no eran parciales: indexaban los documentos sin `companyId` como `null`, así que el segundo avatar
personal v1 de cualquier usuario chocaba con el primero. Ahora:

| Índice | Definición |
|---|---|
| `workspaceId_1_version_-1` | Único, parcial (`workspaceId` existe). Versiones por workspace |
| `workspaceId_1_brandDnaVersion_1` | Enterprise (variaciones por ADN) |
| `workspaceId_1_personalDnaVersion_1` | Parcial (`personalDnaVersion` existe). Personal |
| `brand_company_version` | `{ companyId, version: -1 }` único, **parcial** (`companyId` existe) |
| `brand_company_dna_version` | `{ companyId, brandDnaVersion }`, **parcial** |

`upgradeAvatarProfileIndexes()` (`avatarProfile.indexes.ts`) crea los nuevos y retira los dos legacy
si existen. Es idempotente y no toca datos. Se ejecuta al arrancar la API (tras conectar) y en
`npm run migrate:workspaces`. Verificado sobre una base con datos de la versión anterior: retira
`companyId_1_version_-1` y `companyId_1_brandDnaVersion_1`, conserva los avatares Enterprise y su
historial, y los avatares personales se crean sin conflicto.

**Rollback**: la versión anterior intenta recrear sus índices al arrancar. Si no hay avatares
personales, lo consigue. Si los hay, su índice único legacy no se puede crear: Mongoose lo registra
como error de índice y la app sigue funcionando para Enterprise, porque esa versión no lee avatares
personales. Al volver a esta versión, el arranque deja los índices como arriba.

## 12. Limitaciones

- El enriquecimiento IA del ADN solo actúa con un proveedor real; su verificación es léxica (puede
  descartar una fortaleza válida dicha con otras palabras; nunca acepta una sin apoyo).
- La edición manual del ADN existe en la API (`PUT …/personal-dna`) pero la web edita las respuestas
  del onboarding, no secciones sueltas.
- El avatar personal es paramétrico (variantes existentes + 3 accesorios); no hay figura humana con
  rasgos.
- Sin memoria creativa automática: el builder carga memorias activas si existen, pero aún no se
  crean desde el chat.
- Un Pixel Personal por usuario; sin compartir ni colaboradores.

## 13. Próximos pasos (Prompt 9 en adelante; no construidos)

Tasks, Projects, ContentItem y Content Planner/Calendar con `workspaceId` como clave de aislamiento,
Daily Director, memoria creativa desde el chat, y convergencia de las pantallas Enterprise a
`/workspace/:workspaceId`. Fuera de alcance por ahora: notificaciones, calendarios externos, Gmail,
redes sociales, analytics, hábitos, recordatorios, automatizaciones, equipos y billing.
