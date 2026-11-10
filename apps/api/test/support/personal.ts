import { PERSONAL_ONBOARDING_STEPS, type PersonalOnboardingStep } from '@pixel/contracts';
import type { PersonalAnswers } from '../fixtures/personal.js';
import type { registerUser } from './testApp.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

export async function createPersonalWorkspace(session: Session, name = 'Jhon'): Promise<string> {
  const res = await session.agent
    .post('/api/workspaces')
    .send({ type: 'personal', name })
    .expect(201);
  return res.body.workspace.id as string;
}

export function savePersonalStep(
  session: Session,
  workspaceId: string,
  step: PersonalOnboardingStep,
  answers: PersonalAnswers,
) {
  return session.agent
    .put(`/api/workspaces/${workspaceId}/personal-profile`)
    .send({ step, data: answers[step] });
}

export async function completePersonalOnboarding(
  session: Session,
  workspaceId: string,
  answers: PersonalAnswers,
) {
  for (const step of PERSONAL_ONBOARDING_STEPS) {
    await savePersonalStep(session, workspaceId, step, answers).expect(200);
  }
}
