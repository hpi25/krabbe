export interface ReadyInfo {
  timeStart: string;
  timeEnd: string;
  timezone: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parseReady(data: unknown): ReadyInfo | null {
  if (!isObj(data) || data.source !== 'krabbe' || data.type !== 'calendar-bridge:ready') return null;
  const { timeStart, timeEnd, timezone } = data;
  if (typeof timeStart !== 'string' || typeof timeEnd !== 'string' || typeof timezone !== 'string') return null;
  return { timeStart, timeEnd, timezone };
}

export function parseApplied(data: unknown): number | null {
  if (!isObj(data) || data.source !== 'krabbe' || data.type !== 'calendar-bridge:applied') return null;
  return typeof data.removed === 'number' && Number.isFinite(data.removed) ? data.removed : null;
}
