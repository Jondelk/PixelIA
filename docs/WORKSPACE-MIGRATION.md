# Migración a Workspaces

Cómo pasa Pixel de `User → Company` a `User → Workspace → Company` sin perder datos ni romper el
flujo Enterprise. Arquitectura nueva: [`WORKSPACES.md`](./WORKSPACES.md).

## 1. Antes y después

**Antes** (hasta el commit `da6041a`): la empresa era la frontera de aislamiento.

```
User ─ownerId→ Company ─companyId→ BrandDNA · AvatarProfile · Conversation · Message
```

**Ahora**: el workspace es la frontera; la empresa vive dentro de un workspace enterprise.

```
User ─ownerId→ Workspace ─workspaceId→ Company (enterprise, 1:1) ─companyId→ BrandDNA
                         └─workspaceId→ AvatarProfile · Conversation · Message · CreativeMemory
```

## 2. Modelos afectados

| Modelo | Campos nuevos | Campos legacy (se conservan) | Aislamiento |
|---|---|---|---|
| `Workspace` (nuevo) | `ownerId`, `type`, `name`, `slug`, `status`, `migratedFromCompanyId?` | — | raíz (`ownerId`) |
| `Company` | `workspaceId` | `ownerId` (sigue autorizando `/api/companies/:id`) | raíz (`ownerId`) |
| `BrandDNA` | — | `companyId` | `companyId` (sin cambios) |
| `AvatarProfile` | `workspaceId`, `sourceType` (`brand`) | `companyId` (obligatorio si `brand`) | `workspaceId` |
| `Conversation` | `workspaceId`, `contextType` (`enterprise`) | `companyId` (opcional) | `workspaceId` |
| `Message` | `workspaceId` | `companyId` (opcional) | `workspaceId` |
| `CreativeMemory` (nuevo modelo, sin endpoints) | `workspaceId`, `memoryScope` | `companyId` (opcional) | `workspaceId` |

Campos **legacy**: `Company.ownerId` y `companyId` en `AvatarProfile`, `Conversation` y `Message`. Se
siguen escribiendo en Enterprise para que la versión anterior pueda leer los datos si hubiera que
volver atrás (§6). Se retirarán cuando todas las rutas usen workspace (ver `WORKSPACES.md`).

Índices nuevos (todos se crean solos al arrancar la API; los parciales ignoran documentos legacy):

- `workspaces`: `{ ownerId, createdAt }`, `{ ownerId, slug }` único, `{ ownerId, type }` único parcial
  (`type = personal`, nombre `one_personal_per_owner`), `{ migratedFromCompanyId }` único parcial.
- `companies`: `{ workspaceId }` único parcial (`$exists`).
- `avatar_profiles`: `{ workspaceId, version }` único parcial, `{ workspaceId, brandDnaVersion }`
  (y, desde Pixel Personal, `{ workspaceId, personalDnaVersion }` parcial y las versiones parciales
  por empresa `brand_company_version` / `brand_company_dna_version`).
- `conversations`: `{ workspaceId, userId, updatedAt }`. `messages`: `{ workspaceId, conversationId, createdAt }`.
- `creative_memories`: `{ workspaceId, active, createdAt }`.

