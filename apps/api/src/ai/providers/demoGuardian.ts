import type { GeneratedGuardianCorrection, GeneratedGuardianEvaluation } from '@pixel/contracts';
import type { GuardianCorrectionPayload, GuardianPayload } from '../guardianPayload.js';
import {
  brandSignals,
  familyClash,
  familyHits,
  signalsIn,
  type StyleFamily,
} from '../guardianLexicon.js';

/*
 * Brand Guardian del proveedor DEMO (desarrollo, tests y respaldo cuando la IA falla). No es un
 * modelo: aplica reglas sobre el ADN REAL recibido, así que el mismo texto produce diagnósticos
 * distintos en marcas distintas ("disruptivo" choca con una marca cuidadora y tradicional por su
 * personalidad, y con una sabia y técnica por su precisión). Solo cita referencias de la entrada.
 */

type Finding = GeneratedGuardianEvaluation['findings'][number];

const SIGNAL_PREFIXES =
  /^BRAND_(TRAIT|VALUE|DIFFERENTIATOR|ORIGIN|ESSENCE|MATERIAL|PREFERRED_WORD)_/;

const FAMILY_COPY: Partial<Record<StyleFamily, { title: string; severity: Finding['severity'] }>> =
  {
    innovation: {
      title: 'Presenta una identidad innovadora que la marca no tiene',
      severity: 'medium',
    },
    hype: { title: 'Promete con grandilocuencia, no con la voz de la marca', severity: 'medium' },
    cold_tech: {
      title: 'Introduce un registro frío y tecnológico ajeno a la marca',
      severity: 'medium',
    },
    luxury: { title: 'Plantea un lujo aspiracional que la marca no comunica', severity: 'medium' },
    childish: {
      title: 'Usa un registro infantil ajeno a la personalidad de la marca',
      severity: 'medium',
    },
    rustic: { title: 'Lleva la marca a un registro rústico que no es el suyo', severity: 'low' },
  };

const COLD_REGISTER =
  /\b(estimado cliente|le informamos|nuestra empresa|soluciones integrales|a la vanguardia)\b/;
