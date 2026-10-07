# Entidades — Pixel MVP 0.1

Las entidades se definen como **schemas Zod en `packages/contracts`** (fuente de verdad) y se
persisten con **modelos Mongoose en `apps/api`**. Los IDs viajan como `string` (ObjectId hex) en los contratos.

Convenciones comunes:

- Todas tienen `id`, `createdAt`, `updatedAt` (en Mongo: `_id` + `timestamps: true`).
- **Entidades de empresa** (`BrandDNA`, `AvatarProfile`, `Conversation`, `Message`, `CreativeMemory`)
  tienen `companyId` **requerido e indexado** y usan el plugin `tenantScoped`.
- `User` y `Company` son las raíces: `Company.ownerId` define el acceso.

## Diagrama

```mermaid
erDiagram
  USER ||--o{ COMPANY : "posee (ownerId)"
  COMPANY ||--o{ BRAND_DNA : "versiones (companyId)"
  COMPANY ||--o{ AVATAR_PROFILE : "versiones (companyId)"
  BRAND_DNA ||--o{ AVATAR_PROFILE : "origina (brandDnaId)"
  COMPANY ||--o{ CONVERSATION : "companyId"
  USER ||--o{ CONVERSATION : "userId"
  CONVERSATION ||--o{ MESSAGE : "conversationId"
  COMPANY ||--o{ MESSAGE : "companyId"
  COMPANY ||--o{ CREATIVE_MEMORY : "companyId"
  MESSAGE |o--o{ CREATIVE_MEMORY : "source.messageId"
```

---

## 1. User

Persona que usa Pixel. No pertenece a una empresa (puede tener varias).

| Campo | Tipo | Reglas |
|---|---|---|
| `name` | string | 1–80 caracteres |
| `email` | string | Único, minúsculas, formato email |
| `passwordHash` | string | bcrypt (`bcryptjs`). `select: false`. **Nunca** sale en DTOs |
| `createdAt` / `updatedAt` | Date | Automáticos |

Índices: `{ email: 1 }` único. ✅ Implementado (`apps/api/src/modules/auth/user.model.ts`).

## 2. Company

Empresa cuyo Pixel se construye. Contiene el **onboarding crudo** como subdocumento (no es una
entidad aparte en 0.1).

| Campo | Tipo | Reglas |
|---|---|---|
| `ownerId` | ObjectId → User | Requerido. Único dueño en 0.1. Siempre sale de la sesión, nunca del body ✅ |
| `name` | string | 2–120 ✅ |
| `slug` | string | Generado del nombre (`cafe-tinto`), único por dueño (`cafe-tinto-2`…). No cambia al renombrar ✅ |
| `industry` | string | 2–80, requerido ✅ |
| `description` | string | 0–2000, por defecto `''` ✅ |
| `logoUrl` | string \| null | URL http(s) opcional ✅ |
| `status` | `draft \| onboarding \| analyzing \| ready \| failed` | Por defecto `draft`. No editable por PATCH. Ver máquina de estados en `MVP.md` ✅ |
| `createdAt` / `updatedAt` | Date | Automáticos ✅ |
| `onboarding.data` | `BrandOnboardingInput` (parcial en borrador) | Validación completa solo al enviar |
| `onboarding.submittedAt` | Date \| null | |
| `analysis.startedAt` / `finishedAt` | Date \| null | |
| `analysis.attempts` | number | |
| `analysis.error` | `{ code, message } \| null` | Mensaje apto para el usuario |
| `onboarding` | `{ answers, updatedAt }` | Ver "Onboarding de marca" ✅ |
| `brandDnaVersion` | number \| null | Versión vigente del BrandDNA ✅ |
| `activeAvatarProfileId` | ObjectId \| null | Versión vigente |

Índices: `{ ownerId: 1, createdAt: -1 }`, `{ ownerId: 1, slug: 1 }` único ✅; `{ status: 1, 'analysis.startedAt': 1 }` (recuperación de jobs, Etapa 6).

✅ = implementado. Los campos `onboarding.*`, `analysis.*` y `active*Id` llegan en las Etapas 4 y 6.

### Onboarding de marca (embebido en `Company.onboarding`) ✅

`Company.onboarding = { answers: { <paso>: <datos> }, updatedAt }`. Cada paso se valida completo con
su schema de `packages/contracts/src/brandOnboarding.ts` al guardarse (`PUT /brand-dna`) y al leerse
(un paso inválido se descarta y vuelve a quedar pendiente). Los pasos completados se derivan de las
respuestas presentes. Las listas se recortan y deduplican (sin distinguir mayúsculas).

