import type { registerUser } from './testApp.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

/** Rutas de Operations de un workspace. */
export const ops = (workspaceId: string) => ({
  projects: `/api/workspaces/${workspaceId}/projects`,
  tasks: `/api/workspaces/${workspaceId}/tasks`,
  content: `/api/workspaces/${workspaceId}/content`,
  summary: `/api/workspaces/${workspaceId}/operations/summary`,
});

export async function createProject(session: Session, workspaceId: string, body: object) {
  const res = await session.agent.post(ops(workspaceId).projects).send(body).expect(201);
  return res.body.project as { id: string; [key: string]: unknown };
}

export async function createTask(session: Session, workspaceId: string, body: object) {
  const res = await session.agent.post(ops(workspaceId).tasks).send(body).expect(201);
  return res.body.task as { id: string; [key: string]: unknown };
}

export async function createContent(session: Session, workspaceId: string, body: object) {
  const res = await session.agent.post(ops(workspaceId).content).send(body).expect(201);
  return res.body.contentItem as { id: string; [key: string]: unknown };
}

/** Fecha ISO desplazada `days` días desde ahora (a mediodía UTC para evitar bordes). */
export function daysFromNow(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}
