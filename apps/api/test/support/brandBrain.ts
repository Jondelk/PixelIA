import type { OnboardingStep } from '@pixel/contracts';
import { STEP_ORDER, type cafeTinto } from '../fixtures/onboarding.js';
import type { registerUser } from './testApp.js';

type Session = Awaited<ReturnType<typeof registerUser>>;

export async function createCompany(session: Session, name = 'Café Tinto'): Promise<string> {
  const res = await session.agent
    .post('/api/companies')
    .send({ name, industry: 'Café' })
    .expect(201);
  return res.body.company.id as string;
}

export function saveStep(
  session: Session,
  companyId: string,
  step: OnboardingStep,
  answers: typeof cafeTinto,
) {
  return session.agent
    .put(`/api/companies/${companyId}/brand-dna`)
    .send({ step, data: answers[step] });
}

export async function completeOnboarding(
  session: Session,
  companyId: string,
  answers: typeof cafeTinto,
) {
  for (const step of STEP_ORDER) await saveStep(session, companyId, step, answers).expect(200);
}
