import {
  CONTENT_FORMAT_SUGGESTIONS,
  ENERGY_LEVELS,
  EXECUTION_STYLE_SUGGESTIONS,
  FOCUS_STYLE_SUGGESTIONS,
  FORMALITY_LEVELS,
  HELP_SUGGESTIONS,
  LANGUAGES,
  PERSONAL_STYLE_SUGGESTIONS,
  PERSONAL_TONE_SUGGESTIONS,
  PERSONAL_TRAIT_SUGGESTIONS,
  PLANNING_STYLE_SUGGESTIONS,
  PLATFORM_SUGGESTIONS,
  PRODUCTIVITY_SUGGESTIONS,
  WORK_TIME_SUGGESTIONS,
  type LanguageCode,
  type PersonalOnboardingStep,
} from '@pixel/contracts';
import { useId, type ReactNode } from 'react';
import { TextAreaField, TextField } from '../../components/Field';
import type { FieldErrors } from '../../lib/forms';
import { ColorListInput } from '../onboarding/ColorListInput';
import { ScaleInput } from '../onboarding/ScaleInput';
import { TagInput } from '../onboarding/TagInput';
import { STEP_ERROR, type PersonalStepForms } from './personalSteps';

/*
 * Campos de los 8 pasos del onboarding personal. Reutiliza los controles del Brand Brain
 * (TagInput, ScaleInput, ColorListInput, TextField): solo cambian las preguntas.
 */

interface StepProps<K extends PersonalOnboardingStep> {
  value: PersonalStepForms[K];
  onChange: (value: PersonalStepForms[K]) => void;
  errors: FieldErrors;
}

function useField<K extends PersonalOnboardingStep>({ value, onChange }: StepProps<K>) {
  return <F extends keyof PersonalStepForms[K]>(field: F) =>
    (next: PersonalStepForms[K][F]) =>
      onChange({ ...value, [field]: next });
}

const grid = 'grid gap-5 sm:grid-cols-2';

function StepError({ errors }: { errors: FieldErrors }) {
  const message = errors[STEP_ERROR];
  if (!message) return null;
  return (
    <p className="flex items-center gap-2 text-xs text-fg">
      <span className="size-1.5 shrink-0 bg-alert" aria-hidden="true" />
      {message}
    </p>
  );
}

/** Bloque con título dentro de un paso (Contenido / Trabajo). */
function Block({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-5 rounded-xl border border-line p-5 sm:p-6">
      <legend className="px-2 font-display text-base font-bold tracking-tight">{title}</legend>
      <p className="-mt-2 text-xs text-subtle">{description}</p>
      {children}
    </fieldset>
  );
}

function IdentityStep(props: StepProps<'identity'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <div className={grid}>
        <TextField
          label="Nombre"
          value={value.name}
          error={errors.name}
          autoComplete="name"
          onChange={(e) => set('name')(e.target.value)}
        />
        <TextField
          label="Profesión principal"
          placeholder="Director creativo, fotógrafa, streamer…"
          value={value.profession}
          error={errors.profession}
          onChange={(e) => set('profession')(e.target.value)}
        />
      </div>
      <TextField
        label="Tu frase (opcional)"
        hint="Cómo te presentarías en una línea."
        placeholder="Diseño identidades para marcas con historia"
        value={value.headline}
        error={errors.headline}
        onChange={(e) => set('headline')(e.target.value)}
      />
      <TextAreaField
        label="Descripción personal o profesional (opcional)"
        hint="Qué haces, cómo llegaste aquí y qué te mueve."
        value={value.bio}
        error={errors.bio}
        onChange={(e) => set('bio')(e.target.value)}
      />
      <TagInput
        label="Roles"
        values={value.roles}
        onChange={set('roles')}
        error={errors.roles}
        max={8}
        placeholder="Diseñador, docente, creador de contenido…"
      />
      <TagInput
        label="Habilidades"
        values={value.skills}
        onChange={set('skills')}
        error={errors.skills}
        max={15}
        placeholder="Dirección de arte, edición, estrategia…"
      />
      <TagInput
        label="Intereses"
        values={value.interests}
        onChange={set('interests')}
        error={errors.interests}
        max={15}
        placeholder="Cine, arquitectura, videojuegos…"
      />
      <div className="sm:w-1/2">
        <TextField
          label="Ubicación (opcional)"
          placeholder="Bogotá, Colombia"
          value={value.location}
          error={errors.location}
          onChange={(e) => set('location')(e.target.value)}
        />
      </div>
    </div>
  );
}

