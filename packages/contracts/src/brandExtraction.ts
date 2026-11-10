import { z } from 'zod';
import { LanguageCodeSchema, type OnboardingStep } from './brandOnboarding.js';

/*
 * Extracción del onboarding a partir de documentos de la marca (brochure, presentación, manual,
 * página web guardada en PDF, logo…).
 *
 * La IA devuelve lo que encontró con esta forma. Es deliberadamente permisiva (todo opcional,
 * listas sin mínimos) porque un documento casi nunca trae los 8 pasos completos: la web la fusiona
 * con lo que el usuario ya escribió y le muestra qué falta. Nada de esto se guarda solo: el
 * usuario revisa y guarda cada paso con el flujo normal del onboarding.
 */

const text = z.string().nullable();
const list = z.array(z.string());

export const OnboardingExtractionSchema = z.object({
  company: z.object({
    name: text,
    industry: text,
    description: text,
    history: text,
    origin: text,
  }),
  purpose: z.object({
    mission: text,
    vision: text,
    purpose: text,
    values: list,
  }),
  audience: z.object({
    targetAudience: text,
    needs: list,
    problems: list,
    characteristics: list,
  }),
  personality: z.object({
    attributes: list,
  }),
  communication: z.object({
    tone: list,
    /** 1 muy informal – 5 muy formal; null si el documento no permite deducirlo. */
    formality: z.number().nullable(),
    /** 1 muy serena – 5 muy enérgica. */
    energy: z.number().nullable(),
    language: LanguageCodeSchema.nullable(),
    wordsToUse: list,
    wordsToAvoid: list,
  }),
  visual: z.object({
    colors: z.array(z.object({ hex: z.string(), name: z.string().nullable() })),
    styles: list,
    materials: list,
    shapes: list,
    references: list,
    recurringElements: list,
    avoid: list,
  }),
  competition: z.object({
    competitors: list,
    differentiators: list,
  }),
  creative: z.object({
    likes: list,
    dislikes: list,
    visualReferences: list,
    restrictions: list,
  }),
  /** De dónde salió cada dato, para que el usuario pueda verificarlo. */
  evidence: z.array(
    z.object({
      /** Ruta del campo, p. ej. "purpose.mission". */
      field: z.string(),
      /** Nombre del documento. */
      source: z.string(),
      /** Cita corta del documento (o descripción, si es una imagen). */
      quote: z.string(),
    }),
  ),
  /** Observaciones para el usuario (p. ej. "el documento no menciona competidores"). */
  notes: z.string().nullable(),
});
export type OnboardingExtraction = z.infer<typeof OnboardingExtractionSchema>;

/** Extracción vacía (punto de partida y respuesta cuando un documento no aporta nada). */
export function emptyExtraction(): OnboardingExtraction {
  return {
    company: { name: null, industry: null, description: null, history: null, origin: null },
    purpose: { mission: null, vision: null, purpose: null, values: [] },
    audience: { targetAudience: null, needs: [], problems: [], characteristics: [] },
    personality: { attributes: [] },
    communication: {
      tone: [],
      formality: null,
      energy: null,
      language: null,
      wordsToUse: [],
      wordsToAvoid: [],
    },
    visual: {
      colors: [],
      styles: [],
      materials: [],
      shapes: [],
      references: [],
      recurringElements: [],
      avoid: [],
    },
    competition: { competitors: [], differentiators: [] },
    creative: { likes: [], dislikes: [], visualReferences: [], restrictions: [] },
    evidence: [],
    notes: null,
  };
}

// ---------- Petición y respuesta ----------

export const EXTRACTION_LIMITS = {
  maxFiles: 5,
  /** Suma de los archivos, en bytes (antes de codificar en base64). */
  maxTotalBytes: 15 * 1024 * 1024,
  /** Extensiones que se aceptan en el selector de archivos. */
  accept: '.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp',
} as const;

export const ExtractionDocumentInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** Tipo MIME que informa el navegador (puede venir vacío: se usa la extensión). */
  mediaType: z.string().max(200),
  /** Contenido en base64 (sin el prefijo data:). */
  data: z.string().min(1),
});

/** Colores dominantes de una imagen, medidos en el navegador (sin IA). */
export const ImageColorsInputSchema = z.object({
  /** Nombre del documento (el mismo de `documents`). */
  document: z.string().trim().min(1).max(200),
  colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i, 'Color hexadecimal inválido')).max(8),
});

/** Cuerpo de POST /api/companies/:companyId/brand-dna/extract. */
export const ExtractDocumentsInputSchema = z.object({
  documents: z
    .array(ExtractionDocumentInputSchema)
    .min(1, 'Sube al menos un documento')
    .max(EXTRACTION_LIMITS.maxFiles, `Máximo ${EXTRACTION_LIMITS.maxFiles} documentos`),
  imageColors: z.array(ImageColorsInputSchema).max(EXTRACTION_LIMITS.maxFiles).default([]),
});
export type ExtractDocumentsInput = z.infer<typeof ExtractDocumentsInputSchema>;

export const ExtractionDocumentKindSchema = z.enum(['pdf', 'image', 'text']);

export const ExtractDocumentsResponseSchema = z.object({
  extraction: OnboardingExtractionSchema,
  documents: z.array(
    z.object({
      name: z.string(),
      kind: ExtractionDocumentKindSchema.nullable(),
      status: z.enum(['read', 'skipped']),
      /** Por qué se omitió (formato no soportado, sin texto, requiere IA…). */
      reason: z.string().nullable(),
    }),
  ),
  /**
   * 'ai' = lo leyó un modelo; 'demo' = lectura local sin IA (secciones con título, texto de PDF y
   * colores de PDF e imágenes).
   */
  mode: z.enum(['ai', 'demo']),
});
export type ExtractDocumentsResponse = z.infer<typeof ExtractDocumentsResponseSchema>;

/** Campos del onboarding que puede llenar la extracción, por paso (para mostrar y fusionar). */
export const EXTRACTION_FIELD_LABELS: { [K in OnboardingStep]: Record<string, string> } = {
  company: {
    name: 'Nombre',
    industry: 'Sector',
    description: 'Descripción',
    history: 'Historia',
    origin: 'Origen',
  },
  purpose: { mission: 'Misión', vision: 'Visión', purpose: 'Propósito', values: 'Valores' },
  audience: {
    targetAudience: 'Público objetivo',
    needs: 'Necesidades',
    problems: 'Problemas',
    characteristics: 'Características',
  },
  personality: { attributes: 'Personalidad' },
  communication: {
    tone: 'Tono',
    formality: 'Formalidad',
    energy: 'Energía',
    language: 'Idioma',
    wordsToUse: 'Palabras que usa',
    wordsToAvoid: 'Palabras a evitar',
  },
  visual: {
    colors: 'Colores',
    styles: 'Estilo visual',
    materials: 'Materiales',
    shapes: 'Formas',
    references: 'Referencias',
    recurringElements: 'Elementos recurrentes',
    avoid: 'Elementos a evitar',
  },
  competition: { competitors: 'Competidores', differentiators: 'Diferenciadores' },
  creative: {
    likes: 'Lo que le gusta',
    dislikes: 'Lo que no le gusta',
    visualReferences: 'Referencias visuales',
    restrictions: 'Restricciones',
  },
};
