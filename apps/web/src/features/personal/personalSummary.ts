import type { PersonalDnaContent } from '@pixel/contracts';

/*
 * "Así te entiende Pixel" en palabras: un párrafo armado SOLO con lo que la persona contó.
 * Cada frase aparece únicamente si existe el dato que la sostiene (nunca se rellena).
 */

const lower = (value: string) => value.charAt(0).toLocaleLowerCase('es') + value.slice(1);
const joinEs = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

export function personalUnderstanding(dna: PersonalDnaContent): string[] {
  const sentences: string[] = [];
  // Solo la profesión: los roles pueden ser oficios o áreas y se muestran aparte.
  const [identity] = dna.identity.professionalIdentity;
  if (identity) sentences.push(`Eres ${lower(identity)}.`);

  const goal =
    dna.goals.professional[0] ??
    dna.goals.content[0] ??
    dna.goals.shortTerm[0] ??
    dna.goals.longTerm[0] ??
    dna.goals.personal[0];
  const audience = dna.audience.primaryAudience;
  if (goal || audience) {
    sentences.push(
      goal && audience
        ? `Quieres ${lower(goal)} y le hablas a ${lower(audience)}.`
        : goal
          ? `Quieres ${lower(goal)}.`
          : `Le hablas a ${lower(audience!)}.`,
    );
  }

  const { tone } = dna.communication;
  const styles = dna.creativeIdentity.styles;
  if (tone.length && styles.length) {
    sentences.push(
      `Tu tono es ${joinEs(tone.slice(0, 3))} y tu estética, ${joinEs(styles.slice(0, 3))}.`,
    );
  } else if (tone.length) {
    sentences.push(`Tu tono es ${joinEs(tone.slice(0, 3))}.`);
  } else if (styles.length) {
    sentences.push(`Tu estética es ${joinEs(styles.slice(0, 3))}.`);
  }

  const help = dna.supportNeeds.wantsHelpWith;
  if (help.length) sentences.push(`Te ayudaré sobre todo con ${joinEs(help.slice(0, 4))}.`);
  return sentences;
}