| Paso | Campos (requeridos en **negrita**) |
|---|---|
| `company` | **name**, **industry**, **description**, **history**, origin (opcional). Sincroniza name/industry/description de la empresa |
| `purpose` | **mission**, **vision**, **purpose**, **values[]** (1–8) |
| `audience` | **targetAudience**, **needs[]**, **problems[]**, **characteristics[]** (≥ 1 cada una) |
| `personality` | **attributes[]** (3–10, sugerencias o texto libre; el orden indica importancia) |
| `communication` | **tone[]** (1–6), **formality** (1–5), **energy** (1–5), **language** (`es`, `en`, `pt`, `fr`, `it`, `de`), wordsToUse[], wordsToAvoid[] |
| `visual` | **colors[]** (1–8, `{ hex, name? }`), **styles[]**, materials[], **shapes[]**, references[], recurringElements[], avoid[] |
| `competition` | competitors[], **differentiators[]** |
| `creative` | **likes[]**, dislikes[], visualReferences[], restrictions[] |

## 3. BrandDNA — lo que la empresa **ES** ✅

Colección `brand_dnas`. Schema: `BrandDnaContentSchema` / `BrandDnaSchema` en
`packages/contracts/src/brandDna.ts` (fuente de verdad, validada al escribir y al leer).

**Generación (fase actual): determinística, sin IA** (`apps/api/src/modules/brand-dna/brandDna.generator.ts`,
versión de reglas `rules-1`). Mismas respuestas → mismo ADN. Se genera cuando los 8 pasos están
completos; cada cambio posterior en las respuestas crea una **versión nueva** (historial). Si las
respuestas no cambian (`sourceHash`), no se crea versión. La vigente está en `Company.brandDnaVersion`.
Cuando exista la capa de IA, `generator.kind` pasará a `ai` con el mismo contrato.

| Bloque | Campos | Cómo se obtiene (reglas) |
|---|---|---|
| **meta** | `companyId`, `version`, `generator { kind, version }`, `sourceHash`, `createdAt` | — |
| **identity** | `name`, `industry`, `description`, `story`, `origin`, `essence` | `essence` = "{nombre} es una marca {3 primeros atributos} de {sector}, con origen en {origen}." |
| **purpose** | `mission`, `vision`, `purpose`, `values[]` | Directo del paso 2 |
| **audience** | `summary`, `needs[]`, `problems[]`, `characteristics[]` | Directo del paso 3 |
| **personality** | `traits[{ label, weight 0–1, recognized }]`, `dimensions { innovation, sophistication, warmth, playfulness, energy }` (0–100) | Peso por orden. Léxico de rasgos (`brandDna.lexicon.ts`, insensible a tildes/género/número) → ejes; la formalidad empuja la sofisticación; la energía viene del paso 5 |
| **archetypes** | `primary`, `secondary \| null`, `ranking[]` — cada uno `{ id, score 0–100, signals[] }` | Afinidad del léxico × peso del rasgo (+ tono al 50 %). 12 arquetipos (`BRAND_ARCHETYPES`). Sin señales → `everyman`. Secundario si score ≥ 40 |
| **communication** | `tone[]`, `formality { level, label }`, `energy { level, label }`, `language { code, name }`, `vocabulary { preferred[], avoid[] }`, `guidelines { do[], dont[] }` | Pautas derivadas de tono, formalidad, energía, idioma y vocabulario |
| **visualLanguage** | `palette[{ hex, name, role, temperature, luminance }]`, `temperature`, `styles[]`, `materials[]`, `shapes[]`, `shapeLanguage`, `references[]`, `recurringElements[]` | Roles: los colores cromáticos en orden → primary, secondary, accent, support; grises/blancos rotos → neutral. Temperatura por tono (HSL). `shapeLanguage` por votos de formas (×1) y estilos (×0,5): organic/geometric/structural/fluid/soft/mixed |
| **differentiators** | `statements[]`, `competitors[]` | Paso 7 |
| **creativePreferences** | `likes[]`, `dislikes[]`, `visualReferences[]` | Paso 8 |
| **restrictions** | `creative[]`, `words[]`, `visual[]` | Consolidado de restricciones (paso 8), palabras a evitar (paso 5) y elementos visuales a evitar (paso 6) |

Índices: `{ companyId: 1, version: -1 }` único. Plugin `tenantScoped`: toda consulta exige `companyId`.

## 4. AvatarProfile — cómo esa identidad **se ve** como Pixel

Generado por `AvatarDesignService` **exclusivamente a partir del BrandDNA**. Todos los valores
visuales pertenecen a catálogos cerrados que el renderer conoce.