const SLANG = /\b(bro|brutal|jaja+|crack|parcero|chimba|wow)\b/;

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function composeDemoGuardianEvaluation(
  payload: GuardianPayload,
): GeneratedGuardianEvaluation {
  const findings: Finding[] = [];
  const dimensions: GeneratedGuardianEvaluation['dimensions'] = [];
  const joined = payload.resource.map((entry) => entry.text).join(' ');
  const refsWith = (prefix: string) =>
    payload.brand.filter((entry) => entry.ref.startsWith(`${prefix}_`)).map((e) => e.ref);
  const resourceWith = (words: string[]) =>
    payload.resource
      .filter((entry) => words.some((word) => fold(entry.text).includes(word)))
      .map((e) => e.ref);

  if (payload.dimensions.includes('identity')) {
    const signals = brandSignals(
      payload.brand.filter((entry) => SIGNAL_PREFIXES.test(entry.ref)).map((entry) => entry.text),
      `${payload.brandName} ${payload.industry}`,
    );
    const found = signalsIn(joined, signals);
    for (const family of [
      'innovation',
      'hype',
      'cold_tech',
      'luxury',
      'childish',
      'rustic',
    ] as const) {
      const hits = familyHits(joined, family);
      const clash = hits.length ? familyClash(family, payload.profile) : null;
      const copy = FAMILY_COPY[family];
      if (!clash || !copy) continue;
      findings.push({
        dimension: 'identity',
        severity: copy.severity,
        code: `identity_${family}`,
        title: copy.title,
        message: `Habla de ${hits.join(', ')}, pero ${payload.brandName} ${clash.reason}.`,
        evidenceRefs: resourceWith(hits).slice(0, 3),
        brandRefs: clash.prefixes.flatMap((prefix) => refsWith(prefix).slice(0, 2)).slice(0, 5),
        recommendation: `Cuéntalo desde lo que define a ${payload.brandName}: ${payload.brand
          .filter((entry) => /^BRAND_(DIFFERENTIATOR|TRAIT)_/.test(entry.ref))
          .slice(0, 3)
          .map((entry) => entry.text.toLowerCase())
          .join(', ')}.`,
      });
    }
    const generic = familyHits(joined, 'generic');
    const words = joined.split(/\s+/).filter(Boolean).length;
    if (!found.length && (generic.length || words >= 5)) {
      findings.push({
        dimension: 'identity',
        severity: generic.length ? 'medium' : 'low',
        code: 'no_brand_signal',
        title: generic.length
          ? `No suena a ${payload.brandName}: no usa nada propio de la marca`
          : `Todavía no usa nada propio de ${payload.brandName}`,
        message: `El texto no menciona ningún rasgo, valor ni diferenciador de ${payload.brandName}${generic.length ? ` y se apoya en palabras genéricas (${generic.join(', ')})` : ''}. Así, podría firmarlo cualquier marca.`,
        evidenceRefs: payload.resource.slice(0, 2).map((entry) => entry.ref),
        brandRefs: [...refsWith('BRAND_DIFFERENTIATOR'), ...refsWith('BRAND_ESSENCE')].slice(0, 4),
        recommendation: `Incluye un rasgo real de la marca, por ejemplo: ${
          payload.brand
            .filter((entry) => /^BRAND_DIFFERENTIATOR_/.test(entry.ref))
            .slice(0, 2)
            .map((entry) => `«${entry.text}»`)
            .join(' o ') || 'su esencia'
        }.`,
      });
    }
    if (found.length) {
      dimensions.push({
        dimension: 'identity',
        summary: `Se apoya en rasgos propios de ${payload.brandName} (${found.slice(0, 3).join(', ')}).`,
      });
    }
  }

  if (payload.dimensions.includes('communication')) {
    const plain = fold(joined);
    const cold = COLD_REGISTER.exec(plain);
    if (cold && payload.profile.warmth >= 60) {
      findings.push({
        dimension: 'communication',
        severity: 'low',
        code: 'distant_register',
        title: 'El registro es más distante que el de la marca',
        message: `«${cold[0]}» suena corporativo; la marca habla con cercanía.`,
        evidenceRefs: resourceWith([cold[0]]).slice(0, 2),
        brandRefs: refsWith('BRAND_TONE').slice(0, 3),
        recommendation: 'Habla de tú a tú, con frases cortas y concretas.',
      });
    }
    const slang = SLANG.exec(plain);
    if (slang && payload.profile.formality >= 4) {
      findings.push({
        dimension: 'communication',
        severity: 'medium',
        code: 'too_informal',
        title: 'El registro es demasiado informal para la marca',
        message: `«${slang[0]}» rompe la formalidad con la que se comunica la marca.`,
        evidenceRefs: resourceWith([slang[0]]).slice(0, 2),
        brandRefs: [...refsWith('BRAND_FORMALITY'), ...refsWith('BRAND_TONE')].slice(0, 3),
        recommendation: 'Mantén un registro claro y profesional.',
      });
    }
    if (!findings.some((finding) => finding.dimension === 'communication')) {
      dimensions.push({
        dimension: 'communication',
        summary: 'El registro no se aleja de la cercanía ni de la formalidad de la marca.',
      });
    }
  }

  return { dimensions, findings };
}

/* ---------- Corrección demo: quitar y suavizar, nunca inventar ---------- */

const PROMO_CLAUSE = /(descuent|ofert|gratis|gratuit|2x1|3x2|cupon|sorteo|precio|promoci|\d+\s*%)/i;
const URGENCY = [
  [/\b(c[oó]mpra(lo|la)?)\s+ya\b/gi, 'Descubre'],
  [/\bc[oó]mpralo\b/gi, 'Descúbrelo'],
  [/\b(ya mismo|solo hoy|por tiempo limitado|antes de que se acabe)\b/gi, ''],
  [
    /\b(no te lo pierdas|última oportunidad|ultima oportunidad|imperdible|aprovecha ya)\b[,.!]*/gi,
    '',
  ],
] as const;
const MARKET = [
  /#\s?1\b/g,
  /\bn[uú]mero\s+(1|uno)\b/gi,
  /\b(mejor(es)?|l[ií]der(es)?|m[aá]s\s+vendid[oa]s?|premiad[oa]s?|galardonad[oa]s?|certificad[oa]s?|garantizad[oa]s?)\s*/gi,
];

