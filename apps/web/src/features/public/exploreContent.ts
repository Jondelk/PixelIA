import type { ExperienceKind } from '../../brand/experience';

/**
 * Textos públicos de Explorar. Solo describen lo que Pixel ya hace (ver docs/PIXEL_ESTADO.md):
 * nada de cifras, testimonios ni herramientas que aún no existen.
 */
export interface ExploreMode {
  kind: ExperienceKind;
  name: string;
  path: string;
  tagline: string;
  description: string;
  companion: string;
  capabilities: string[];
  start: { anonymous: string; authenticated: string };
}

export const EXPLORE_MODES: Record<ExperienceKind, ExploreMode> = {
  personal: {
    kind: 'personal',
    name: 'Pixel Personal',
    path: '/explore/personal',
    tagline: 'Tus ideas, proyectos y objetivos en un solo lugar.',
    description:
      'Pixel aprende cómo piensas, creas y trabajas, y te acompaña con ese criterio en cada proyecto.',
    companion: 'Tu compañero creativo',
    capabilities: [
      'Un onboarding de 8 pasos con el que Pixel aprende cómo eres y lo convierte en tu ADN personal.',
      'Un personaje propio que nace de ese ADN.',
      'Conversaciones con Pixel que parten de quién eres.',
      'Tus proyectos, tareas y contenido en un mismo lugar.',
      'Planes de contenido que Pixel te propone y tú decides si aceptar.',
      'Tu día: las prioridades que Pixel te sugiere en cada jornada.',
    ],
    start: { anonymous: 'Empezar con Pixel Personal', authenticated: 'Ir a mi Pixel Personal' },
  },
  enterprise: {
    kind: 'enterprise',
    name: 'Pixel Enterprise',
    path: '/explore/enterprise',
    tagline: 'Conecta tu equipo, conocimiento y operación.',
    description:
      'Pixel estudia el ADN de tu marca y lo convierte en criterio, voz y un personaje que la representa.',
    companion: 'Tu aliado empresarial',
    capabilities: [
      'Un onboarding de marca de 8 pasos del que sale su ADN: identidad, audiencia, voz y dirección visual.',
      'El personaje de tu marca, con cada decisión visual explicada desde su ADN.',
      'Conversaciones con Pixel desde el criterio de tu marca.',
      'Los proyectos, tareas y contenido de la marca en un mismo lugar.',
    ],
    start: { anonymous: 'Empezar con Pixel Enterprise', authenticated: 'Ir a Pixel Enterprise' },
  },
};
