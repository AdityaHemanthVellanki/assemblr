
export const PROJECT_STATUSES = [
  'CREATED',
  'RUNNING',
  'FINALIZING',
  'READY',
  'FAILED'
] as const;

export type ProjectStatus = typeof PROJECT_STATUSES[number];

export function isValidProjectStatus(status: unknown): status is ProjectStatus {
  return typeof status === 'string' && PROJECT_STATUSES.includes(status as any);
}