function tidy(text: string, calm: boolean): string {
  let value = (calm ? text.replace(/[¡!]+/g, '') : text)
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])\s*([,.;:])/g, '$2')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, '')
    .trim();
  if (!value) return '';
  value = value.charAt(0).toLocaleUpperCase('es') + value.slice(1);
  return /[.?…]$/.test(value) ? value : `${value}.`;
}

/** Quita la cláusula (separada por comas o conectores) que contiene un fragmento. */
function dropClause(text: string, test: (clause: string) => boolean): string {
  const parts = text.split(/(\s*,\s*|\s+(?:con|y|e)\s+)/i);
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    const clause = parts[index] ?? '';
    if (test(clause)) continue;
    if (kept.length) kept.push(parts[index - 1] ?? ' ');
    kept.push(clause);
  }
  return kept.join('');
}

export function correctDemoText(
  text: string,
  issues: GuardianCorrectionPayload['texts'][number]['issues'],
  brandFacts: string[],
): { corrected: string; changes: string[] } {
  let value = text;
  const changes: string[] = [];
  for (const issue of issues) {
    const before = value;
    switch (issue.kind) {
      case 'remove_claim': {
        for (const pattern of MARKET) value = value.replace(pattern, '');
        if (value !== before) changes.push('Quité un claim de superioridad sin fundamento.');
        break;
      }
      case 'remove_phrase': {
        if (PROMO_CLAUSE.test(issue.match) || /\d/.test(issue.match)) {
          value = dropClause(
            value,
            (clause) => PROMO_CLAUSE.test(clause) || clause.includes(issue.match),
          );
          if (value !== before)
            changes.push('Quité una promoción o cifra que la marca no ha dado.');
        } else {
          for (const pattern of MARKET) value = value.replace(pattern, '');
          if (value !== before) changes.push('Quité un claim de superioridad sin fundamento.');
        }
        break;
      }
      case 'remove_proper_name': {
        const escaped = issue.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        value = value
          .replace(new RegExp(`\\s*\\b(del|de la|de|en)\\s+${escaped}\\b`, 'g'), '')
          .replace(new RegExp(`\\b${escaped}\\b`, 'g'), '');
        if (value !== before) changes.push(`Quité «${issue.match}», que la marca no menciona.`);
        break;
      }
      case 'soften_urgency': {
        for (const [pattern, replacement] of URGENCY) value = value.replace(pattern, replacement);
        if (value !== before) changes.push('Cambié la presión de venta por una invitación.');
        break;
      }
      case 'normalize_shouting': {
        value = value
          .replace(/(?<!\p{L})([A-ZÁÉÍÓÚÑ]{2,})(?!\p{L})/gu, (word) =>
            word.length <= 3 ? word : word.toLocaleLowerCase('es'),
          )
          .replace(/!{2,}/g, '!');
        if (value !== before) changes.push('Quité las mayúsculas sostenidas y las exclamaciones.');
        break;
      }
    }
  }
  const calm = issues.some(
    (issue) => issue.kind === 'normalize_shouting' || issue.kind === 'soften_urgency',
  );
  let corrected = tidy(value, calm);
  if (corrected.split(/\s+/).filter(Boolean).length < 4 && brandFacts[0]) {
    corrected = tidy(
      `${corrected.replace(/\.$/, '')}: ${brandFacts[0].charAt(0).toLocaleLowerCase('es')}${brandFacts[0].slice(1)}`,
      calm,
    );
    changes.push('Completé el mensaje con un rasgo real de la marca.');
  }
  return { corrected: corrected || text, changes: [...new Set(changes)] };
}

export function composeDemoGuardianCorrection(
  payload: GuardianCorrectionPayload,
): GeneratedGuardianCorrection {
  const fields: GeneratedGuardianCorrection['fields'] = [];
  const changes: string[] = [];
  for (const text of payload.texts) {
    const result = correctDemoText(text.text, text.issues, payload.brandFacts);
    if (result.corrected !== text.text) {
      fields.push({ ref: text.ref, corrected: result.corrected.slice(0, 4000) });
      changes.push(...result.changes);
    }
  }
  return { fields, changes: [...new Set(changes)].slice(0, 10) };
}