function GoalsStep(props: StepProps<'goals'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <StepError errors={errors} />
      <TagInput
        label="Objetivos profesionales"
        values={value.professional}
        onChange={set('professional')}
        error={errors.professional}
        max={8}
        placeholder="Conseguir clientes premium…"
      />
      <TagInput
        label="Objetivos personales"
        values={value.personal}
        onChange={set('personal')}
        error={errors.personal}
        max={8}
        placeholder="Opcional"
      />
      <TagInput
        label="Objetivos de contenido"
        values={value.content}
        onChange={set('content')}
        error={errors.content}
        max={8}
        placeholder="Crear autoridad, crecer la comunidad…"
      />
      <div className={grid}>
        <TagInput
          label="A corto plazo"
          values={value.shortTerm}
          onChange={set('shortTerm')}
          error={errors.shortTerm}
          max={8}
          placeholder="Este mes…"
        />
        <TagInput
          label="A largo plazo"
          values={value.longTerm}
          onChange={set('longTerm')}
          error={errors.longTerm}
          max={8}
          placeholder="En unos años…"
        />
      </div>
    </div>
  );
}

function AudienceStep(props: StepProps<'audience'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-5">
      <TextAreaField
        label="Público principal (opcional)"
        hint="Quiénes son: qué hacen, qué buscan, en qué momento te encuentran."
        value={value.primaryAudience}
        error={errors.primaryAudience}
        onChange={(e) => set('primaryAudience')(e.target.value)}
      />
      <TagInput
        label="Públicos secundarios"
        values={value.secondaryAudiences}
        onChange={set('secondaryAudiences')}
        error={errors.secondaryAudiences}
        max={8}
        placeholder="Opcional"
      />
      <div className={grid}>
        <TagInput
          label="Qué necesitan"
          values={value.needs}
          onChange={set('needs')}
          error={errors.needs}
          max={10}
          placeholder="Opcional"
        />
        <TagInput
          label="Qué problemas tienen"
          values={value.problems}
          onChange={set('problems')}
          error={errors.problems}
          max={10}
          placeholder="Opcional"
        />
      </div>
      <TagInput
        label="¿Qué quieres que piensen de ti?"
        values={value.desiredPerception}
        onChange={set('desiredPerception')}
        error={errors.desiredPerception}
        max={8}
        placeholder="Experta, cercana, precisa…"
      />
    </div>
  );
}

function PersonalityStep(props: StepProps<'personality'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <TagInput
      label="Tus rasgos"
      values={value.traits}
      onChange={set('traits')}
      suggestions={PERSONAL_TRAIT_SUGGESTIONS}
      error={errors.traits}
      hint={`${value.traits.length}/10 · El orden importa: los tres primeros te definen más.`}
      max={10}
      placeholder="Escribe tu propio rasgo…"
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
        suggestions={PERSONAL_TONE_SUGGESTIONS}
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
          className="w-full rounded-lg border border-line-strong bg-canvas px-3.5 py-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-focus"
        >
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code} className="bg-surface">
              {name}
            </option>
          ))}
        </select>
      </div>
      <TagInput
        label="Palabras frecuentes"
        values={value.preferredWords}
        onChange={set('preferredWords')}
        error={errors.preferredWords}
        max={20}
        placeholder="Las que usas a menudo…"
      />
      <TagInput
        label="Palabras a evitar"
        values={value.avoidWords}
        onChange={set('avoidWords')}
        error={errors.avoidWords}
        max={20}
        placeholder="Las que nunca dirías…"
      />
    </div>
  );
}

function CreativeStep(props: StepProps<'creative'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-6">
      <TagInput
        label="Estilos visuales"
        values={value.styles}
        onChange={set('styles')}
        suggestions={PERSONAL_STYLE_SUGGESTIONS}
        error={errors.styles}
        max={8}
      />
      <ColorListInput
        colors={value.colors}
        onChange={set('colors')}
        error={errors.colors}
        hint="Opcional. El primero será el color principal de tu personaje."
      />
      <TagInput
        label="Referencias"
        values={value.references}
        onChange={set('references')}
        error={errors.references}
        max={10}
        placeholder="Artistas, obras, marcas, lugares…"
      />
      <TagInput
        label="Preferencias visuales"
        values={value.visualPreferences}
        onChange={set('visualPreferences')}
        error={errors.visualPreferences}
        max={10}
        placeholder="Luz natural, mucho espacio negativo…"
      />
      <TagInput
        label="Estilos que debe evitar"
        values={value.avoidVisuals}
        onChange={set('avoidVisuals')}
        error={errors.avoidVisuals}
        max={10}
        hint="Pixel nunca te los propondrá, tampoco en tu personaje."
        placeholder="Opcional"
      />
    </div>
  );
}

