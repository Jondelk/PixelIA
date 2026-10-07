import { notConfigured, type ContextBuilder } from './contextBuilder.js';

export const PERSONAL_CONTEXT_NOT_CONFIGURED =
  'El contexto personal de Pixel aún no está configurado. Llegará con el Pixel Personal.';

/**
 * Personal: Workspace → PersonalProfile → PersonalDNA (próxima etapa).
 * Placeholder tipado: responde de forma explícita que el contexto personal aún no existe
 * ("Personal context not configured yet") y nunca inventa datos.
 */
export const personalContextBuilder: ContextBuilder = {
  type: 'personal',

  build() {
    return Promise.resolve(
      notConfigured('personal_context_not_configured', PERSONAL_CONTEXT_NOT_CONFIGURED),
    );
  },
};
