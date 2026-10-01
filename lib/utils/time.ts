/**
 * Date helpers. All persisted timestamps are ISO strings (UTC). Display
 * formatting happens here, never ad-hoc.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Current Date for Postgres `timestamp with time zone` columns. The
 * Postgres driver serializes Date objects natively; we keep `nowIso()`
 * for `text`-typed timestamp columns (legacy/compat) where round-tripping
 * through a string is preferable.
 */
export function nowDate(): Date {
  return new Date();
}

export function isoFromDate(d: Date): string {
  return d.toISOString();
}

export function isoDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function parseIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function diffSeconds(startIso: string, endIso: string): number {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  return Math.max(0, Math.floor((e - s) / 1000));
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0m";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const rm = minutes % 60;
  return rm === 0 ? `${h}h` : `${h}h ${rm}m`;
}

export function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}