function ContentWorkStep(props: StepProps<'contentWork'>) {
  const { value, onChange, errors } = props;
  const setContent =
    <F extends keyof PersonalStepForms['contentWork']['content']>(field: F) =>
    (next: PersonalStepForms['contentWork']['content'][F]) =>
      onChange({ ...value, content: { ...value.content, [field]: next } });
  const setWork =
    <F extends keyof PersonalStepForms['contentWork']['work']>(field: F) =>
    (next: PersonalStepForms['contentWork']['work'][F]) =>
      onChange({ ...value, work: { ...value.work, [field]: next } });
  const { content, work } = value;
  return (
    <div className="space-y-6">
      <Block title="Contenido" description="Sobre qué hablas, en qué formatos y dónde.">
        <TagInput
          label="Temas sobre los que hablas"
          values={content.themes}
          onChange={setContent('themes')}
          error={errors['content.themes']}
          max={12}
          placeholder="Proceso creativo, detrás de cámara…"
        />
        <TagInput
          label="Formatos favoritos"
          values={content.formats}
          onChange={setContent('formats')}
          suggestions={CONTENT_FORMAT_SUGGESTIONS}
          error={errors['content.formats']}
          max={10}
        />
        <TagInput
          label="Plataformas"
          values={content.platforms}
          onChange={setContent('platforms')}
          suggestions={PLATFORM_SUGGESTIONS}
          error={errors['content.platforms']}
          max={10}
        />
        <div className="sm:w-1/2">
          <TextField
            label="Frecuencia deseada (opcional)"
            placeholder="3 publicaciones por semana"
            value={content.frequency}
            error={errors['content.frequency']}
            onChange={(e) => setContent('frequency')(e.target.value)}
          />
        </div>
      </Block>
      <Block title="Trabajo" description="Cómo te organizas, ejecutas y te concentras.">
        <TagInput
          label="Horario preferido"
          values={work.preferredWorkTimes}
          onChange={setWork('preferredWorkTimes')}
          suggestions={WORK_TIME_SUGGESTIONS}
          error={errors['work.preferredWorkTimes']}
          max={6}
        />
        <TagInput
          label="Forma de planificar"
          values={work.planningStyle}
          onChange={setWork('planningStyle')}
          suggestions={PLANNING_STYLE_SUGGESTIONS}
          error={errors['work.planningStyle']}
          max={6}
        />
        <TagInput
          label="Forma de ejecutar"
          values={work.executionStyle}
          onChange={setWork('executionStyle')}
          suggestions={EXECUTION_STYLE_SUGGESTIONS}
          error={errors['work.executionStyle']}
          max={6}
        />
        <TagInput
          label="Forma de concentrarte"
          values={work.focusStyle}
          onChange={setWork('focusStyle')}
          suggestions={FOCUS_STYLE_SUGGESTIONS}
          error={errors['work.focusStyle']}
          max={6}
        />
        <TagInput
          label="Preferencias de productividad"
          values={work.productivityPreferences}
          onChange={setWork('productivityPreferences')}
          suggestions={PRODUCTIVITY_SUGGESTIONS}
          error={errors['work.productivityPreferences']}
          max={8}
        />
      </Block>
    </div>
  );
}

function SupportStep(props: StepProps<'support'>) {
  const { value, errors } = props;
  const set = useField(props);
  return (
    <div className="space-y-6">
      <TagInput
        label="¿En qué quieres que te ayude?"
        values={value.wantsHelpWith}
        onChange={set('wantsHelpWith')}
        suggestions={HELP_SUGGESTIONS}
        error={errors.wantsHelpWith}
        max={11}
        hint="Elige varias. También puedes escribir las tuyas."
        placeholder="Escribe otra…"
      />
      <TextAreaField
        label="¿Qué esperas de tu Pixel Personal? (opcional)"
        hint="Con tus palabras. Pixel lo tendrá presente en cada conversación."
        value={value.expectations}
        error={errors.expectations}
        onChange={(e) => set('expectations')(e.target.value)}
      />
    </div>
  );
}

export function PersonalStepForm<K extends PersonalOnboardingStep>({
  step,
  ...props
}: StepProps<K> & { step: K }) {
  // `step` y `props` corresponden al mismo paso (lo garantiza el tipo K del llamador).
  const p = <S extends PersonalOnboardingStep>() => props as unknown as StepProps<S>;
  switch (step) {
    case 'identity':
      return <IdentityStep {...p<'identity'>()} />;
    case 'goals':
      return <GoalsStep {...p<'goals'>()} />;
    case 'audience':
      return <AudienceStep {...p<'audience'>()} />;
    case 'personality':
      return <PersonalityStep {...p<'personality'>()} />;
    case 'communication':
      return <CommunicationStep {...p<'communication'>()} />;
    case 'creative':
      return <CreativeStep {...p<'creative'>()} />;
    case 'contentWork':
      return <ContentWorkStep {...p<'contentWork'>()} />;
    case 'support':
      return <SupportStep {...p<'support'>()} />;
  }
}
