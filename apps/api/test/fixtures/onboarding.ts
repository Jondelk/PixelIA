import type { OnboardingStep, OnboardingStepInput } from '@pixel/contracts';

type OnboardingInput = { [K in OnboardingStep]: OnboardingStepInput[K] };

/** Café artesanal colombiano: debería resultar cálido, artesanal y orgánico. */
export const cafeTinto: OnboardingInput = {
  company: {
    name: 'Café Tinto',
    industry: 'Café de especialidad',
    description: 'Tostamos café de origen colombiano en pequeños lotes.',
    history: 'Nació en 2015 en una finca familiar del Huila, tres generaciones de caficultores.',
    origin: 'Huila, Colombia',
  },
  purpose: {
    mission: 'Llevar el mejor café colombiano a cada taza con trato justo al caficultor.',
    vision: 'Ser la marca de café artesanal más querida de Latinoamérica.',
    purpose: 'Honrar el trabajo de las familias cafeteras.',
    values: ['Origen', 'Oficio', 'Comercio justo'],
  },
  audience: {
    targetAudience: 'Amantes del café de 25 a 45 años que valoran el origen y el ritual.',
    needs: ['Café fresco', 'Conocer el origen'],
    problems: ['Café industrial sin sabor', 'Poca trazabilidad'],
    characteristics: ['Urbanos', 'Curiosos', 'Conscientes'],
  },
  personality: { attributes: ['artesanal', 'cercana', 'cálida', 'tradicional', 'Huilense'] },
  communication: {
    tone: ['cálido', 'cercano'],
    formality: 2,
    energy: 2,
    language: 'es',
    wordsToUse: ['origen', 'finca', 'tinto'],
    wordsToAvoid: ['barato', 'instantáneo'],
  },
  visual: {
    colors: [
      { hex: '#6b3e26', name: 'Tostado' },
      { hex: '#A9714B', name: 'Caramelo' },
      { hex: '#E8C07D', name: 'Crema' },
      { hex: '#F5EFE6', name: 'Hueso' },
    ],
    styles: ['artesanal', 'orgánico', 'natural'],
    materials: ['papel kraft', 'madera', 'barro'],
    shapes: ['orgánicas', 'redondeadas'],
    references: ['Empaques de finca'],
    recurringElements: ['Grano de café', 'Montañas'],
    avoid: ['Neón', 'Brillos metálicos'],
  },
  competition: {
    competitors: ['Juan Valdez', 'Tostadores locales'],
    differentiators: ['Trazabilidad lote a lote', 'Tostión semanal'],
  },
  creative: {
    likes: ['Fotografía con luz natural', 'Texturas reales'],
    dislikes: ['Estética corporativa fría'],
    visualReferences: ['Kinfolk'],
    restrictions: ['No mostrar café instantáneo'],
  },
};

