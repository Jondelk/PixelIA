# CLAUDE.md — Pixel

Guía obligatoria para cualquier sesión de trabajo (humana o IA) en este repositorio.

## Qué es Pixel

Pixel es un **Director Creativo asistido por IA para empresas**. Cada empresa tiene **su propio Pixel**:
el sistema estudia el ADN de la marca y lo convierte en conocimiento estructurado, personalidad,
estilo de comunicación, criterio creativo, dirección visual, comportamiento y un **avatar 3D único**.

El avatar **nunca** es una mascota aleatoria: es una **consecuencia trazable del ADN de la marca**
(ej. café artesanal colombiano → grano de café antropomórfico cálido; startup tecnológica →
forma geométrica precisa; constructora → personaje sólido y estructural).

Documentación de referencia (leer antes de trabajar):

- `docs/MVP.md` — alcance, flujo completo y criterios de éxito del MVP 0.1.
- `docs/ARCHITECTURE.md` — arquitectura, capa de IA, API, seguridad, decisiones.
- `docs/ENTITIES.md` — entidades, campos, índices y reglas de aislamiento.
- `docs/BACKLOG.md` — backlog técnico por etapas y estado.

## Objetivo del MVP 0.1

Recorrido de punta a punta:

```
registro/login → crea empresa → onboarding de marca → Pixel analiza
→ genera BrandDNA → genera AvatarProfile → renderiza avatar 3D
→ usuario abre chat → Pixel responde usando el ADN de ESA empresa
```

### Fuera de alcance (NO construir hasta que se pida explícitamente)

- Generación automática avanzada de modelos 3D (el avatar es paramétrico/procedural).
- Generación de video, lip-sync avanzado, voz en tiempo real.
- Campañas automáticas completas.
- Facturación, planes SaaS, panel administrativo complejo, analytics avanzados.

## Stack (no añadir tecnologías fuera de esta lista sin justificarlo y pedir aprobación)

- **Frontend** (`apps/web`): React, Vite, TypeScript, Tailwind CSS, React Three Fiber, Drei.
- **Backend** (`apps/api`): Node.js, Express, TypeScript, MongoDB, Mongoose, Zod.
- **Compartido** (`packages/contracts`): tipos, schemas Zod y contratos de API.
- **Tooling**: npm workspaces, ESLint (flat config + typescript-eslint), Prettier, Vitest.

## Estructura

```
/apps
  /web          React + Vite + R3F
  /api          Express + Mongoose
/packages
  /contracts    Schemas Zod + tipos compartidos (sin dependencias de Mongoose ni React)
/docs           Documentación del producto y la arquitectura
```

## Principios arquitectónicos (no negociables)

1. **Aislamiento por `companyId`.** Todo dato de una empresa (BrandDNA, AvatarProfile,
   Conversation, Message, CreativeMemory) lleva `companyId` obligatorio e indexado.
   - Toda consulta a una colección de empresa filtra por `companyId`. Nunca buscar solo por `_id`:
     usar `{ _id, companyId }`.
   - Las rutas de empresa cuelgan de `/api/companies/:companyId/...` y pasan por el middleware
     `requireCompanyAccess`, que verifica que el usuario autenticado es dueño de la empresa.
   - Los servicios reciben `companyId` como parámetro explícito; nunca lo infieren de datos del cliente
     dentro del body.
   - Acceso a recursos de otra empresa → **404** (no 403), para no revelar su existencia.
   - El plugin Mongoose `tenantScoped` debe lanzar error si una consulta sobre un modelo de empresa
     no incluye `companyId`.
2. **Pixel nunca mezcla información entre empresas.** El contexto que se envía a la IA se construye
   exclusivamente con datos de la empresa activa (ContextBuilder con `companyId`). Hay tests que lo verifican.
3. **BrandDNA ≠ AvatarProfile.** Son entidades y schemas distintos.
   - `BrandDNA` = lo que la empresa **ES** (identidad, audiencia, personalidad, voz, criterio, dirección visual, comportamiento).
   - `AvatarProfile` = cómo esa identidad **se transforma visualmente** en Pixel.
   - El AvatarProfile se genera **a partir del BrandDNA** (no del onboarding crudo) e incluye una
     `rationale` que enlaza cada decisión visual con un rasgo del ADN.
4. **IA encapsulada.** Solo `apps/api/src/ai/` conoce proveedores/SDKs de IA. El resto del producto
   usa la interfaz `AIProvider` y los servicios de dominio (`BrandAnalysisService`,
   `AvatarDesignService`, `PixelChatService`). Cambiar de modelo/proveedor = nuevo adaptador + variable de entorno.
   Existe un `MockAIProvider` determinista para desarrollo y tests.
5. **Contratos primero.** Toda entrada/salida de la API y toda salida estructurada de la IA se valida
   con schemas Zod de `packages/contracts`. El frontend y el backend importan los mismos schemas.
6. **No sobrearquitectar.** Monolito modular. Sin microservicios, sin colas externas, sin
   GraphQL, sin state managers globales, sin librerías "por si acaso".

## Convenciones de código

- TypeScript `strict`. Prohibido `any` explícito (usar `unknown` + validación Zod).
- ESM en todo el monorepo (`"type": "module"`).
- Validar en los bordes: env vars, requests HTTP, respuestas de la IA, datos de formularios.
- Backend organizado por módulos de dominio en `apps/api/src/modules/` (`auth`, `companies`, `brand-dna`,
  `avatars`, `conversations`, `creative-memory`), cada uno con `*.model`, `*.service` y `*.routes`.
  Los módulos se registran solo en `modules/index.ts`.
