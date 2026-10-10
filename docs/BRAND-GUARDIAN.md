# Brand Guardian — juicio creativo explicable

Prompt 15. El control creativo de Pixel Enterprise. Pixel no solo crea: revisa su propio trabajo (y
el del usuario) contra el ADN conocido de la marca **antes** de pedir que se ejecute, explica qué
encontró y deja la decisión final al humano.

> **Principio de producto (ADR 35).** Pixel does not only generate. Pixel evaluates its own output
> against the user's or brand's known context before asking the user to commit to execution.
> Guardian provides explainable creative judgment, not opaque approval scores.

Código: `apps/api/src/modules/guardian/` (motor, evaluadores, score, corrección, persistencia, API),
`apps/api/src/ai/guardian{Payload,Lexicon}.ts`, `apps/api/src/ai/providers/demoGuardian.ts`,
`packages/contracts/src/guardian.ts`, `apps/web/src/features/guardian/` y el preflight en
`features/pixel-command/GuardianPreflight.tsx`.

## 1. Qué revisa y qué no

| Sí (en esta etapa) | Todavía no |
|---|---|
| Textos de propuestas, campañas, estrategias, planes, piezas y textos pegados | Imágenes reales: logo, tipografía, área de seguridad, proporciones, contraste medido, colores extraídos de píxeles, composición o fotografía reales |
| La dirección visual **escrita** de una estrategia (ánimo, colores, materiales, fotografía, composición, movimiento) | Rendimiento, métricas o "lo que premia el algoritmo" de una red |
| Coherencia con BrandDNA y, si aplica, con la estrategia de la campaña | Personal (no hay Personal Identity Guardian) |

La interfaz lo dice en cada informe: "Solo se revisan textos y descripciones: ninguna imagen".

## 2. Arquitectura

```
recurso (instantánea controlada) ─┐
BrandDNA (+ estrategia de campaña) ┼─► GuardianEngine
lo que aportó el usuario ──────────┘        │
                ┌───────────────────────────┼───────────────────────────┐
                ▼                           ▼                           ▼
     evaluadores deterministas   UNA evaluación semántica       validación de referencias
     (claims, restricciones,     estructurada (IA o demo)       y explicabilidad
      palabras, gritos, idioma,  para las dimensiones que la    (lo no fundamentado
      formato, dirección visual) piden                           se descarta)
                └───────────────────────────┬───────────────────────────┘
                                            ▼
                          GuardianScoreAggregator (backend) → GuardianReport
                                                              (hallazgos, dimensiones, score, resumen)
```

- **Un solo motor y un solo informe para todo:** modos `preflight`, `campaign`, `content_plan`,
  `content`, `copy` y `structured_visual_direction`. Recursos: `pixel_proposal`, `campaign`,
  `campaign_strategy`, `content_plan`, `content_plan_item`, `content_item` y `copy`.
- **Evaluadores** (`GuardianEvaluator`: `id`, `dimension`, `semantic`, `supports()`, `evaluate()`). Uno
  que no aplica (`supports` falso) deja su dimensión como `applicable: false` y no penaliza.

| Evaluador | Dimensión | Determinista | Semántico (IA/demo) |
|---|---|---|---|
| IdentityEvaluator | identity | — | ¿Se siente como esta marca? ¿Contradice su personalidad? ¿Usa algo propio? |
| CommunicationEvaluator | communication | Palabras que evita, gritos, urgencia frente a su energía y formalidad, idioma | Registro y cercanía |
| ClaimsEvaluator | claims | Cifras, promociones, claims de mercado, nombres propios y afirmaciones sobre clientes sin fundamento | — |
| RestrictionsEvaluator | restrictions | Restricciones explícitas, restricciones visuales y lo que la marca rechaza | — |
| StrategyEvaluator | strategy | Idea genérica que no usa ningún diferenciador | ¿Aprovecha el ADN? |
| CampaignAlignmentEvaluator | campaign_alignment | ¿Cada pieza desarrolla el concepto, los mensajes o los pilares? | Alineación conceptual |
| ContentEvaluator | content | Encaje plataforma–formato (convención de Pixel, no algoritmo) | Encaje con audiencia y objetivo |
| StructuredVisualDirectionEvaluator | visual_direction | Familias de estilo que chocan con el lenguaje visual del ADN (cyberpunk/neón frente a madera/kraft) | — |

