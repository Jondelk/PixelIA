import {
  ENERGY_LEVELS,
  FORMALITY_LEVELS,
  LANGUAGES,
  MATERIAL_SUGGESTIONS,
  PERSONALITY_SUGGESTIONS,
  SHAPE_SUGGESTIONS,
  TONE_SUGGESTIONS,
  VISUAL_STYLE_SUGGESTIONS,
  type LanguageCode,
  type OnboardingStep,
} from '@pixel/contracts';
import { useId } from 'react';
import { TextAreaField, TextField } from '../../components/Field';
import type { FieldErrors } from '../../lib/forms';
import { ColorListInput } from './ColorListInput';
import { ScaleInput } from './ScaleInput';
import type { StepForms } from './steps';
import { TagInput } from './TagInput';

interface StepProps<K extends OnboardingStep> {
  value: StepForms[K];
  onChange: (value: StepForms[K]) => void;
  errors: FieldErrors;
}

function useField<K extends OnboardingStep>({ value, onChange }: StepProps<K>) {
  return <F extends keyof StepForms[K]>(field: F) =>
    (next: StepForms[K][F]) =>
      onChange({ ...value, [field]: next });
}

const grid = 'grid gap-5 sm:grid-cols-2';

function CompanyStep(props: StepProps<'company'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <div className={grid}>
        <TextField
          label="Nombre"
          value={value.name}
          error={errors.name}
          onChange={(e) => set('name')(e.target.value)}
        />
        <TextField
          label="Sector"
          value={value.industry}
          error={errors.industry}
          onChange={(e) => set('industry')(e.target.value)}
        />
      </div>
      <TextAreaField
        label="Descripción"
        hint="Qué hace la empresa y qué ofrece."
        value={value.description}
        error={errors.description}
        onChange={(e) => set('description')(e.target.value)}
      />
      <TextAreaField
        label="Historia"
        hint="Cómo empezó, qué la marcó, por qué existe."
        value={value.history}
        error={errors.history}
        onChange={(e) => set('history')(e.target.value)}
      />
      <TextField
        label="Ubicación u origen (opcional)"
        placeholder="Huila, Colombia"
        value={value.origin}
        error={errors.origin}
        onChange={(e) => set('origin')(e.target.value)}
      />
    </div>
  );
}

function PurposeStep(props: StepProps<'purpose'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <TextAreaField
        label="Misión"
        hint="Qué hace la empresa cada día y para quién."
        value={value.mission}
        error={errors.mission}
        onChange={(e) => set('mission')(e.target.value)}
      />
      <TextAreaField
        label="Visión"
        hint="A dónde quiere llegar."
        value={value.vision}
        error={errors.vision}
        onChange={(e) => set('vision')(e.target.value)}
      />
      <TextAreaField
        label="Propósito"
        hint="El porqué profundo, más allá del negocio."
        value={value.purpose}
        error={errors.purpose}
        onChange={(e) => set('purpose')(e.target.value)}
      />
      <TagInput
        label="Valores"
        values={value.values}
        onChange={set('values')}
        error={errors.values}
        max={8}
        placeholder="Honestidad, oficio…"
      />
    </div>
  );
}

function AudienceStep(props: StepProps<'audience'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <TextAreaField
        label="Público objetivo"
        hint="Quiénes son: edad, contexto, estilo de vida."
        value={value.targetAudience}
        error={errors.targetAudience}
        onChange={(e) => set('targetAudience')(e.target.value)}
      />
      <TagInput
        label="Necesidades"
        values={value.needs}
        onChange={set('needs')}
        error={errors.needs}
        placeholder="Qué buscan…"
      />
      <TagInput
        label="Problemas"
        values={value.problems}
        onChange={set('problems')}
        error={errors.problems}
        placeholder="Qué les frustra…"
      />
      <TagInput
        label="Características"
        values={value.characteristics}
        onChange={set('characteristics')}
        error={errors.characteristics}
        placeholder="Cómo son…"
      />
    </div>
  );
}

function PersonalityStep(props: StepProps<'personality'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <TagInput
      label="Atributos de personalidad"
      values={value.attributes}
      onChange={set('attributes')}
      suggestions={PERSONALITY_SUGGESTIONS}
      error={errors.attributes}
      hint={`${value.attributes.length}/10 · El orden importa: los tres primeros definen más a tu marca.`}
      max={10}
      placeholder="Escribe tu propio atributo…"
    />
  );
}

