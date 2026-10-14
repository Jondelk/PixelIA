import {
  BrandBrainResponseSchema,
  ExtractDocumentsResponseSchema,
  type BrandBrainResponse,
  type ExtractDocumentsResponse,
  type SaveOnboardingStepInput,
} from '@pixel/contracts';
import { apiRequest } from '../../lib/api';
import { imageBrandColors, isImageFile } from '../onboarding/imageColors';

const path = (companyId: string) => `/api/companies/${encodeURIComponent(companyId)}/brand-dna`;

export function getBrandBrain(
  companyId: string,
  signal?: AbortSignal,
): Promise<BrandBrainResponse> {
  return apiRequest(path(companyId), BrandBrainResponseSchema, { signal });
}

export function saveOnboardingStep(
  companyId: string,
  input: SaveOnboardingStepInput,
): Promise<BrandBrainResponse> {
  return apiRequest(path(companyId), BrandBrainResponseSchema, { method: 'PUT', body: input });
}

/** Contenido de un archivo en base64 (sin el prefijo data:). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error ?? new Error(`No se pudo leer ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Lee documentos de la marca y devuelve una propuesta para el onboarding (no guarda nada). */
export async function extractFromDocuments(
  companyId: string,
  files: File[],
): Promise<ExtractDocumentsResponse> {
  const [documents, imageColors] = await Promise.all([
    Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mediaType: file.type,
        data: await fileToBase64(file),
      })),
    ),
    // Colores de los logos e imágenes, medidos aquí mismo (sin IA).
    Promise.all(
      files
        .filter(isImageFile)
        .map(async (file) => ({ document: file.name, colors: await imageBrandColors(file) })),
    ),
  ]);
  return apiRequest(`${path(companyId)}/extract`, ExtractDocumentsResponseSchema, {
    method: 'POST',
    body: { documents, imageColors: imageColors.filter((item) => item.colors.length) },
  });
}