/** Startup tecnológica: debería resultar innovadora, precisa y geométrica. */
export const novaLabs: OnboardingInput = {
  ...cafeTinto,
  company: {
    name: 'Nova Labs',
    industry: 'Software',
    description: 'Plataforma de automatización con IA para equipos de operaciones.',
    history: 'Fundada en 2022 por ingenieros que automatizaban procesos a mano.',
    origin: null,
  },
  purpose: {
    mission:
      'Eliminar el trabajo repetitivo de los equipos de operaciones con automatización fiable.',
    vision: 'Que ningún equipo pierda horas en tareas que una máquina puede hacer mejor.',
    purpose: 'Devolverle a la gente tiempo para el trabajo que importa.',
    values: ['Precisión', 'Transparencia', 'Velocidad'],
  },
  audience: {
    targetAudience: 'Líderes de operaciones en empresas medianas que gestionan procesos manuales.',
    needs: ['Ahorrar horas de trabajo manual', 'Integrarse con sus herramientas actuales'],
    problems: ['Hojas de cálculo frágiles', 'Errores al copiar datos entre sistemas'],
    characteristics: ['Analíticos', 'Escépticos ante promesas de IA', 'Orientados a resultados'],
  },
  personality: { attributes: ['innovadora', 'tecnológica', 'minimalista', 'precisa'] },
  communication: {
    tone: ['directo', 'experto'],
    formality: 4,
    energy: 4,
    language: 'en',
    wordsToUse: ['automatizar', 'escala'],
    wordsToAvoid: ['revolucionario'],
  },
  visual: {
    colors: [
      { hex: '#0B1220', name: 'Noche' },
      { hex: '#2F6BFF', name: 'Eléctrico' },
      { hex: '#22D3EE', name: 'Cian' },
    ],
    styles: ['futurista', 'minimalista', 'tecnológico'],
    materials: ['vidrio', 'metal'],
    shapes: ['geométricas', 'angulares'],
    references: [],
    recurringElements: ['Cuadrícula'],
    avoid: ['Texturas rústicas'],
  },
  competition: {
    competitors: ['Zapier', 'Consultoras de RPA'],
    differentiators: ['Integración en un día', 'Flujos auditables paso a paso'],
  },
  creative: {
    likes: ['Interfaces reales en pantalla', 'Datos claros'],
    dislikes: ['Robots humanoides', 'Promesas exageradas sobre IA'],
    visualReferences: ['Linear', 'Stripe'],
    restrictions: ['No prometer reemplazar personas'],
  },
};

/** Constructora: debería resultar sólida, confiable y estructural. */
export const constructoraNorte: OnboardingInput = {
  ...cafeTinto,
  company: {
    name: 'Constructora Norte',
    industry: 'Construcción',
    description: 'Construimos vivienda y edificaciones comerciales en el norte del país.',
    history: 'Más de 30 años levantando proyectos residenciales y comerciales.',
    origin: 'Barranquilla',
  },
  purpose: {
    mission: 'Construir vivienda y espacios comerciales que duren generaciones.',
    vision: 'Ser la constructora de referencia del norte del país por su cumplimiento.',
    purpose: 'Dar a las familias y empresas espacios seguros en los que crecer.',
    values: ['Cumplimiento', 'Seguridad', 'Calidad'],
  },
  audience: {
    targetAudience:
      'Familias que compran su primera vivienda e inversionistas comerciales de la región.',
    needs: ['Entregas a tiempo', 'Seguridad estructural'],
    problems: ['Obras que se retrasan', 'Acabados que se deterioran pronto'],
    characteristics: ['Prudentes', 'Comparan mucho antes de decidir'],
  },
  personality: { attributes: ['sólida', 'confiable', 'experta', 'seria'] },
  communication: {
    tone: ['directo', 'técnico'],
    formality: 5,
    energy: 3,
    language: 'es',
    wordsToUse: ['solidez', 'cumplimiento'],
    wordsToAvoid: [],
  },
  visual: {
    colors: [
      { hex: '#2B2B2B', name: 'Grafito' },
      { hex: '#F2A900', name: 'Amarillo seguridad' },
      { hex: '#8A8D8F', name: 'Concreto' },
    ],
    styles: ['industrial', 'brutalista'],
    materials: ['concreto', 'acero'],
    shapes: ['estructurales', 'angulares'],
    references: [],
    recurringElements: ['Vigas'],
    avoid: ['Formas blandas'],
  },
  competition: {
    competitors: ['Grandes constructoras nacionales'],
    differentiators: ['Entrega en la fecha pactada', 'Seguimiento de obra en línea'],
  },
  creative: {
    likes: ['Fotografía de obra real', 'Planos y detalles técnicos'],
    dislikes: ['Renders irreales'],
    visualReferences: [],
    restrictions: ['No mostrar obras sin elementos de seguridad'],
  },
};

export const STEP_ORDER: OnboardingStep[] = [
  'company',
  'purpose',
  'audience',
  'personality',
  'communication',
  'visual',
  'competition',
  'creative',
];