function CommunicationStep(props: StepProps<'communication'>) {
  const { value, errors } = props;
  const set = useField(props);
  const languageId = useId();
  return (
    <div className="space-y-6">
      <TagInput
        label="Tono"
        values={value.tone}
        onChange={set('tone')}
        suggestions={TONE_SUGGESTIONS}
        error={errors.tone}
        max={6}
        placeholder="Escribe otro tono…"
      />
      <div className={grid}>
        <ScaleInput
          label="Formalidad"
          value={value.formality}
          onChange={set('formality')}
          levels={FORMALITY_LEVELS}
          error={errors.formality}
        />
        <ScaleInput
          label="Energía"
          value={value.energy}
          onChange={set('energy')}
          levels={ENERGY_LEVELS}
          error={errors.energy}
        />
      </div>
      <div className="sm:w-1/2">
        <label htmlFor={languageId} className="mb-1.5 block text-[13px] font-medium text-muted">
          Idioma principal
        </label>
        <select
          id={languageId}
          value={value.language}
          onChange={(e) => set('language')(e.target.value as LanguageCode)}
          className="w-full rounded-lg border border-line-strong bg-canvas/60 px-3.5 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code} className="bg-surface">
              {name}
            </option>
          ))}
        </select>
      </div>
      <TagInput
        label="Palabras que utiliza"
        values={value.wordsToUse}
        onChange={set('wordsToUse')}
        error={errors.wordsToUse}
        max={20}
        placeholder="origen, oficio…"
      />
      <TagInput
        label="Palabras o estilos que debe evitar"
        values={value.wordsToAvoid}
        onChange={set('wordsToAvoid')}
        error={errors.wordsToAvoid}
        max={20}
        placeholder="barato, MAYÚSCULAS…"
      />
    </div>
  );
}

function VisualStep(props: StepProps<'visual'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-6">
      <ColorListInput colors={value.colors} onChange={set('colors')} error={errors.colors} />
      <TagInput
        label="Estilo visual"
        values={value.styles}
        onChange={set('styles')}
        suggestions={VISUAL_STYLE_SUGGESTIONS}
        error={errors.styles}
        max={8}
      />
      <TagInput
        label="Materiales"
        values={value.materials}
        onChange={set('materials')}
        suggestions={MATERIAL_SUGGESTIONS}
        error={errors.materials}
        max={10}
      />
      <TagInput
        label="Formas"
        values={value.shapes}
        onChange={set('shapes')}
        suggestions={SHAPE_SUGGESTIONS}
        error={errors.shapes}
        max={6}
      />
      <TagInput
        label="Referencias"
        values={value.references}
        onChange={set('references')}
        error={errors.references}
        max={10}
        placeholder="Marcas, artistas, lugares…"
      />
      <TagInput
        label="Elementos recurrentes"
        values={value.recurringElements}
        onChange={set('recurringElements')}
        error={errors.recurringElements}
        max={10}
        placeholder="Íconos, motivos, símbolos…"
      />
      <TagInput
        label="Elementos que debe evitar"
        values={value.avoid}
        onChange={set('avoid')}
        error={errors.avoid}
        max={10}
      />
    </div>
  );
}

function CompetitionStep(props: StepProps<'competition'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <TagInput
        label="Principales competidores"
        values={value.competitors}
        onChange={set('competitors')}
        error={errors.competitors}
        max={10}
        placeholder="Opcional"
      />
      <TagInput
        label="¿Qué diferencia a la empresa?"
        values={value.differentiators}
        onChange={set('differentiators')}
        error={errors.differentiators}
        max={8}
        hint="Una frase por diferenciador. Pulsa Enter para añadirla."
        placeholder="Trazabilidad lote a lote…"
      />
    </div>
  );
}

function CreativeStep(props: StepProps<'creative'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <TagInput
        label="Qué le gusta"
        values={value.likes}
        onChange={set('likes')}
        error={errors.likes}
        placeholder="Luz natural, texturas reales…"
      />
      <TagInput
        label="Qué no le gusta"
        values={value.dislikes}
        onChange={set('dislikes')}
        error={errors.dislikes}
        placeholder="Opcional"
      />
      <TagInput
        label="Referencias visuales"
        values={value.visualReferences}
        onChange={set('visualReferences')}
        error={errors.visualReferences}
        max={10}
        placeholder="Opcional"
      />
      <TagInput
        label="Restricciones"
        values={value.restrictions}
        onChange={set('restrictions')}
        error={errors.restrictions}
        hint="Lo que Pixel nunca debe proponer."
        placeholder="Opcional"
      />
    </div>
  );
}

export function StepForm<K extends OnboardingStep>({ step, ...props }: StepProps<K> & { step: K }) {
  // `step` y `props` corresponden al mismo paso (lo garantiza el tipo K del llamador).
  const p = <S extends OnboardingStep>() => props as unknown as StepProps<S>;
  switch (step) {
    case 'company':
      return <CompanyStep {...p<'company'>()} />;
    case 'purpose':
      return <PurposeStep {...p<'purpose'>()} />;
    case 'audience':
      return <AudienceStep {...p<'audience'>()} />;
    case 'personality':
      return <PersonalityStep {...p<'personality'>()} />;
    case 'communication':
      return <CommunicationStep {...p<'communication'>()} />;
    case 'visual':
      return <VisualStep {...p<'visual'>()} />;
    case 'competition':
      return <CompetitionStep {...p<'competition'>()} />;
    case 'creative':
      return <CreativeStep {...p<'creative'>()} />;
  }
}