Preparado para el futuro, sin implementar: VisualAssetEvaluator, LogoEvaluator, TypographyEvaluator,
AssetComplianceEvaluator, PerformanceEvaluator y MemoryEvaluator. Se añaden a `GUARDIAN_EVALUATORS`.

### Reutilización (sin duplicar)

`ClaimsEvaluator` reutiliza `unfoundedClaims`, `MARKET_CLAIMS` y `CUSTOMER_ASSERTION` del Campaign
Manager y `PROMO_CLAIMS` del planner Enterprise, y solo añade los patrones de superioridad que
faltaban ("#1", "el mejor café del…"). Las restricciones reutilizan la normalización y las raíces del
grounding. La alineación con la campaña usa `similarity`. La corrección revalida con los mismos claims.

### Estilos frente a ADN (`guardianLexicon.ts`)

Siete familias de palabras: frío/tecnológico, lujo, grandilocuencia, infantil, rústico, innovación
y genérico. Que una familia **choque** depende del ADN, no de la palabra: "innovadora" choca con
TINTO (tradicional, artesanal) y no con INVENTIA; "disruptiva" choca con las dos, pero por motivos
distintos (TINTO comunica desde la cercanía; INVENTIA, con precisión y evidencia). Por eso el mismo
texto recibe diagnósticos distintos y sustentados en cada marca.

## 3. Contexto controlado y referencias

- Instantánea del recurso: textos con `RESOURCE_TEXT_n` (y su campo editable), dirección visual
  estructurada y piezas (plataforma, formato, pilar). Siempre cargada con los servicios existentes y
  el workspace autorizado.
- Referencias del ADN y de la campaña: `BRAND_TONE_1`, `BRAND_TRAIT_2`, `BRAND_DIFFERENTIATOR_1`,
  `BRAND_RESTRICTION_1`, `CAMPAIGN_CONCEPT_1`, `CAMPAIGN_MESSAGE_2`…, cada una con su ruta legible
  ("ADN → Comunicación → tono").
- La IA recibe solo ese índice y un perfil compacto del ADN (arquetipo, ejes, temperatura,
  formalidad), nunca documentos ni ids. Una referencia que no existe (`BRAND_RULE_999`) se descarta;
  un hallazgo relevante sin fundamento de marca, también.
- **Fundamento de cifras y promociones:** solo los textos del ADN y de la estrategia (sin números
  internos), más lo que aportó el usuario (su solicitud en el preflight y los "datos confirmados" de
  una revisión manual). **Las fechas no fundamentan cifras:** "2026-10-20" no autoriza "2026 clientes".

## 4. Hallazgos, severidad y bloqueo

`GuardianFinding`: evaluador, dimensión, `severity` (info · low · medium · high · critical),
`blocking`, código, título, mensaje (qué y por qué importa), evidencia (dónde), `brandEvidence` (qué
parte del ADN o de la campaña), recomendación, `canAutoFix`, `canOverride` y `overridden`.

**Severidad ≠ bloqueo.** Solo bloquea (de forma conservadora):

| Hallazgo | Severidad | Bloquea | Continuar de todas formas |
|---|---|---|---|
| Promoción inventada | crítica | sí | no: corregir o aportar el dato |
| Claim de superioridad o cifra sin fundamento | alta | sí | no |
| Contradice una restricción explícita del ADN | alta | sí | sí (decisión creativa, queda registrada) |
| Restricción visual, rechazo de la marca, tono agresivo, idea genérica, fuera de campaña… | media/alta | no | sí |

Los hallazgos de la IA **nunca** bloquean ni son críticos (juicio creativo, no hechos), y la IA no
puede borrar ni rebajar un hallazgo determinista. Un gusto de la marca ("luz natural") nunca genera
hallazgos: preferir algo no prohíbe lo demás.

