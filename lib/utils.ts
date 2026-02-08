import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeUUID(uuid: string) {
  if (!uuid) return null;
  const normalized = uuid.trim().toLowerCase();
  // Relaxed regex to allow non-v4 locally generated UUIDs if necessary, but strictly 8-4-4-4-12 hex
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function resolvePath(object: any, path: string, defaultValue?: any) {
  return path.split('.').reduce((o, p) => (o ? o[p] : defaultValue), object);
}