| Bloque | Campos | Valores |
|---|---|---|
| **meta** | `companyId`, `brandDnaId`, `brandDnaVersion`, `version`, `generatedBy` | |
| **concept** | `name` (nombre del Pixel de la empresa), `metaphor` (ej. "grano de café antropomórfico"), `summary` | texto |
| **form** | `archetype` | `seed` · `crystal` · `block` · `blob` · `drop` · `capsule` |
| | `proportions { width, height, depth }` | 0.6–1.4 (factores de escala) |
| | `roundness` | 0–1 |
| | `surfaceDetail` | `none` · `center-groove` · `facets` · `panel-lines` · `grain` · `stripes` |
| **palette** | `body`, `secondary`, `accent`, `eyes`, `background` | hex |
| **material** | `style`, `roughness`, `metalness` | `matte` · `satin` · `glossy` · `metallic` · `clay` · `glass`; 0–1 |
| **face** | `eyeStyle`, `eyeSize`, `mouthStyle`, `eyebrows`, `blush` | `round` · `oval` · `visor` · `line` · `dot`; 0–1; `smile` · `line` · `open` · `none`; bool; bool |
| **expression** | `default` | `warm` · `neutral` · `confident` · `curious` · `playful` · `calm` |
| **motion** | `idle`, `energy` | `bounce` · `float` · `sway` · `breathe` · `hover-spin`; 0–1 |
| **lighting** | `mood` | `warm` · `cool` · `studio` · `dramatic` |
| **rationale** | `[{ attribute, value, reason, dnaReference }]` | Mínimo 5 entradas; `dnaReference` es una ruta del BrandDNA (ej. `visualDirection.shapeLanguage`) |

Índices: `{ companyId: 1, version: -1 }` único, `{ companyId: 1, brandDnaId: 1 }`.

### Ejemplo (café artesanal colombiano, abreviado)

```json
{
  "concept": { "name": "Pixel Origen", "metaphor": "Grano de café antropomórfico", "summary": "Cálido, cercano y orgulloso de su origen." },
  "form": { "archetype": "seed", "proportions": { "width": 0.9, "height": 1.15, "depth": 0.8 }, "roundness": 0.85, "surfaceDetail": "center-groove" },
  "palette": { "body": "#6B3E26", "secondary": "#A9714B", "accent": "#E8C07D", "eyes": "#1E120C", "background": "#F5EBDD" },
  "material": { "style": "satin", "roughness": 0.55, "metalness": 0.0 },
  "face": { "eyeStyle": "round", "eyeSize": 0.6, "mouthStyle": "smile", "eyebrows": true, "blush": true },
  "expression": { "default": "warm" },
  "motion": { "idle": "bounce", "energy": 0.35 },
  "lighting": { "mood": "warm" },
  "rationale": [
    { "attribute": "form.archetype", "value": "seed", "reason": "El producto central es el grano de café de origen.", "dnaReference": "identity.offering" },
    { "attribute": "palette.body", "value": "#6B3E26", "reason": "Tostado medio, color principal de la marca.", "dnaReference": "visualDirection.palette" },
    { "attribute": "expression.default", "value": "warm", "reason": "Rasgo 'calidez' con intensidad 5.", "dnaReference": "personality.traits" },
    { "attribute": "motion.energy", "value": "0.35", "reason": "Ritmo pausado, artesanal; no frenético.", "dnaReference": "voice.toneScales" },
    { "attribute": "material.style", "value": "satin", "reason": "Textura natural del grano tostado, sin brillo artificial.", "dnaReference": "visualDirection.materials" }
  ]
}
```

## 5. Conversation

| Campo | Tipo | Reglas |
|---|---|---|
| `companyId` | ObjectId → Company | Requerido, indexado |
| `userId` | ObjectId → User | Quien la creó |
| `title` | string | Derivado del primer mensaje o "Nueva conversación" |
| `lastMessageAt` | Date | |

Índices: `{ companyId: 1, lastMessageAt: -1 }`.

## 6. Message

| Campo | Tipo | Reglas |
|---|---|---|
| `companyId` | ObjectId | Requerido, indexado (redundante a propósito: aislamiento sin joins) |
| `conversationId` | ObjectId → Conversation | Debe pertenecer al mismo `companyId` |
| `role` | `user \| pixel` | |
| `content` | string | 1–8000 caracteres |
| `brandDnaVersion` | number \| null | Versión del ADN con la que respondió Pixel |
| `ai` | `{ provider, model, latencyMs, usage? } \| null` | Solo en mensajes de Pixel |

Índices: `{ companyId: 1, conversationId: 1, createdAt: 1 }`.

## 7. CreativeMemory

Conocimiento creativo acumulado de la empresa (preferencias, decisiones, rechazos). En 0.1 se crea
**solo de forma explícita** por el usuario; la extracción automática queda para después.

| Campo | Tipo | Reglas |
|---|---|---|
| `companyId` | ObjectId | Requerido, indexado |
| `kind` | `preference \| decision \| insight \| rejection` | |
| `content` | string | 1–1000 caracteres |
| `source` | `{ type: 'message' \| 'manual', conversationId?, messageId? }` | Referencias del mismo `companyId` |
| `createdByUserId` | ObjectId → User | |
| `active` | boolean | `DELETE` = desactivar |

Índices: `{ companyId: 1, active: 1, createdAt: -1 }`.

Uso en chat: las memorias activas más recientes (límite configurable) se incluyen en el system prompt
de `PixelChatService`, siempre filtradas por `companyId`.
