
export const PROJECT_STATUSES = [
  'DRAFT',
  'BUILDING',
  'READY',
  'FAILED',
  'CORRUPTED'
] as const;

export type ProjectStatus = typeof PROJECT_STATUSES[number];

export function isValidProjectStatus(status: unknown): status is ProjectStatus {
  return typeof status === 'string' && PROJECT_STATUSES.includes(status as any);
}