- Frontend organizado por features (`src/features/<feature>/`); shell y router en `src/app/`.
  El renderer 3D (`src/features/avatar3d/`) solo recibe un `AvatarProfile`: nunca contiene reglas
  de negocio (esas viven en la API). Traducción visual en `profileToScene`, poses en `poseAt`.
  Rutas de empresa: `/company/:companyId/...`.
- Errores HTTP: lanzar `AppError` (o helpers de `lib/errors.ts`); el `errorHandler` central responde
  con la forma `ApiError` de contracts. Logs con `lib/logger.ts`, nunca `console.log`.
- Nombres de código en inglés; textos de producto/UI y documentación en español.
- Secretos solo en `apps/api/.env` (nunca en el frontend ni en el repo). Mantener los `.env.example` de cada app.
- Mensajes de commit claros, en imperativo.

## Identidad visual (PIXELES)

Pixel es un producto de **PIXELES — Tecnología creativa y entretenimiento** ("Creamos mundos").
Fuente de verdad: `brand-assets/PIXELES — Manual de marca (español).pdf` (no borrar `/brand-assets`).

- **Nombres.** *Pixel* = el producto (director creativo asistido por IA), no un chatbot.
  *Pixi* = el personaje de PIXELES (cubo amarillo 3D): mascota de la app en login, estados vacíos y
  cargas. **Nunca** llamar "Pixel" al personaje. El avatar de cada empresa es "el personaje de tu
  marca". La evolución de Pixi (6 niveles) es opcional: el cubo base basta y nunca se presenta como meta.
- **Tokens.** Un único archivo: `apps/web/src/styles/theme.css` (colores, fuentes, radios, sombra,
  easing). La paleta por defecto de Tailwind está desactivada: solo existen las utilidades de marca
  (`canvas`, `surface`, `elevated`, `line`, `line-strong`, `fg`, `muted`, `subtle`, `brand`,
  `on-brand`, `signal`, `alert`, `focus`, `overlay`). Prohibidos hex, `rgb()` y fuentes sueltas en
  componentes. Excepción: colores que son **datos de la empresa** (paleta del BrandDNA, renderer 3D,
  vista previa 2D del personaje, selector de colores del onboarding).
- **Paleta.** Negro Cine `#08080B` (fondo), Azul PIXELES `#1E14FF` (reconocimiento: botones
  principales, selección, bloques destacados), Blanco `#FFFFFF`, Grafito `#2B2D33`, Amarillo Origen
  `#F2E500` (solo el *píxel señal*: un acento pequeño por pantalla; nunca fondos grandes).
  - Azul sobre negro = 2,5:1 → el azul nunca es texto ni icono fino sobre fondo oscuro.
  - Sin colores de error fuera de la paleta: los avisos usan texto normal + `bg-alert` (amarillo en
    oscuro, azul en claro).
- **Tipografía.** Unbounded 700–800 (`font-display`, títulos) e Instrument Sans 400–600 (`font-sans`,
  interfaz y texto). Con `font-display` usar siempre `font-bold`.
- **Logo.** Solo los archivos de `apps/web/public/brand/` vía `<BrandLogo>`; nunca redibujarlo ni
  escribir "PIXELES" con una fuente. Mínimos: logotipo 160 px de ancho, isotipo 24 px.
  Pixi solo vía `<Pixi>` (`public/pixi/`), completo, sin recolorear y nunca sobre azul.
- **Tema.** La app **siempre arranca en oscuro** (`data-theme="dark"` en `index.html`), sin leer
  preferencias del sistema ni almacenamiento. El modo claro (botón del header) dura solo la sesión
  y tiene paridad: cada token tiene valor claro y logos/Pixi tienen versión sobre blanco.
- **Dirección de arte.** Minimalista, premium, mucho espacio negativo, la tipografía protagoniza.
  Sin brillos, neón, degradados, blur, partículas, elementos flotantes decorativos ni iconografía
  infantil o de "IA" (cerebros, circuitos, robots, hexágonos, destellos). "Que no se vea con tanta IA."
- **Movimiento.** Suave y sin rebotes (`ease-pxl`). Aparición al hacer scroll con `<Reveal>` (se
  revierte al subir). Todo respeta `prefers-reduced-motion`.

## Forma de trabajar

Antes de modificar código:

1. Inspeccionar el repositorio (estructura, docs, estado del backlog).
2. Explicar brevemente qué existe.
3. Identificar riesgos.
4. Proponer los archivos a crear/modificar.

Después implementar.

### Definición de terminado de cada etapa

Al terminar cada etapa:

- [ ] `npm run typecheck` sin errores.
- [ ] `npm run lint` sin errores.
- [ ] `npm run test` en verde.
- [ ] Errores corregidos (no silenciar reglas ni saltar tests).
- [ ] Verificar que `apps/api` y `apps/web` inician (`npm run dev`).
- [ ] Resumir exactamente qué quedó funcionando.
- [ ] Informar qué quedó pendiente y actualizar `docs/BACKLOG.md`.

**No continuar automáticamente con funcionalidades no pedidas.** Al cerrar una etapa, detenerse y reportar.

## Comandos

```bash
npm install            # instala todos los workspaces
npm run dev            # api + web en paralelo
npm run typecheck      # tsc en todos los workspaces
npm run lint           # eslint
npm run test           # vitest en todos los workspaces
npm run build          # contracts → api → web
npm run format         # prettier --write
```
