import type { PersonalOnboardingStepInput } from '@pixel/contracts';

/*
 * Dos personas deliberadamente opuestas (test conceptual de Pixel Personal):
 * una fotógrafa editorial que quiere vender sesiones premium y un streamer enérgico que quiere
 * crecer su comunidad. Mismas preguntas → ADN, avatar y respuestas claramente distintos.
 */

export type PersonalAnswers = PersonalOnboardingStepInput;

export const photographer: PersonalAnswers = {
  identity: {
    name: 'Valeria Mora',
    profession: 'Fotógrafa de retrato',
    headline: 'Retratos editoriales con luz natural',
    bio: '',
    roles: ['fotógrafa', 'directora de arte'],
    skills: ['retrato editorial', 'luz natural', 'retoque'],
    interests: ['arquitectura', 'cine europeo'],
    location: 'Bogotá',
  },
  goals: {
    professional: ['vender sesiones premium'],
    personal: [],
    content: ['mostrar mi proceso'],
    shortTerm: ['cerrar cuatro sesiones premium este mes'],
    longTerm: ['ser referente en retrato editorial'],
  },
  audience: {
    primaryAudience: 'Profesionales y marcas personales que quieren retratos de alto nivel',
    secondaryAudiences: ['revistas'],
    needs: ['retratos que transmitan autoridad'],
    problems: ['fotos genéricas de banco de imágenes'],
    desiredPerception: ['exclusiva', 'serena', 'precisa'],
  },
  personality: { traits: ['minimalista', 'serena', 'editorial'] },
  communication: {
    tone: ['sereno', 'sofisticado'],
    formality: 4,
    energy: 2,
    language: 'es',
    preferredWords: ['luz', 'calma', 'detalle'],
    avoidWords: ['barato', 'promo'],
  },
  creative: {
    styles: ['minimalista', 'editorial'],
    colors: [
      { hex: '#F2EFE9', name: 'Marfil' },
      { hex: '#1C1C1C', name: 'Carbón' },
    ],
    references: ['revistas de moda impresas'],
    visualPreferences: ['mucho espacio negativo', 'luz natural'],
    avoidVisuals: ['filtros saturados', 'collages recargados'],
  },
  contentWork: {
    content: {
      themes: ['detrás de cámara', 'antes y después del retoque'],
      formats: ['carruseles', 'fotografía'],
      platforms: ['Instagram', 'LinkedIn'],
      frequency: '3 publicaciones por semana',
    },
    work: {
      preferredWorkTimes: ['mañana'],
      planningStyle: ['planificación semanal'],
      executionStyle: ['una cosa a la vez'],
      focusStyle: ['trabajo profundo', 'en silencio'],
      productivityPreferences: ['revisión semanal'],
    },
  },
  support: {
    wantsHelpWith: ['contenido', 'marca personal', 'clientes'],
    expectations:
      'Que me ayude a decidir qué publicar para atraer clientes premium sin perder mi estilo.',
  },
};

