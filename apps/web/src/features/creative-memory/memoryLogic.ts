import { CREATIVE_MEMORY_ORIGIN_LABELS, type CreativeMemory } from '@pixel/contracts';

/*
 * Lógica pura de "Lo que Pixel ha aprendido" (sin React): cómo se agrupan las memorias y cómo se
 * explican en lenguaje humano. Sin nombres internos (claves, confianza, estados en inglés).
 */

export interface MemoryGroups {
  active: CreativeMemory[];
  candidates: CreativeMemory[];
  history: CreativeMemory[];
}

export function groupMemories(memories: CreativeMemory[]): MemoryGroups {
  return {
    active: memories.filter((memory) => memory.status === 'active'),
    candidates: memories.filter((memory) => memory.status === 'candidate'),
    history: memories.filter((memory) =>
      ['superseded', 'dismissed', 'forgotten'].includes(memory.status),
    ),
  };
}

/** "Aplica a: TINTO" · "Aplica a: la campaña «Cosecha»" · Personal: "Aplica a: tu Pixel". */
export function scopeText(memory: CreativeMemory, owner: string, personal: boolean): string {
  switch (memory.scope.type) {
    case 'workspace':
      return personal ? 'Todo tu Pixel' : owner;
    case 'campaign':
      return `Solo la campaña «${memory.scope.label ?? 'elegida'}»`;
    case 'project':
      return `Solo el proyecto «${memory.scope.label ?? 'elegido'}»`;
    case 'content_plan':
      return `Solo el plan «${memory.scope.label ?? 'elegido'}»`;
  }
}

export const originText = (memory: CreativeMemory) => CREATIVE_MEMORY_ORIGIN_LABELS[memory.origin];

const topicOf = (key: string) => key.split(':').slice(0, 2).join(':');

/**
 * Una candidata que contradice una memoria activa del mismo tema y alcance: confirmarla la
 * reemplaza (la UI lo dice antes de que el usuario decida).
 */
export function conflictingActive(
  candidate: CreativeMemory,
  active: CreativeMemory[],
): CreativeMemory | null {
  return (
    active.find(
      (memory) =>
        topicOf(memory.normalizedKey) === topicOf(candidate.normalizedKey) &&
        memory.normalizedKey !== candidate.normalizedKey &&
        memory.scope.type === candidate.scope.type &&
        memory.scope.id === candidate.scope.id,
    ) ?? null
  );
}

export const HISTORY_STATUS_TEXT: Record<string, string> = {
  superseded: 'Reemplazada',
  dismissed: 'Descartada (no fue intencional)',
  forgotten: 'Olvidada',
};

export const KIND_TITLE: Partial<Record<CreativeMemory['kind'], string>> = {
  exception: 'Excepción',
};
