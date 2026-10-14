# Contrato del asset del avatar (GLB) — Prompt 17

> **Actualización:** el loader ya existe para los modelos que genera **Pixel Sculpt**
> (`docs/AVATAR-3D.md`): rig por nodos con nombre (`PixelRoot`, `Face`, `Eye_L/R`, `Pupil_L/R`,
> `Mouth`, `Arm_L/R`, `Leg_L/R`; la boca con morph targets `open` y `round`), animado con las poses procedurales y con sincronía
> labial por visemas. Este contrato sigue vigente para personajes modelados a mano con clips.
>
> **Estado original:** contrato preparado, **sin loader**. Hoy todos los personajes son **paramétricos y
> procedurales** (`apps/web/src/features/avatar3d/`, generados desde el ADN). En el repositorio no hay
> ningún `.glb`, ningún rig ni ningún clip. Este documento fija lo que debe cumplir un personaje
> modelado a mano (p. ej. en Blender) para que el runtime lo pueda usar sin cambiar la interfaz.
>
> Generación automática de modelos 3D, lip-sync avanzado y clonación de voz siguen **fuera de
> alcance** (`CLAUDE.md`).

## 1. Principios

1. El GLB es **otra forma de dibujar** el mismo `AvatarProfile`: el ADN y la `rationale` siguen siendo
   la fuente de verdad. Un GLB nunca sustituye al concepto ni cambia la personalidad.
2. Si el GLB falta, no carga o le faltan clips, el runtime **cae al avatar procedural** (y, sin WebGL,
   a la vista 2D). Un asset roto nunca bloquea PixelCommand.
3. Los estados de presencia son fijos (`docs/PIXEL-PRESENCE.md` §2); el asset solo aporta clips con
   nombres conocidos.

## 2. Formato y archivo

| Requisito | Valor |
|---|---|
| Formato | glTF 2.0 binario (`.glb`), un solo archivo |
| Tamaño | objetivo ≤ 2 MB; máximo 5 MB (Draco o Meshopt permitidos) |
| Texturas | ≤ 2048 px por lado, potencias de 2; JPG/PNG o KTX2 |
| Polígonos | objetivo ≤ 30 k triángulos (es un personaje de interfaz, no de cine) |
| Escenas | una escena, un personaje; sin cámaras ni luces dentro del archivo (las pone el stage) |
| Nombre | `<avatarId>-v<version>.glb` (ligado a la versión del AvatarProfile) |

## 3. Escala, orientación y origen

- **Unidades:** metros (1 unidad = 1 m), escala aplicada (`Apply → All Transforms` en Blender).
- **Altura:** entre 1,8 y 2,6 unidades de pies (o base) a la cabeza, accesorios incluidos.
- **Origen:** en el suelo, centrado bajo el personaje (x = 0, y = 0, z = 0). Un personaje que flota
  deja el hueco bajo el origen; el stage dibuja el suelo y la sombra.
- **Orientación:** glTF es Y-arriba; el personaje **mira a +Z** (hacia la cámara). En Blender:
  mirando a −Y con el exportador glTF por defecto (+Y up).
- **Encuadre:** el stage encuadra con FOV 30° y deja margen para gestos. El personaje y sus gestos
  deben caber en una caja de ancho ≤ 1,6 × su altura; nada debe salir más de 0,5 unidades por encima
  de la cabeza.

## 4. Esqueleto (rig estándar)

Opcional para personajes rígidos (un objeto que gira o flota puede animarse sin huesos). Si hay rig:

- Un único `Armature` con raíz `Root` en el origen; jerarquía mínima:
  `Root → Hips → Spine → Chest → Neck → Head`, y si hay brazos `Shoulder.L/R → UpperArm.L/R →
  LowerArm.L/R → Hand.L/R`. Piernas, si existen: `UpperLeg.L/R → LowerLeg.L/R → Foot.L/R`.
- Sufijos `.L` / `.R` (convención de Blender). Pesos normalizados, máx. 4 influencias por vértice.
- Sin restricciones (constraints) ni drivers: solo lo que glTF exporta (huesos y morph targets).
- Los ojos pueden ser huesos `Eye.L/R` o morph targets (§6).

