/*
 * Raíz de los recursos compartidos (avatar, conversaciones) de un Pixel:
 * - Enterprise (legacy): /api/companies/:companyId
 * - Cualquier workspace: /api/workspaces/:workspaceId (Personal usa siempre esta)
 * La API resuelve el ADN de origen según el tipo del workspace.
 */

export function companyApiBase(companyId: string): string {
  return `/api/companies/${encodeURIComponent(companyId)}`;
}

export function workspaceApiBase(workspaceId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}`;
}
