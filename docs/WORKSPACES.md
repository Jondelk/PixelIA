# Workspaces — el contenedor contextual de Pixel

> **Workspace is the main contextual boundary of Pixel.**
> **Never mix information between workspaces.**
> **Enterprise and Personal share Pixel Core but use different domain contexts.**

Pixel tiene dos modos que comparten el mismo núcleo:

- **Pixel Enterprise**: el director creativo de una marca. Trabaja con `Company`, `BrandDNA`,
  `AvatarProfile`, `Conversation` y `CreativeMemory`. Es el MVP que ya funciona.
- **Pixel Personal**: el Director Creativo Personal de una persona. Trabaja con
  `PersonalProfile`, `PersonalDNA`, su avatar personal (`AvatarProfile`, `sourceType: personal`) y
  el mismo chat. Detalle completo en [`PERSONAL.md`](./PERSONAL.md). Tareas, proyectos, planificador
  de contenido y "Daily Director" llegarán en etapas siguientes.

## Modelo

```
User
 ↓
Workspace
 ├── Enterprise
 │     ↓
 │   Company
 │     ↓
 │   BrandDNA
 │
 └── Personal
       ↓
   PersonalProfile   (uno por workspace)
       ↓
    PersonalDNA      (versionado)
```

Recursos compartidos, que cuelgan del workspace:

```
Workspace
 ├── AvatarProfile
 ├── Conversation  (→ Message)
 ├── CreativeMemory
 ├── Projects (future)
 ├── Tasks (future)
 └── Content (future)
```

- Un usuario tiene **N workspaces** (`User 1 → N Workspace`). Ejemplo: `Jhon Trochez · Personal`,
  `TINTO · Enterprise`, `INVENTIA · Enterprise`.
- **Enterprise**: un workspace tiene **una** empresa (índice único en `Company.workspaceId`). Puede
  existir vacío ("sin configurar") hasta que se le asocie la empresa.
- **Personal**: **uno** por usuario (índice único parcial `{ ownerId, type }` con `type = personal`).
- `type` es inmutable. `status`: `active | archived` (archivar no borra nada).

Entidad (`workspaces`, contrato `WorkspaceSchema` en `packages/contracts/src/workspace.ts`):

| Campo | Tipo | Reglas |
|---|---|---|
| `ownerId` | ObjectId → User | Requerido. Hoy es el único con acceso (sin miembros ni roles todavía) |
| `type` | `enterprise \| personal` | Requerido, inmutable |
| `name` | string | 2–120. En Enterprise se sincroniza con el nombre de la empresa |
| `slug` | string | Único por dueño (`tinto`, `tinto-2`…) |
| `status` | `active \| archived` | Por defecto `active` |
| `migratedFromCompanyId` | ObjectId → Company | Solo lo escribe la migración. Índice único parcial. No sale en el DTO |

`status: archived` es solo una etiqueta en esta etapa ("Archivado" en Tus Pixels): no oculta ni
bloquea nada y no borra datos.

Índices: `{ ownerId, createdAt: -1 }` (listado), `{ ownerId, slug }` único, `{ ownerId, type }` único
parcial (`type = personal`), `{ migratedFromCompanyId }` único parcial. No hay índice solo por `type`:
con dos valores no discrimina.

## Aislamiento

1. **Raíz**: `Workspace` se consulta siempre con `{ _id, ownerId: <usuario de la sesión> }`.
2. **Rutas**: `/api/workspaces/:workspaceId/...` pasan por `requireWorkspaceAccess` (el
   WorkspaceResolver): valida el id, comprueba que existe y que `workspace.ownerId` es el usuario
   autenticado, y lo adjunta como `req.workspace`. Ajeno, inexistente o malformado → **404**.
3. **Rutas legacy Enterprise** `/api/companies/:companyId/...` pasan por `requireCompanyAccess`, que
   valida la empresa por `{ _id, ownerId }` y adjunta también **su** workspace (migrándolo si hace
   falta). Los módulos compartidos trabajan siempre con `req.workspace`.
4. **Enterprise dentro de un workspace**: la empresa se resuelve como
   `{ workspaceId: workspace._id, ownerId: workspace.ownerId }`; los servicios verifican además que
   `company.workspaceId` coincide con el workspace autorizado (`assertEnterpriseScope`).