Índices **legacy** que quedan en bases existentes hasta ejecutar `--sync-indexes`:
`conversations.companyId_1_userId_1_updatedAt_-1` y `messages.companyId_1_conversationId_1_createdAt_-1`
(ya no se usan). Los de `avatar_profiles` por `companyId` (`companyId_1_version_-1` único y
`companyId_1_brandDnaVersion_1`) ya **no** quedan: desde Pixel Personal se sustituyen por índices
parciales y `upgradeAvatarProfileIndexes()` los retira al arrancar la API y al ejecutar el script
(idempotente, sin tocar datos). Detalle en [`PERSONAL.md` §11](./PERSONAL.md#11-índices-de-avatarprofile).

## 3. Cómo funciona la migración

Una única función idempotente, `ensureCompanyWorkspace` (`apps/api/src/modules/workspaces/workspace.migration.ts`):

1. Busca el workspace con `migratedFromCompanyId = company._id`; si no existe, lo crea (enterprise,
   mismo dueño, mismo nombre, `createdAt` de la empresa para conservar el orden). El índice único
   impide que existan dos aunque dos procesos migren a la vez.
2. Asigna `workspaceId` a los `AvatarProfile` (+ `sourceType: brand`), `Conversation`
   (+ `contextType: enterprise`) y `Message` de la empresa que aún no lo tienen.
3. Por último enlaza `company.workspaceId`. Es la marca de "migrada": si el proceso se interrumpe
   antes, la siguiente ejecución repite 1–2 sin duplicar y termina.

Nunca borra ni sobrescribe datos: solo añade campos que faltan.

La usan dos caminos:

- **Migración perezosa (automática)**: al listar `GET /api/workspaces` o `GET /api/companies` y al
  entrar a `/api/companies/:companyId/...`, las empresas del usuario que aún no tienen workspace se
  migran en ese momento. Por eso la app sigue funcionando aunque no se ejecute el script.
- **Script** (recomendado tras desplegar): migra todo de una vez y verifica.

## 4. Ejecutar el script

Usa `MONGODB_URI` de `apps/api/.env` (o la variable de entorno).

```bash
# 0. Copia de seguridad (recomendado)
mongodump --uri "mongodb://127.0.0.1:27017/pixel" --out ./backup-antes-de-workspaces

# 1. Ver qué haría, sin escribir nada
npm run migrate:workspaces -- --dry-run

# 2. Migrar (crea los índices nuevos y migra; no elimina índices)
npm run migrate:workspaces

# 3. Opcional: eliminar los índices legacy que ya no se usan
npm run migrate:workspaces -- --sync-indexes
```

Se puede ejecutar cuantas veces se quiera: una segunda ejecución no crea nada y devuelve el mismo
resultado. Sale con código `1` si la verificación no queda limpia. Desde la raíz del monorepo, el
comando compila antes `packages/contracts` (la API lo importa ya compilado), así que funciona aunque
aún no se haya ejecutado `npm run build` tras actualizar el código.

Salida real con datos creados por la versión anterior (3 empresas, 2 con avatar y chat):

```
Empresas revisadas:           3
Empresas sin workspace:       3
Workspaces creados:           3
Empresas enlazadas:           3
AvatarProfile actualizados:  2
Conversation actualizados:   2
Message actualizados:        4

Verificación:
  Empresas sin workspace:            0
  AvatarProfile sin workspace:       0
  Conversation sin workspace:        0
  Message sin workspace:             0
  Workspaces de migración sin enlace: 0
  Empresas con workspace roto:        0
OK: todo migrado.
```

## 5. Cómo verificar

1. La salida del script termina en `OK: todo migrado.` (y la segunda ejecución no crea nada).
2. En la app: **Tus Pixels** muestra una tarjeta por empresa; al abrirla se llega a la misma empresa
   de siempre (`/company/:companyId`), con su ADN, su personaje y sus conversaciones.
3. Consultas manuales (mongosh):

```js
db.companies.countDocuments({ workspaceId: { $exists: false } })        // 0
db.avatar_profiles.countDocuments({ workspaceId: { $exists: false } })  // 0
db.conversations.countDocuments({ workspaceId: { $exists: false } })    // 0
db.messages.countDocuments({ workspaceId: { $exists: false } })         // 0
db.workspaces.countDocuments({ type: 'enterprise' })  // ≥ número de empresas
```

La verificación del script también comprueba que cada `company.workspaceId` apunta a un workspace
enterprise existente del mismo dueño ("Empresas con workspace roto").

Tests que lo cubren: `apps/api/test/migration.test.ts` (empresa sin workspace genera uno, una ya
migrada no duplica, dos ejecuciones dan el mismo resultado, dry-run no escribe, recuperación tras
interrupción, migración perezosa).

## 6. Rollback

La migración es aditiva, así que hay dos niveles:

**a) Volver a la versión anterior del código (sin tocar datos).** La versión anterior ignora los
campos nuevos y sigue encontrando todo por `companyId`, que se conserva. Lo creado con la versión nueva
en Enterprise también lleva `companyId`, así que se ve. No serán visibles para ella los Pixels
Personales ni los workspaces enterprise vacíos (no existían). Si antes se ejecutó `--sync-indexes`, la
versión anterior recrea sus índices al arrancar. Al volver a la versión nueva, ejecuta otra vez
`npm run migrate:workspaces`: recoge los recursos que la versión anterior haya escrito sin
`workspaceId`.

**b) Deshacer los datos de la migración** (solo si fuera imprescindible; mejor restaurar el backup
con `mongorestore --drop`). En mongosh:

```js
// Desenlaza las empresas que vinieron de la migración y borra esos workspaces
const migrated = db.workspaces.find({ migratedFromCompanyId: { $exists: true } }).toArray();
for (const ws of migrated) {
  db.companies.updateOne({ _id: ws.migratedFromCompanyId, workspaceId: ws._id }, { $unset: { workspaceId: '' } });
  db.avatar_profiles.updateMany({ workspaceId: ws._id }, { $unset: { workspaceId: '', sourceType: '' } });
  db.conversations.updateMany({ workspaceId: ws._id }, { $unset: { workspaceId: '', contextType: '' } });
  db.messages.updateMany({ workspaceId: ws._id }, { $unset: { workspaceId: '' } });
  db.workspaces.deleteOne({ _id: ws._id });
}
```

Esto no toca empresas creadas ya con la versión nueva (sus workspaces no tienen
`migratedFromCompanyId`) ni los Pixels Personales. Ojo: con la versión nueva en marcha, la migración
perezosa volverá a crear los workspaces en el siguiente acceso; combínalo con el paso a).
