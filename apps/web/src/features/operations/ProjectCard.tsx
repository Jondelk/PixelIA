import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type Project } from '@pixel/contracts';
import { Link } from 'react-router';
import { DueLabel, PriorityMark, ProgressBar, StatusTag } from './ui';

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Tarjeta de proyecto: identidad, estado, fecha límite, progreso calculado y conteos reales. */
export function ProjectCard({ project, to }: { project: Project; to: string }) {
  const pending = project.status !== 'completed' && project.status !== 'archived';
  return (
    <Link
      to={to}
      className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong sm:p-7"
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag>{PROJECT_STATUS_LABELS[project.status]}</StatusTag>
        <span className="text-xs text-subtle">{PROJECT_TYPE_LABELS[project.type]}</span>
        <span className="flex-1" />
        <PriorityMark priority={project.priority} />
      </div>
      <h3 className="mt-5 font-display text-lg font-bold leading-snug tracking-tight">
        {project.name}
      </h3>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-relaxed text-muted">
        {project.description ?? 'Sin descripción.'}
      </p>
      <div className="mt-6">
        <ProgressBar value={project.progress} label="Progreso" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-muted">
        <span>{plural(project.stats.tasks, 'tarea', 'tareas')}</span>
        <span>{plural(project.stats.contentItems, 'contenido', 'contenidos')}</span>
        <span className="flex-1" />
        <DueLabel iso={project.dueDate} pending={pending} prefix="Límite" />
      </div>
    </Link>
  );
}