5. **Modelos**: el plugin `tenantScoped` exige la clave de aislamiento en toda consulta:
   `workspaceId` para `AvatarProfile`, `Conversation`, `Message` y `CreativeMemory`; `companyId`
   para `BrandDNA` (dato propio de la empresa).
6. **Nunca** se confía en un `workspaceId` del cuerpo de una petición: el workspace sale siempre de
   la ruta autorizada (p. ej. `POST /api/workspaces/:workspaceId/company`). Un `workspaceId` enviado
   en el cuerpo de `POST /api/companies` se ignora (test en `enterpriseWorkspace.test.ts`). Los PATCH
   tampoco permiten cambiar `workspaceId`, `ownerId` ni `type` (400).

Una conversación del workspace A no se puede leer ni usar desde el workspace B aunque ambos sean del
mismo usuario y del mismo tipo (tests en `apps/api/test/enterpriseWorkspace.test.ts`).

## Contexto de Pixel por estrategia

```
Message
   ↓
workspace autorizado (WorkspaceResolver: requireWorkspaceAccess / requireCompanyAccess)
   ↓
resolveContextBuilder(workspace.type)
   ├── EnterpriseContextBuilder → Company → BrandDNA → AvatarProfile → CreativeMemory
   └── PersonalContextBuilder   → PersonalProfile → PersonalDNA → AvatarProfile → CreativeMemory
   ↓
AIProvider (recibe el contexto ya preparado: nunca ve companyId ni ids personales)
   ↓
Response
```

Código: `apps/api/src/modules/conversations/context/`.

- `ContextBuilder.build({ workspace, history, userMessage, historyLimit })` devuelve
  `{ status: 'ready', context, … }` o `{ status: 'not_configured', reason, message }`. El servicio de
  chat traduce `not_configured` a **409** con `details.reason` (`brand_dna_missing`,
  `enterprise_company_missing`, `personal_context_not_configured`).
- `EnterpriseContextBuilder` mantiene el comportamiento anterior: usa la composición pura
  `buildPixelContext` (mismo prompt) y añade las memorias activas del workspace si existen (hoy no
  se crean: llegan con la etapa de memoria) y, desde el Prompt 12, el **estado operativo** del
  workspace: solo conteos de Proyectos, Tareas y Contenido (`getOperationsStatus`), nunca nombres ni
  listas (`docs/ENTERPRISE-OPERATIONS.md` §7).