## 5. Clips de animación

Nombres **exactos** (sensibles a mayúsculas). El runtime elige, por estado, el **primer clip
disponible** de su lista (`CLIP_PREFERENCES` en `presenceMachine.ts`); si no hay ninguno, usa la pose
procedural.

| Estado de presencia | Preferencia de clips |
|---|---|
| `idle` | `Idle` |
| `listening` | `Listening` → `Idle` |
| `thinking` | `Thinking` → `Idle` |
| `speaking` | `Speaking` → `Explaining` → `Idle` |
| `reviewing` | `Reviewing` → `Thinking` → `Idle` |
| `success` | `Success` → `Celebrating` → `Agree` → `Idle` |
| `warning` | `Warning` → `Concerned` → `Idle` |
| `error` | `Concerned` → `Warning` → `Idle` |

- **Obligatorio:** `Idle`. **Recomendados:** `Listening`, `Thinking`, `Speaking`, `Reviewing`,
  `Success`, `Warning`. **Opcionales:** `Explaining`, `Concerned`, `Celebrating`, `Greeting`, `Agree`,
  `Disagree` (`Greeting`, `Agree` y `Disagree` aún no tienen estado propio; quedan reservados).
- **Bucle:** `Idle`, `Listening`, `Thinking`, `Speaking`, `Reviewing` y `Explaining` en bucle limpio
  (primer y último fotograma iguales), 2–6 s. `Success`, `Warning`, `Concerned`, `Celebrating`,
  `Greeting`, `Agree` y `Disagree` de una pasada, 1–2,5 s, que terminen en una pose compatible con
  `Idle` (el runtime vuelve a `Idle` con un fundido).
- **Movimiento:** suave, sin rebotes exagerados ni efectos (`CLAUDE.md`, arte y movimiento). La
  energía del personaje (`idleBehavior.energy`) modula la velocidad de reproducción en el runtime
  (`BehaviorProfile`); no hace falta una versión por energía.
- **Movimiento reducido:** el runtime congela en el primer fotograma de `Idle`; ese fotograma debe
  ser una pose de reposo digna.
- 30 fps; sin animación de la raíz fuera del sitio (el personaje no se desplaza).

## 6. Morph targets (opcional)

- **Expresión:** `Blink`, `Smile`, `Concern` (0–1).
- **Visemas (reservados para lip-sync futuro, no se usan hoy):** `viseme_sil`, `viseme_aa`,
  `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`, `viseme_PP`, `viseme_FF`, `viseme_TH`,
  `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR` (convención Oculus /
  Ready Player Me). Hoy `speaking` es una pose procedural, no sincronía labial.

## 7. Materiales

- PBR metal-rugosidad de glTF; sin shaders personalizados.
- Los colores deben salir del ADN (`primaryColor`, `secondaryColor`, `accentColor` del
  AvatarProfile). Nombra los materiales `Primary`, `Secondary`, `Accent` (y `Neutral` si hace falta):
  el runtime podrá reaplicar los colores del perfil si el ADN cambia.
- Acabado coherente con `renderHints.finish` (mate, satinado…). Sin emisivos fuertes, neón ni
  brillos (identidad PIXELES); emisivo solo para ojos o una luz pequeña si el concepto lo pide.

## 8. Validación antes de entregar

- [ ] Abre en <https://gltf-viewer.donmccurdy.com/> sin errores ni avisos de validación.
- [ ] Origen en el suelo, mira a +Z, escala aplicada, altura 1,8–2,6.
- [ ] `Idle` existe; los nombres de clips coinciden exactamente con §5.
- [ ] Tamaño ≤ 5 MB; texturas ≤ 2048 px.
- [ ] Materiales `Primary` / `Secondary` / `Accent` con los colores del ADN.
- [ ] Primer fotograma de `Idle` = reposo digno (movimiento reducido).

## 9. Qué falta en el código para usar un GLB

No implementado: dónde se guarda y sirve el archivo (un campo en `AvatarProfile` o un asset estático
por versión), el loader (`useGLTF` de Drei, ya en el stack), el mezclador de clips con `resolveClip` y
la reaplicación de colores. Se hará cuando exista el primer asset real.