Estados: **PASS** sin hallazgos relevantes (las notas leves no bastan para advertir), **WARNING**
con algo de severidad media o más, **BLOCK** con un hallazgo bloqueante no superado.

## 5. Score (heurística explicable)

`GuardianScoreAggregator` (backend; nunca se le pide a la IA):
- cada dimensión aplicable empieza en 100 y resta por hallazgo: info 0 · leve 5 · media 12 ·
  alta 25 · crítica 40 (mínimo 0);
- el score global es la media ponderada de las dimensiones **aplicables**: identidad, comunicación
  y estrategia pesan 3; afirmaciones, restricciones, campaña y dirección visual, 2; contenido, 1;
- mismos hallazgos → mismo score, sin importar la redacción de la IA;
- un override cambia el estado, no el score: el hecho sigue ahí.

**No es una medida científica de coherencia**: resume las reglas y los evaluadores aplicados. La UI
lo dice junto al número y siempre lo muestra con estado, dimensiones y hallazgos.

## 6. Preflight en PixelCommand

```
solicitud → propuesta → Guardian preflight → (corrección automática + 1 re-evaluación) → propuesta revisada → Organizar
```

- Solo Enterprise (`brandGuardian`) y solo en propuestas que crean recursos (`create_campaign`,
  `plan_content`, `create_content`). Nunca en consultas (`work_status`, `creative_advice`).
- Revisa los textos que Pixel va a usar (nombre y objetivo de la campaña, objetivo del plan, título
  de la pieza). Lo que escribió el usuario fundamenta lo que dijo: si pide una promoción, no es
  inventada. Lo que añada el intérprete y no esté en la solicitud ni en el ADN, sí.