- `PersonalContextBuilder` carga solo datos del workspace personal (nunca `Company` ni `BrandDNA`) y
  compone el prompt del Director Creativo Personal (`buildPersonalPixelContext`). Sin PersonalDNA
  responde `personal_context_not_configured` (409) y la web lleva al onboarding. Ver
  [`PERSONAL.md` §7](./PERSONAL.md#7-personalcontextbuilder).

## API

Nuevos:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/workspaces` | `{ type, name }`. Enterprise vacío o Personal (uno por usuario → 409 si ya existe) |
| GET | `/api/workspaces` | "Tus Pixels": `{ workspaces: [{ workspace, company, personal }] }` |
| GET | `/api/workspaces/:workspaceId` | `{ workspace, company, personal }` (`personal` = resumen del Pixel Personal; null en enterprise) |
| PATCH | `/api/workspaces/:workspaceId` | `{ name?, status? }` (el tipo no se edita) |
| POST | `/api/workspaces/:workspaceId/company` | Completa un workspace enterprise vacío con su empresa. Personal → 400 (`workspace_type_mismatch`); ya ocupado → 409 |
| GET | `/api/workspaces/:workspaceId/avatar` | Avatar del workspace; el ADN de origen se resuelve por `workspace.type` |
| POST | `/api/workspaces/:workspaceId/avatar/generate` | Enterprise → BrandDNA; Personal → PersonalDNA. Sin ADN → 409 |
| GET/POST | `/api/workspaces/:workspaceId/conversations` | Conversaciones del workspace |
| GET/POST | `/api/workspaces/:workspaceId/conversations/:id/messages` | Mensajes; sin contexto (sin ADN) → 409 con `details.reason` |
| GET/PUT | `/api/workspaces/:workspaceId/personal-profile` | Solo Personal (enterprise → 400). Perfil y onboarding por pasos |
| GET/PUT | `/api/workspaces/:workspaceId/personal-dna` | Solo Personal. ADN personal y correcciones manuales |
| POST | `/api/workspaces/:workspaceId/personal-dna/generate` | Solo Personal. (Re)genera el ADN desde el onboarding |

Convención de errores por tipo: **400** `workspace_type_mismatch` cuando el endpoint no existe para
ese tipo de workspace; **409** cuando sí existe pero aún falta configurarlo (sin empresa, sin ADN).

Legacy conservados (el frontend Enterprise los usa): todo `/api/companies` y
`/api/companies/:companyId/{brand-dna,avatar,conversations,memories}`. `POST /api/companies` crea
ahora el workspace enterprise y la empresa juntos (con rollback lógico: MongoDB local no admite
transacciones).

## Frontend

- `/dashboard` = **Tus Pixels**: una tarjeta por workspace (Personal → "Configurado" si ya tiene
  PersonalDNA, si no "Configurar"; Empresa → estado de su empresa, "Configurado" cuando está lista).
- `/pixels/new` = **¿Cómo quieres usar Pixel?** Personal crea el workspace y lleva a
  "Configura tu Pixel Personal"; Empresa continúa al flujo existente (`/companies/new`).
- `/workspace/:workspaceId[/chat|/pixel|/personal/onboarding|/personal/dna]` es la **entrada única**
  de cada Pixel. Personal vive aquí, con su navegación propia (**Inicio · Mi ADN · Mi Pixel ·
  Chat**, resuelta por `workspace.type`). Un workspace enterprise sin empresa ofrece "Configurar la
  empresa" (`/companies/new?workspace=<id>`, que llama a `POST /api/workspaces/:workspaceId/company`).
- Pixel Core compartido en la web: `ChatStudio` (chat), `PixelStudio` (personaje), `WizardLayout`
  (onboardings) y `DnaBlocks` (presentación de un ADN). Los clientes de avatar y chat reciben la raíz
  de la API (`companyApiBase` o `workspaceApiBase`).

### Capacidades por tipo (feature gating)

Qué existe en cada tipo se **deriva** de `workspace.type` con `workspaceSupportsFeature(type,
feature)` / `workspaceCapabilities(type)` (`packages/contracts/src/capabilities.ts`); no se guarda en
Mongo. Operations (`projects`, `tasks`, `content`) en ambos; `contentPlanner` y `dailyDirector` solo
en Personal. La API responde **400** `feature_not_available` (`assertWorkspaceFeature`) y la web
filtra la navegación y protege las rutas con `<FeatureOnly>`. No se reparten comprobaciones
`workspace.type === …` para funcionalidades: se añade una fila a la tabla.

### Convergencia de rutas

**Regla desde el Prompt 12: toda funcionalidad nueva es workspace-first** (`/workspace/:workspaceId/...`
y `/api/workspaces/:workspaceId/...`), también en Enterprise.

Las pantallas Enterprise anteriores (resumen, ADN, personaje, chat, onboarding) siguen en
`/company/:companyId/...` para no arriesgar el MVP: `/workspace/:id` de un workspace enterprise con
empresa **redirige** a `/company/:companyId` conservando la subruta, **salvo** las rutas de
funcionalidades que Enterprise admite y que viven en el workspace (`enterpriseStaysInWorkspace`: hoy
Proyectos, Tareas y Contenido). Las rutas `personal/*` y `content-planner` llevan al resumen de la
empresa. La navegación Enterprise (`enterpriseNav`) mezcla ambas familias: Inicio y Marca bajo
`/company/:companyId`, Trabajo bajo `/workspace/:workspaceId` (ver `docs/ENTERPRISE-OPERATIONS.md`).

Pasos siguientes, sin duplicar páginas:

1. Mover `CompanyLayout` y sus páginas bajo `/workspace/:workspaceId/...` (la empresa se obtiene del
   workspace; las páginas no cambian), de una en una: cada pantalla movida deja de redirigir.
2. Invertir la redirección: `/company/:companyId/*` → `/workspace/:workspaceId/*`.
3. Pasar los clientes de la API del frontend a `/api/workspaces/:workspaceId/...` y, cuando nada use
   las rutas `/api/companies/:companyId/{avatar,conversations}`, retirarlas.
