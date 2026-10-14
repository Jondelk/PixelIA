import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/**
 * Un único MongoDB para toda la ejecución. Cada archivo de test usa su propia base de datos.
 * - MONGODB_URI_TEST: usa un MongoDB existente (CI o entornos sin acceso a descargas).
 * - Si no: mongodb-memory-server (descarga el binario la primera vez; MONGOMS_SYSTEM_BINARY
 *   permite usar uno ya instalado).
 */
export default async function setup(project: TestProject) {
  let server: MongoMemoryServer | undefined;
  let uri = process.env.MONGODB_URI_TEST;
  if (!uri) {
    server = await MongoMemoryServer.create();
    uri = server.getUri();
  }
  project.provide('mongoUri', uri);

  return async () => {
    await server?.stop();
  };
}
