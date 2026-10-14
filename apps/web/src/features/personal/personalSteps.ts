import type {
  LanguageCode,
  PersonalOnboardingDraft,
  PersonalOnboardingStep,
} from '@pixel/contracts';
import type { z } from 'zod';
import { ApiRequestError } from '../../lib/api';
import type { FieldErrors } from '../../lib/forms';
import type { ColorDraft } from '../onboarding/ColorListInput';
import type { StepMeta } from '../onboarding/steps';

export const PERSONAL_STEP_META: Record<PersonalOnboardingStep, StepMeta> = {
  identity: {
    title: 'Quién eres',
    heading: '¿Quién eres y a qué te dedicas?',
    description:
      'Tu profesión, tus roles y lo que sabes hacer. Es la base de todo lo que Pixel te propondrá.',
  },
  goals: {
    title: 'Objetivos',
    heading: '¿Qué quieres conseguir?',
    description:
      'Escribe al menos un objetivo. Pixel alineará cada idea con ellos; lo que dejes vacío, no lo supondrá.',
  },
  audience: {
    title: 'Audiencia',
    heading: '¿A quién quieres llegar?',
    description:
      'Las personas a las que te diriges, lo que necesitan y cómo quieres que te perciban.',
  },
  personality: {
    title: 'Personalidad',
    heading: 'Si tuvieras que describirte…',
    description:
      'Elige o escribe tus rasgos, del más al menos importante. También puedes escribir los tuyos.',
  },
  communication: {
    title: 'Comunicación',
    heading: '¿Cómo hablas?',
    description: 'Tu tono, tu registro y las palabras que te representan (y las que no).',
  },
  creative: {
    title: 'Identidad creativa',
    heading: '¿Cómo se ve lo que haces?',
    description: 'Tus estilos, tus colores, tus referencias y lo que nunca usarías.',
  },
  contentWork: {
    title: 'Contenido y trabajo',
    heading: '¿Qué creas y cómo trabajas?',
    description: 'Dos bloques: el contenido que haces y tu forma de trabajar.',
  },
  support: {
    title: 'Tu Pixel',
    heading: '¿Qué quieres que Pixel haga por ti?',
    description: 'Elige en qué te ayuda tu Pixel Personal y cuéntale qué esperas de él.',
  },
};

/** Valores del formulario de cada paso (strings donde la API acepta null). */
export interface PersonalStepForms {
  identity: {
    name: string;
    profession: string;
    headline: string;
    bio: string;
    roles: string[];
    skills: string[];
    interests: string[];
    location: string;
  };
  goals: {
    professional: string[];
    personal: string[];
    content: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  audience: {
    primaryAudience: string;
    secondaryAudiences: string[];
    needs: string[];
    problems: string[];
    desiredPerception: string[];
  };
  personality: { traits: string[] };
  communication: {
    tone: string[];
    formality: number;
    energy: number;
    language: LanguageCode;
    preferredWords: string[];
    avoidWords: string[];
  };
  creative: {
    styles: string[];
    colors: ColorDraft[];
    references: string[];
    visualPreferences: string[];
    avoidVisuals: string[];
  };
  contentWork: {
    content: { themes: string[]; formats: string[]; platforms: string[]; frequency: string };
    work: {
      preferredWorkTimes: string[];
      planningStyle: string[];
      executionStyle: string[];
      focusStyle: string[];
      productivityPreferences: string[];
    };
  };
  support: { wantsHelpWith: string[]; expectations: string };
}

const text = (value: string | null | undefined) => value ?? '';

/** Estado inicial: respuestas guardadas o valores vacíos (el nombre parte del del Pixel). */
export function initialPersonalForms(
  answers: PersonalOnboardingDraft,
  defaults: { name: string },
): PersonalStepForms {
  const { identity, audience, creative, contentWork, support } = answers;
  return {
    identity: identity
      ? {
          ...identity,
          headline: text(identity.headline),
          bio: text(identity.bio),
          location: text(identity.location),
        }
      : {
          name: defaults.name,
          profession: '',
          headline: '',
          bio: '',
          roles: [],
          skills: [],
          interests: [],
          location: '',
        },
    goals: answers.goals ?? {
      professional: [],
      personal: [],
      content: [],
      shortTerm: [],
      longTerm: [],
    },
    audience: audience
      ? { ...audience, primaryAudience: text(audience.primaryAudience) }
      : {
          primaryAudience: '',
          secondaryAudiences: [],
          needs: [],
          problems: [],
          desiredPerception: [],
        },
    personality: answers.personality ?? { traits: [] },
    communication: answers.communication ?? {
      tone: [],
      formality: 3,
      energy: 3,
      language: 'es',
      preferredWords: [],
      avoidWords: [],
    },
    creative: creative
      ? {
          ...creative,
          colors: creative.colors.map((color) => ({ hex: color.hex, name: text(color.name) })),
        }
      : { styles: [], colors: [], references: [], visualPreferences: [], avoidVisuals: [] },
    contentWork: contentWork
      ? {
          content: { ...contentWork.content, frequency: text(contentWork.content.frequency) },
          work: contentWork.work,
        }
      : {
          content: { themes: [], formats: [], platforms: [], frequency: '' },
          work: {
            preferredWorkTimes: [],
            planningStyle: [],
            executionStyle: [],
            focusStyle: [],
            productivityPreferences: [],
          },
        },
    support: support
      ? { ...support, expectations: text(support.expectations) }
      : { wantsHelpWith: [], expectations: '' },
  };
}

/** Clave de los errores de todo el paso (p. ej. "Añade al menos un objetivo"). */
export const STEP_ERROR = '_step';

/**
 * Clave del campo de un error: la ruta hasta el primer índice de lista. Los pasos personales tienen
 * bloques anidados ("content.themes"), y un elemento concreto ("roles.0", "colors.1.name") se marca
 * en su campo ("roles", "colors").
 */
export function fieldKey(path: readonly (string | number)[]): string {
  const segments: string[] = [];
  for (const segment of path) {
    if (typeof segment === 'number' || /^\d+$/.test(segment)) break;
    segments.push(segment);
  }
  return segments.join('.') || STEP_ERROR;
}

export function personalZodErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = fieldKey(
      issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
    );
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Errores de la API ("data.content.themes.2" → "content.themes"). */
export function personalApiErrors(err: unknown): FieldErrors {
  const errors: FieldErrors = {};
  if (!(err instanceof ApiRequestError)) return errors;
  for (const issue of err.fieldIssues) {
    const key = fieldKey(
      issue.path
        .replace(/^data\.?/, '')
        .split('.')
        .filter(Boolean),
    );
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
