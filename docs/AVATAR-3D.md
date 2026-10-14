# Producción 3D del personaje (Pixel Sculpt)

El concepto del personaje (AvatarProfile) lo decide el Avatar Concept Engine a partir del ADN de
la marca. **Pixel Sculpt** lo **produce**: un modelo 3D con acabado de estudio, un `.glb` animable y
renders para el manual de marca. Es un motor propio (`packages/sculpt`), escrito en TypeScript y sin
dependencias: no hace falta instalar Blender ni ningún otro programa, no usa GPU y no consume
tokens de IA. Funciona igual para las marcas existentes y para cada marca nueva.

## Probarlo

```
npm install
npm run avatar:demo              # café, startup y constructora
npm run avatar:demo -- cafe      # solo una (cafe | nova | constructora)
```

Los archivos quedan en `apps/api/storage/demo/<marca>/`: abre `hero.png` y arrastra `avatar.glb` a
cualquier visor glTF (por ejemplo, el Visor 3D de Windows, Blender o gltf-viewer.donmccurdy.com).

En la app (`npm run dev`), cada concepto nuevo se esculpe solo en segundo plano; el panel
«Modelo 3D profesional» de la página del personaje muestra el estado, los renders y las descargas.

## Cómo funciona

```
Generar concepto (POST /avatar/generate)
  └─ encola la construcción (si AVATAR_AUTO_BUILD=true)
       └─ AvatarProfile → CharacterSpec          apps/api/…/model/characterSpec.ts (puro, probado)
            └─ hilo aparte (worker_threads)      apps/api/…/model/sculptRunner.ts
                 └─ Pixel Sculpt                 packages/sculpt
                      ├─ bodies.ts      cuerpo de cada sujeto como campo de distancia (SDF)
                      ├─ character.ts   rostro, extremidades, utilería y rig
                      ├─ mesh.ts        malla (Surface Nets disperso + proyección exacta)
                      ├─ index.ts       pintura por vértice y oclusión ambiental horneada
                      ├─ glb.ts         glTF 2.0 binario con materiales PBR
                      └─ render.ts      renders de estudio por software (PNG)
```

**Modelado con campos de distancia.** Cada pieza es una función que dice a qué distancia está un
punto de su superficie. Las piezas se funden con uniones suaves, como arcilla: los brazos salen del
cuerpo sin costuras, la ranura del grano de café se esculpe sobre la coronilla, las orejas y el
hocico de una mascota nacen de la cabeza. Los rasgos del rostro (ojos con esclerótica, iris y
brillos; boca con lengua o dientes; cejas) son relieves que siguen la curvatura exacta del cuerpo,
como la pintura de una figura de vinilo.

**Malla.** El campo se convierte en triángulos con Surface Nets sobre una rejilla dispersa (solo se
evalúan los bloques por donde pasa la superficie) y cada vértice se proyecta sobre la superficie
real: siluetas limpias y normales suaves. Las mallas salen cerradas y orientadas; las caras ocultas
de las piezas apoyadas sobre el cuerpo se descartan para aligerar el archivo.

**Color y volumen.** El degradado de aerógrafo hacia la base, el rubor de las mejillas, las vetas
de la hoja o la suela de los zapatos se pintan por vértice. La oclusión ambiental (pliegues,
axilas, contacto con el suelo) se calcula con el propio campo de distancia y se hornea en el modelo.

**Materiales.** Acabados `matte`, `satin`, `glossy`, `metallic`, `clay` y `glass` del concepto,
con laca (clearcoat), terciopelo (sheen), emisión (ojos de visor, anillo orbital) y transmisión
(burbujas) mediante extensiones estándar de glTF que leen three.js, Blender y los motores de juego.

**Renders de estudio.** Rasterizador por software con supermuestreo, sombreado físico (GGX con
Fresnel, laca y terciopelo), reflejos de un estudio con softboxes, luz principal con sombras suaves
(PCF), relleno frío y contraluz del color de acento, suelo infinito del color de fondo con sombra y
oclusión de contacto. Vistas: `hero`, `front`, `three_quarter`, `side` y `cutout` (fondo
transparente, para el manual y otras piezas).

**Rig.** El `.glb` trae nodos con nombre y pivotes en su sitio: `PixelRoot`, `Body`, `Face`,
`Eye_L/R`, `Pupil_L/R`, `Mouth`, `Mouth_Open` (interior de la boca: cerrado en reposo, se abre
desde el labio superior al hablar), `Arm_L/R` (hombros), `Leg_L/R` (caderas). La web lo anima con las
mismas poses del avatar paramétrico (`apps/web/src/features/avatar3d/glbRig.ts`): parpadeo, mirada,
boca al hablar, brazos y balanceo. "L" es la izquierda del personaje (+X); mira hacia +Z.

**Dos resoluciones.** Los renders usan la malla fina; el `.glb` que carga la web usa una malla
más ligera (≈2 MB, ≈125 mil triángulos), con más detalle en los rasgos del rostro. Materiales
`Primary`, `Secondary` y `Accent` (`docs/AVATAR-ASSET-CONTRACT.md`).

**Para todos los Pixels.** Se esculpe el personaje de las marcas (Enterprise) y el de las
personas (Personal): la API toma la versión vigente del avatar de cada tipo de workspace.

## Sincronía labial (la boca sigue la voz)