export const streamer: PersonalAnswers = {
  identity: {
    name: 'Mateo Ríos',
    profession: 'Streamer de videojuegos',
    headline: 'Directos de juegos indie y retos con la comunidad',
    bio: '',
    roles: ['streamer', 'creador de contenido'],
    skills: ['edición de clips', 'improvisación', 'moderación de comunidad'],
    interests: ['videojuegos indie', 'speedruns', 'anime'],
    location: '',
  },
  goals: {
    professional: ['vivir del streaming'],
    personal: [],
    content: ['crecer la comunidad', 'más clips virales'],
    shortTerm: ['llegar a mil seguidores en Twitch'],
    longTerm: ['crear un evento propio con la comunidad'],
  },
  audience: {
    primaryAudience: 'Gamers de 16 a 28 años que buscan directos divertidos',
    secondaryAudiences: ['fans de juegos indie'],
    needs: ['entretenimiento', 'sentirse parte de algo'],
    problems: ['directos aburridos', 'comunidades tóxicas'],
    desiredPerception: ['divertido', 'cercano', 'auténtico'],
  },
  personality: { traits: ['energético', 'divertido', 'colorido'] },
  communication: {
    tone: ['energético', 'casual'],
    formality: 1,
    energy: 5,
    language: 'es',
    preferredWords: ['banda', 'épico', 'vamos'],
    avoidWords: ['estimado usuario'],
  },
  creative: {
    styles: ['urbano', 'experimental'],
    colors: [
      { hex: '#7C3AED', name: 'Violeta' },
      { hex: '#22D3EE', name: 'Cian' },
    ],
    references: ['overlays de esports'],
    visualPreferences: ['colores saturados', 'tipografía grande'],
    avoidVisuals: ['estética corporativa'],
  },
  contentWork: {
    content: {
      themes: ['retos', 'juegos indie', 'momentos de la comunidad'],
      formats: ['reels', 'video largo', 'stories'],
      platforms: ['Twitch', 'TikTok', 'YouTube'],
      frequency: 'directo diario',
    },
    work: {
      preferredWorkTimes: ['noche'],
      planningStyle: ['calendario'],
      executionStyle: ['sprints cortos'],
      focusStyle: ['con música'],
      productivityPreferences: ['un objetivo por día'],
    },
  },
  support: {
    wantsHelpWith: ['contenido', 'ideas creativas', 'planificación'],
    expectations: 'Ideas para crecer la comunidad y no repetir siempre lo mismo.',
  },
};

/** Persona de la prueba con datos reales del Content Planner (Prompt 10 §54). */
export const creativeDirector: PersonalAnswers = {
  identity: {
    name: 'Jhon Trochez',
    profession: 'Director creativo',
    headline: 'Diseño, audiovisual y software para marcas',
    bio: '',
    roles: ['director creativo', 'diseñador gráfico', 'productor audiovisual', 'desarrollador'],
    skills: ['diseño gráfico', 'producción audiovisual', 'software', 'dirección de arte'],
    interests: ['tecnología', 'cine'],
    location: '',
  },
  goals: {
    professional: ['construir autoridad como director creativo'],
    personal: [],
    content: ['mostrar mi criterio creativo con procesos reales'],
    shortTerm: ['publicar con constancia'],
    longTerm: ['ser referente en dirección creativa con tecnología'],
  },
  audience: {
    primaryAudience: 'Emprendedores y marcas que necesitan dirección creativa',
    secondaryAudiences: ['creativos jóvenes'],
    needs: ['claridad creativa', 'identidad coherente'],
    problems: ['briefs confusos', 'marcas sin dirección visual'],
    desiredPerception: ['estratégico', 'preciso', 'cinematográfico'],
  },
  personality: { traits: ['minimalista', 'visionario', 'preciso'] },
  communication: {
    tone: ['claro', 'seguro'],
    formality: 3,
    energy: 3,
    language: 'es',
    preferredWords: ['criterio', 'proceso', 'dirección'],
    avoidWords: ['barato'],
  },
  creative: {
    styles: ['tecnológico', 'minimalista', 'cinematográfico'],
    colors: [{ hex: '#08080B', name: 'Negro' }],
    references: ['títulos de cine'],
    visualPreferences: ['mucho espacio negativo'],
    avoidVisuals: ['plantillas genéricas'],
  },
  contentWork: {
    content: {
      themes: ['procesos creativos', 'dirección de arte', 'tecnología creativa'],
      formats: ['reels', 'carruseles', 'stories'],
      platforms: ['Instagram'],
      frequency: '3 publicaciones por semana',
    },
    work: {
      preferredWorkTimes: ['noche'],
      planningStyle: ['planificación semanal'],
      executionStyle: ['sprints cortos'],
      focusStyle: ['trabajo profundo'],
      productivityPreferences: ['revisión semanal'],
    },
  },
  support: {
    wantsHelpWith: ['contenido', 'marca personal', 'ideas creativas'],
    expectations: 'Que me ayude a convertir mi trabajo real en contenido con criterio.',
  },
};
