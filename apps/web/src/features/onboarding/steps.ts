import type { BrandOnboardingDraft, Company, LanguageCode, OnboardingStep } from '@pixel/contracts';
import type { ColorDraft } from './ColorListInput';

export interface StepMeta {
  title: string;
  /** Pregunta con la voz de Pixel. */
  heading: string;
  description: string;
}

export const STEP_META: Record<OnboardingStep, StepMeta> = {
  company: {
    title: 'Empresa',
    heading: 'Cuéntame quién eres',
    description: 'Lo esencial de la empresa y de dónde viene.',
  },
  purpose: {
    title: 'Propósito',
    heading: '¿Por qué existes?',
    description: 'Tu misión, tu visión y los valores que no negocias.',
  },
  audience: {
    title: 'Público',
    heading: '¿Para quién trabajas?',
    description: 'Las personas a las que te diriges, lo que necesitan y lo que les duele.',
  },
  personality: {
    title: 'Personalidad',
    heading: 'Si tu marca fuera una persona…',
    description:
      'Elige o escribe entre 3 y 10 atributos, del más al menos importante. Los primeros pesan más.',
  },
  communication: {
    title: 'Comunicación',
    heading: '¿Cómo hablas?',
    description: 'Tu tono, tu registro y las palabras que te representan (y las que no).',
  },
  visual: {
    title: 'Identidad visual',
    heading: '¿Cómo te ves?',
    description: 'Colores, estilo, materiales y formas que reconocen a tu marca.',
  },
  competition: {
    title: 'Competencia',
    heading: '¿Qué te hace distinta?',
    description: 'Con quién compites y por qué te eligen a ti.',
  },
  creative: {
    title: 'Preferencias creativas',
    heading: '¿Qué te gusta y qué no?',
    description: 'Tu criterio creativo: lo que te emociona, lo que rechazas y tus límites.',
  },
};

/** Valores del formulario de cada paso (strings donde la API acepta null). */
export interface StepForms {
  company: { name: string; industry: string; description: string; history: string; origin: string };
  purpose: { mission: string; vision: string; purpose: string; values: string[] };
  audience: {
    targetAudience: string;
    needs: string[];
    problems: string[];
    characteristics: string[];
  };
  personality: { attributes: string[] };
  communication: {
    tone: string[];
    formality: number;
    energy: number;
    language: LanguageCode;
    wordsToUse: string[];
    wordsToAvoid: string[];
  };
  visual: {
    colors: ColorDraft[];
    styles: string[];
    materials: string[];
    shapes: string[];
    references: string[];
    recurringElements: string[];
    avoid: string[];
  };
  competition: { competitors: string[]; differentiators: string[] };
  creative: {
    likes: string[];
    dislikes: string[];
    visualReferences: string[];
    restrictions: string[];
  };
}

/** Estado inicial del formulario: respuestas guardadas o valores por defecto. */
export function initialForms(answers: BrandOnboardingDraft, company: Company): StepForms {
  return {
    company: answers.company
      ? { ...answers.company, origin: answers.company.origin ?? '' }
      : {
          name: company.name,
          industry: company.industry,
          description: company.description,
          history: '',
          origin: '',
        },
    purpose: answers.purpose ?? { mission: '', vision: '', purpose: '', values: [] },
    audience: answers.audience ?? {
      targetAudience: '',
      needs: [],
      problems: [],
      characteristics: [],
    },
    personality: answers.personality ?? { attributes: [] },
    communication: answers.communication ?? {
      tone: [],
      formality: 3,
      energy: 3,
      language: 'es',
      wordsToUse: [],
      wordsToAvoid: [],
    },
    visual: answers.visual
      ? {
          ...answers.visual,
          colors: answers.visual.colors.map((color) => ({
            hex: color.hex,
            name: color.name ?? '',
          })),
        }
      : {
          colors: [],
          styles: [],
          materials: [],
          shapes: [],
          references: [],
          recurringElements: [],
          avoid: [],
        },
    competition: answers.competition ?? { competitors: [], differentiators: [] },
    creative: answers.creative ?? {
      likes: [],
      dislikes: [],
      visualReferences: [],
      restrictions: [],
    },
  };
}
