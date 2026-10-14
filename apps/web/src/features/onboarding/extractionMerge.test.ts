import { emptyExtraction, type Company } from '@pixel/contracts';
import { describe, expect, it } from 'vitest';
import { mergeExtraction, missingByStep, totalFilled } from './extractionMerge';
import { initialForms } from './steps';

const company = {
  id: '507f1f77bcf86cd799439011',
  name: 'Café Tinto',
  industry: 'Café',
  description: 'Tostamos café',
} as unknown as Company;

const blank = () => initialForms({}, company);

describe('mergeExtraction', () => {
  it('llena lo vacío y nunca reemplaza lo que el usuario escribió', () => {
    const forms = blank();
    forms.purpose.mission = 'Mi misión escrita a mano';
    const x = emptyExtraction();
    x.company.name = 'Otro nombre';
    x.company.history = 'Nació en 2015 en el Huila.';
    x.purpose.mission = 'Misión del documento';
    x.purpose.vision = 'Ser la marca más querida.';

    const { forms: next, filled } = mergeExtraction(forms, x, []);
    expect(next.company.name).toBe('Café Tinto');
    expect(next.company.history).toBe('Nació en 2015 en el Huila.');
    expect(next.purpose.mission).toBe('Mi misión escrita a mano');
    expect(next.purpose.vision).toBe('Ser la marca más querida.');
    expect(filled.company).toEqual(['history']);
    expect(filled.purpose).toEqual(['vision']);
    // No muta el formulario original.
    expect(forms.purpose.vision).toBe('');
  });

  it('agrega a las listas sin repetir y respeta el máximo', () => {
    const forms = blank();
    forms.purpose.values = ['Origen', 'Oficio', 'a', 'b', 'c', 'd', 'e'];
    const x = emptyExtraction();
    x.purpose.values = ['origen', 'Comercio justo', 'Calidad'];
    const { forms: next, filled } = mergeExtraction(forms, x, []);
    expect(next.purpose.values).toEqual([
      'Origen',
      'Oficio',
      'a',
      'b',
      'c',
      'd',
      'e',
      'Comercio justo',
    ]);
    expect(filled.purpose).toEqual(['values']);
  });

  it('colores nuevos por hexadecimal; niveles e idioma solo si el paso no se guardó', () => {
    const forms = blank();
    forms.visual.colors = [{ hex: '#6B3E26', name: 'Tostado' }];
    const x = emptyExtraction();
    x.visual.colors = [
      { hex: '#6b3e26', name: 'Repetido' },
      { hex: '#E8C07D', name: null },
    ];
    x.communication.formality = 2;
    x.communication.language = 'en';

    const first = mergeExtraction(forms, x, []);
    expect(first.forms.visual.colors).toEqual([
      { hex: '#6B3E26', name: 'Tostado' },
      { hex: '#E8C07D', name: '' },
    ]);
    expect(first.forms.communication.formality).toBe(2);
    expect(first.filled.communication).toEqual(['formality', 'language']);

    const saved = mergeExtraction(forms, x, ['communication']);
    expect(saved.forms.communication.formality).toBe(3);
    expect(saved.filled.communication).toEqual([]);
  });

  it('una extracción vacía no cambia nada', () => {
    const forms = blank();
    const { forms: next, filled } = mergeExtraction(forms, emptyExtraction(), []);
    expect(next).toEqual(forms);
    expect(totalFilled(filled)).toBe(0);
  });
});

describe('missingByStep', () => {
  it('dice qué falta en cada paso con su etiqueta', () => {
    const missing = missingByStep(blank());
    expect(missing.purpose.map((m) => m.label)).toEqual([
      'Misión',
      'Visión',
      'Propósito',
      'Valores',
    ]);
    expect(missing.company.map((m) => m.field)).toEqual(['history']);
    expect(missing.communication.map((m) => m.field)).toEqual(['tone']);
  });

  it('después de fusionar falta menos', () => {
    const x = emptyExtraction();
    x.purpose = {
      mission: 'Llevar el mejor café a cada taza.',
      vision: 'Ser la marca más querida.',
      purpose: 'Honrar a las familias cafeteras.',
      values: ['Origen'],
    };
    const { forms } = mergeExtraction(blank(), x, []);
    expect(missingByStep(forms).purpose).toEqual([]);
  });
});
