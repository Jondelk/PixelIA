import {
  PROJECT_TYPES_BY_WORKSPACE,
  type ProjectType,
  type WorkspaceOverview,
} from '@pixel/contracts';
import type { SelectOption } from '../../components/SelectField';
import { projectTypeOptionsFor } from './labels';

/*
 * Textos de Operations según el tipo de workspace. Las pantallas son las MISMAS para Personal y
 * Enterprise (Shared Operations): solo cambian algunas frases y las opciones de tipo de proyecto.
 * Personal conserva sus textos de siempre; Enterprise habla de la marca y la nombra.
 */

export interface OperationsCopy {
  projects: {
    title: string;
    description: string;
    emptyTitle: string;
    emptyDescription: string;
  };
  projectForm: {
    namePlaceholder: string;
    descriptionPlaceholder: string;
    /** Tipos que se ofrecen (el actual se conserva aunque no esté en la lista). */
    typeOptions: (current?: ProjectType) => SelectOption<ProjectType>[];
  };
  tasks: { description: string; emptyTitle: string; emptyDescription: string };
  content: { description: string; emptyTitle: string; titlePlaceholder: string };
  projectDetail: { contentEmpty: string };
  overview: { label: string; errorTitle: string; recentProjectsEmpty: string };
}

export const PERSONAL_OPERATIONS_COPY: OperationsCopy = {
  projects: {
    title: 'Proyectos',
    description: 'Reúne tareas y contenido alrededor de un mismo objetivo.',
    emptyTitle: 'Todavía no tienes proyectos.',
    emptyDescription: 'Crea uno para reunir tareas y contenido alrededor de un mismo objetivo.',
  },
  projectForm: {
    namePlaceholder: 'Marca personal',
    descriptionPlaceholder: '¿Qué quieres conseguir con este proyecto?',
    typeOptions: (current) => projectTypeOptionsFor(PROJECT_TYPES_BY_WORKSPACE.personal, current),
  },
  tasks: {
    description: 'Lo que tienes que hacer, a la vista y sin ruido.',
    emptyTitle: 'No tienes tareas pendientes.',
    emptyDescription: 'Escribe arriba lo próximo que necesitas hacer: basta una frase.',
  },
  content: {
    description:
      'Cada pieza, de la idea a la publicación. Pixel aún no publica por ti: aquí lo organizas.',
    emptyTitle: 'Tu próxima idea puede empezar aquí.',
    titlePlaceholder: 'Cómo construí Pixel Personal',
  },
  projectDetail: { contentEmpty: 'Tu próxima idea para este proyecto puede empezar aquí.' },
  overview: {
    label: 'Tu trabajo',
    errorTitle: 'No pudimos cargar tu trabajo',
    recentProjectsEmpty: 'Aún no tienes proyectos.',
  },
};

/** Textos de un Pixel de empresa, con el nombre de la marca. */
export function enterpriseOperationsCopy(brand: string): OperationsCopy {
  return {
    projects: {
      title: `Proyectos de ${brand}`,
      description: 'El trabajo de la marca: tareas y contenido alrededor de un mismo objetivo.',
      emptyTitle: `${brand} aún no tiene proyectos.`,
      emptyDescription: 'Crea un proyecto para organizar el trabajo de la marca.',
    },
    projectForm: {
      namePlaceholder: 'Lanzamiento nueva presentación',
      descriptionPlaceholder: '¿Qué tiene que conseguir este proyecto para la marca?',
      typeOptions: (current) =>
        projectTypeOptionsFor(PROJECT_TYPES_BY_WORKSPACE.enterprise, current),
    },
    tasks: {
      description: `Lo que hay que hacer en ${brand}, a la vista y sin ruido.`,
      emptyTitle: 'No hay tareas pendientes.',
      emptyDescription: 'Escribe arriba lo próximo que hay que hacer: basta una frase.',
    },
    content: {
      description:
        'Cada pieza de la marca, de la idea a la publicación. Pixel aún no publica: aquí se organiza.',
      emptyTitle: 'La próxima pieza de la marca puede empezar aquí.',
      titlePlaceholder: 'Reel lanzamiento nueva presentación',
    },
    projectDetail: { contentEmpty: 'La próxima pieza de este proyecto puede empezar aquí.' },
    overview: {
      label: 'Trabajo de la marca',
      errorTitle: 'No pudimos cargar el trabajo de la marca',
      recentProjectsEmpty: 'Aún no hay proyectos.',
    },
  };
}

/** Copy del workspace activo. Enterprise usa el nombre de su empresa (o del workspace). */
export function operationsCopy(overview: WorkspaceOverview): OperationsCopy {
  return overview.workspace.type === 'enterprise'
    ? enterpriseOperationsCopy(overview.company?.name ?? overview.workspace.name)
    : PERSONAL_OPERATIONS_COPY;
}
