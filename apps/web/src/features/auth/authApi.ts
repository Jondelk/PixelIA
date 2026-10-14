import {
  AuthResponseSchema,
  type LoginInput,
  type RegisterInput,
  type User,
} from '@pixel/contracts';
import { apiRequest, apiSend } from '../../lib/api';

export async function fetchCurrentUser(signal?: AbortSignal): Promise<User> {
  return (await apiRequest('/api/auth/me', AuthResponseSchema, { signal })).user;
}

export async function loginRequest(input: LoginInput): Promise<User> {
  return (await apiRequest('/api/auth/login', AuthResponseSchema, { method: 'POST', body: input }))
    .user;
}

export async function registerRequest(input: RegisterInput): Promise<User> {
  return (
    await apiRequest('/api/auth/register', AuthResponseSchema, { method: 'POST', body: input })
  ).user;
}

export async function logoutRequest(): Promise<void> {
  await apiSend('/api/auth/logout', { method: 'POST' });
}
