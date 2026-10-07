# Workspaces — el contenedor contextual de Pixel

> **Workspace is the main contextual boundary of Pixel.**
> **Never mix information between workspaces.**
> **Enterprise and Personal share Pixel Core but use different domain contexts.**

Pixel tiene dos modos que comparten el mismo núcleo:

- **Pixel Enterprise**: el director creativo de una marca. Trabaja con `Company`, `BrandDNA`,
  `AvatarProfile`, `Conversation` y `CreativeMemory`. Es el MVP que ya funciona.
- **Pixel Personal**: el director creativo de una persona. En próximas etapas trabajará con
  `PersonalProfile`, `PersonalDNA`, tareas, proyectos, planificador de contenido, memoria personal y
  "Daily Director". **Hoy solo existe como tipo de workspace**: se puede crear y aparece en
  "Tus Pixels", pero su chat responde de forma controlada que el contexto personal aún no está
  configurado.

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
   PersonalProfile   (próxima etapa)
       ↓
    PersonalDNA      (próxima etapa)
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
   └── PersonalContextBuilder   → "contexto personal aún no configurado" (placeholder tipado)
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
  se crean: llegan con la etapa de memoria).
- `PersonalContextBuilder` no inventa datos.

## API

Nuevos:

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/workspaces` | `{ type, name }`. Enterprise vacío o Personal (uno por usuario → 409 si ya existe) |
| GET | `/api/workspaces` | "Tus Pixels": `{ workspaces: [{ workspace, company }] }` |
| GET | `/api/workspaces/:workspaceId` | `{ workspace, company }` |
| PATCH | `/api/workspaces/:workspaceId` | `{ name?, status? }` (el tipo no se edita) |
| POST | `/api/workspaces/:workspaceId/company` | Completa un workspace enterprise vacío con su empresa. Personal u ocupado → 409 |
| GET | `/api/workspaces/:workspaceId/avatar` | Enterprise: avatar del workspace. Personal → 409 |
| POST | `/api/workspaces/:workspaceId/avatar/generate` | Enterprise. Personal → 409 |
| GET/POST | `/api/workspaces/:workspaceId/conversations` | Conversaciones del workspace |
| GET/POST | `/api/workspaces/:workspaceId/conversations/:id/messages` | Mensajes; en Personal, enviar → 409 |

Legacy conservados (el frontend Enterprise los usa): todo `/api/companies` y
`/api/companies/:companyId/{brand-dna,avatar,conversations,memories}`. `POST /api/companies` crea
ahora el workspace enterprise y la empresa juntos (con rollback lógico: MongoDB local no admite
transacciones).

## Frontend

- `/dashboard` = **Tus Pixels**: una tarjeta por workspace (Personal → "Próximamente"; Empresa →
  estado de su empresa, "Configurado" cuando está lista).
- `/pixels/new` = **¿Cómo quieres usar Pixel?** Personal crea el workspace y lleva a
  "Tu Pixel Personal está listo para configurarse."; Empresa continúa al flujo existente
  (`/companies/new`).
- `/workspace/:workspaceId[/chat|/pixel]` es la **entrada única** de cada Pixel. Un workspace
  enterprise sin empresa ofrece "Configurar la empresa" (`/companies/new?workspace=<id>`, que llama a
  `POST /api/workspaces/:workspaceId/company`).

### Convergencia de rutas

Las pantallas Enterprise siguen en `/company/:companyId/...` para no arriesgar el MVP:
`/workspace/:id` de un workspace enterprise con empresa **redirige** a `/company/:companyId`
conservando la subruta. Pasos siguientes, sin duplicar páginas:

1. Mover `CompanyLayout` y sus páginas bajo `/workspace/:workspaceId/...` (la empresa se obtiene del
   workspace; las páginas no cambian).
2. Invertir la redirección: `/company/:companyId/*` → `/workspace/:workspaceId/*`.
3. Pasar los clientes de la API del frontend a `/api/workspaces/:workspaceId/...` y, cuando nada use
   las rutas `/api/companies/:companyId/{avatar,conversations}`, retirarlas.