`apps/web/src/features/avatar3d/lipsync.ts`, `speechSignal.ts` y `livePose.ts`:

1. **Del texto a visemas.** Lo que Pixel va a decir se convierte en visemas del español (a, e, i,
   o, u, m/b/p con labios cerrados, f, s, t/d/l, k/g/j, ch/ll/ñ, r, n), con dígrafos, h muda,
   c/g suaves, tónica más larga (tilde o penúltima sílaba) y pausas en comas y puntos.
2. **Coarticulación.** Cada sonido se funde con el siguiente; las consonantes entre vocales no
   cierran del todo; la mandíbula acompaña un poco la apertura.
3. **Anclado a la voz real.** La voz del navegador avisa al empezar cada palabra (`onboundary`):
   el reloj se reancla ahí, adopta la velocidad de esa voz y no se adelanta a ella. Mientras el
   audio no empieza, la boca está cerrada; al terminar, vuelve a reposo.
4. **Sin voz.** En el chat, la respuesta aparece palabra por palabra al ritmo de la boca; las
   respuestas largas no hacen esperar (pasados 9 s el resto aparece enseguida).
5. **Los dos avatares.** El paramétrico y el esculpido usan la misma pose: apertura, anchura
   (sonrisa) y redondez (o, u). Con movimiento reducido no hay animación de la boca.

## Qué se modela

| Sujeto del catálogo | Silueta |
|---|---|
| `coffee_bean` | Grano ovalado con la ranura en S por la coronilla y la espalda |
| `cacao_pod` | Mazorca con costillas y puntas |
| `sprout`, `organic_seed` | Semilla (el brote lleva hojas) |
| `bread_loaf` | Pan con base plana, corteza dorada y cortes |
| `paw_creature`, `soft_blob` | Criatura suave; la mascota con orejas y hocico |
| `leaf`, `water_drop`, `paint_drop`, `fluid_drop` | Gota con la punta curvada (la hoja, aplanada y con nervios) |
| `health_capsule` | Cápsula bicolor con junta |
| `thread_spool` | Carrete con hilo enrollado y discos |
| `book` | Libro de pie: tapas, lomo redondeado y páginas a la vista |
| `building_block` | Bloque con tetones y línea de panel |
| `shield` | Escudo abombado con borde del color de acento |
| `monolith` | Columna pulida |
| `crystal_core`, `prism` | Gema facetada con una faceta al frente |

Si el sujeto no está en el catálogo se usa el arquetipo (`seed`, `drop`, `blob`, `capsule`,
`block`, `crystal`). Rostro: ojos `round`, `oval`, `dot`, `crescent`, `line` o `visor`; boca
`soft_smile`, `smile`, `open_smile`, `grin`, `line` o sin boca. Utilería (se deduce del texto de los
accesorios del concepto): hojas, taza, casco, gafas, anillo orbital, antena, orejas, pañoleta,
insignia o cruz, burbujas y plano enrollado.

## API

- **Una construcción por workspace y versión del avatar** (colección `avatar_builds`, aislada por
  `workspaceId` como el AvatarProfile; solo en Pixels de empresa). Cola en proceso, una a la vez,
  en un hilo aparte para no bloquear la API. Los archivos se escriben en una carpeta temporal y
  solo reemplazan a los anteriores si todo salió bien; una construcción interrumpida por un
  reinicio se marca como fallida.
- **Archivos** en `STORAGE_DIR/avatars/<workspaceId>/v<versión>/`: `avatar.glb`, `hero.png`,
  `front.png`, `three_quarter.png`, `side.png`, `cutout.png` y `spec.json` (la especificación
  usada, para repetir una construcción exactamente).
- **Endpoints**, bajo `/api/workspaces/:workspaceId/avatar` (canónica) y la ruta legacy
  `/api/companies/:companyId/avatar`:
  - `GET …/model`: motor, estado y URLs.
  - `POST …/model[?force=true]`: esculpir o volver a esculpir (202).
  - `GET …/model/files/:archivo[?download=1]`: solo nombres conocidos.

## Ajustes (`apps/api/.env`)

| Variable | Por defecto | Uso |
|---|---|---|
| `AVATAR_3D` | `on` | `off` desactiva la producción 3D (la web usa el avatar paramétrico) |
| `AVATAR_QUALITY` | `standard` | `draft` (rápido), `standard` o `high` (más detalle y peso) |
| `AVATAR_RENDER_SIZE` | `1024` | Lado de los renders en píxeles |
| `AVATAR_TIMEOUT_MS` | `300000` | Tiempo máximo por construcción |
| `AVATAR_AUTO_BUILD` | `true` | Esculpir al generar cada concepto |
| `STORAGE_DIR` | `storage` | Carpeta de archivos generados (ignorada por git) |

Referencia (calidad `standard`, renders de 1024 px, un núcleo): 20–30 s por personaje,
250–450 mil triángulos, `.glb` de 6–12 MB.

## Pruebas

- `npm run test -w @pixel/sculpt`: mallas cerradas y con volumen correcto, PNG decodificable, GLB
  bien alineado, todos los sujetos y la utilería del catálogo, determinismo.
- `npm run test -w @pixel/api`: especificación, runner (en línea y en hilo aparte) y endpoints con
  un escultor simulado (incluye aislamiento entre empresas).