- La propuesta muestra una línea compacta ("Guardian · Coherente con la marca", "2 ajustes
  recomendados", "Guardian encontró 1 cosa que resolver antes de organizar · 3 recomendaciones") y el
  detalle bajo demanda.
- **Frontera de confirmación:** PASS o WARNING → Organizar disponible. BLOCK → Organizar desactivado
  (la API responde 409 `guardian_preflight_blocked`) hasta ajustar la solicitud o, si todo lo que
  bloquea lo admite, "Continuar de todas formas" (`POST …/pixel/commands/:id/guardian-override`, que
  queda registrado en el informe).

## 7. Corrección: Pixel se corrige a sí mismo

`GuardianCorrectionService` (`guardian.correction.ts`):
- solo hallazgos con `canAutoFix` y sus pistas internas (quitar una promoción o cifra con su
  cláusula, quitar un claim de superioridad palabra a palabra, quitar un nombre propio, suavizar la
  urgencia, normalizar los gritos);
- **una pasada + una re-evaluación**, nunca un bucle: un informe que ya es una corrección no se
  vuelve a corregir (409 `guardian_single_correction_pass`);
- **no inventa:** si una corrección introduce una cifra, promoción o claim que no estaba, se descarta
  ("20 % de descuento" se quita, no se cambia por "10 %"); si el texto queda vacío, se completa solo
  con un rasgo real del ADN;
- en el preflight, la corrección se aplica a la propuesta antes de mostrarla y Pixel lo dice ("Antes
  de mostrarte la propuesta ajusté un texto: quité una promoción o cifra que la marca no ha dado").

Ejemplo (TINTO): «¡Compra YA el café #1 del Cauca con 20 % de descuento!» → «Descubre el café:
trazabilidad lote a lote.» → re-evaluación sin promoción, claim ni urgencia.

## 8. Revisión manual y aplicación

- `/workspace/:id/guardian` (Marca → Brand Guardian): Revisar campaña · plan · contenido (selector
  simple) · texto (se pega; opcionalmente con datos confirmados). Revisiones recientes.
- "Revisar con Guardian" en el detalle de campaña, en el plan de contenido y en cada pieza de
  Contenido (solo Enterprise).
- "Corregir con Pixel" genera una **propuesta** corregida (original frente a propuesta); no toca el
  recurso. "Aplicar corrección" la aplica con el **servicio del recurso** (contenido:
  `updateContentItem`; piezas del plan: `updateContentPlanItem`, que rechaza una pieza ya convertida).
  Una estrategia de campaña no se edita: es versionada, y se regenera con su mecanismo propio. Un
  texto pegado se copia a mano.
- El override de un hallazgo creativo (`POST …/reports/:id/override`) queda registrado
  (`overridden`, `overriddenAt`).

## 9. Persistencia y desactualización

`GuardianReport` (`guardian_reports`, `tenantScoped` por `workspaceId`; índices
`{workspaceId, createdAt:-1}` y `{workspaceId, resourceType, resourceId, createdAt:-1}`) guarda
estado, score, dimensiones, hallazgos, resumen, generación, la corrección propuesta, la instantánea
revisada (necesaria para corregir; un texto pegado nunca se convierte en ContentItem) y su hash.
Abrir un informe **no** vuelve a evaluar ni llama a la IA. Si el recurso cambió después (fecha de
actualización, nueva versión de la estrategia o recurso borrado), el informe se marca `stale` y la UI
ofrece "Revisar nuevamente"; nunca se regenera solo. Queda listo para alimentar CreativeMemory más
adelante, pero todavía no aprende de las decisiones.

## 10. API

Bajo `requireAuth` + `requireWorkspaceAccess`; Personal → 400 `feature_not_available`. Recurso o
informe de otro workspace (aunque sea del mismo dueño) o de otro usuario → **404**.

| Método | Ruta | |
|---|---|---|
| POST | `/api/workspaces/:id/guardian/evaluate` | 201 `{ report }` — `{ resourceType, resourceId? , content?, confirmedFacts?, mode? }` |
| GET | `…/guardian/reports[?resourceType&resourceId&status&limit]` | `{ reports, total }` (sin los del preflight salvo que se filtre) |
| GET | `…/guardian/reports/:reportId` | `{ report }` (con `stale`) |
| POST | `…/reports/:reportId/override` | `{ findingId }` → `{ report }` (409 `guardian_not_overridable` si es factual) |
| POST | `…/reports/:reportId/correct` | 201 `{ report }` corregido (una sola pasada) |
| POST | `…/reports/:reportId/apply` | `{ report }`; 409 `guardian_report_stale`, 400 `guardian_apply_not_supported` |
| POST | `/api/workspaces/:id/pixel/commands/:commandId/guardian-override` | `{ command }` |

Observabilidad (sin copiar textos ni el ADN): `guardian_evaluation_started`,
`guardian_evaluation_completed`, `guardian_evaluation_failed`, `guardian_preflight_blocked` y
`guardian_auto_fix_applied`.

## 11. Coste y rendimiento

Una sola llamada estructurada por evaluación, que agrupa las dimensiones semánticas sin perder la
separación por dimensión; más una para la corrección, si se pide. Las reglas deterministas no
gastan IA. Los evaluadores que no aplican no corren. El preflight hace como mucho dos evaluaciones y
una corrección por propuesta.

## 12. Limitaciones

- La evaluación semántica demo y de respaldo son reglas (léxico de estilos + señales del ADN), solo
  en español; con Claude real (`GUARDIAN_SYSTEM`) **sin probar** (no hay `ANTHROPIC_API_KEY`).
- La detección de nombres propios y de alineación es heurística (por palabras clave).
- La corrección demo quita y suaviza; no reescribe con estilo.
- Sin aprobaciones, equipo ni roles (Guardian ≠ Workflow) y sin Visual Guardian multimodal.

## 13. Futuro

- **Visual Guardian** (multimodal): logo, tipografía, paleta medida y composición sobre imágenes
  reales, como evaluadores nuevos del mismo motor.
- **Memory Guardian**: aprender de los overrides y las correcciones aceptadas (CreativeMemory).
- Personal Identity Guardian, cuando se pida.
