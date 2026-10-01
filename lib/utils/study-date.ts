/**
 * Study date override.
 *
 * The app normally uses the real `new Date()` everywhere. Users can
 * temporarily shift the "effective" date via Settings → Study date or
 * the Today-page picker. The override lives in a non-HttpOnly cookie
 * (`study_date`) so client components can read it instantly.
 *
 * Server components / API routes should call `getStudyDate()` instead of
 * `new Date()` for any "today"-style logic.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { isoDay } from "./time";

export const STUDY_DATE_COOKIE = "study_date";

/** ISO date (YYYY-MM-DD). Empty string = no override. Single cookies() read.
 *
 * Wrapped in React `cache()` so multiple components in the same render
 * share one cookies() read. */
export const getStudyDateCookieValue = cache(async (): Promise<string> => {
  const c = (await cookies()).get(STUDY_DATE_COOKIE)?.value;
  return c && /^\d{4}-\d{2}-\d{2}$/.test(c) ? c : "";
});

export type StudyDateInfo = {
  /** Effective study date (cookie override or real today). */
  value: string;
  /** True if the user is viewing a non-real date. */
  overridden: boolean;
  /** Real today (UTC day boundary), ignoring any override. */
  realToday: string;
};

/**
 * Combined read — call once and destructure. Reads the cookie exactly once
 * instead of twice (saves one async hop on every page render). Also cached
 * via React `cache()` so multiple components in the same request share it.
 */
export const getStudyDateInfo = cache(async (): Promise<StudyDateInfo> => {
  const realToday = isoDay(new Date());
  const cookieVal = await getStudyDateCookieValue();
  return {
    value: cookieVal || realToday,
    overridden: cookieVal !== "",
    realToday,
  };
});

/**
 * Resolve the effective study date:
 *   - if cookie is set and valid → cookie value
 *   - else → real today (system date, in UTC day boundary)
 */
export const getStudyDate = cache(async (): Promise<string> => {
  return (await getStudyDateInfo()).value;
});

/** True if the user is currently viewing a non-real date. */
export const isStudyDateOverridden = cache(async (): Promise<boolean> => {
  return (await getStudyDateInfo()).overridden;
});

/** Real today, ignoring the override. */
export function getRealToday(): string {
  return isoDay(new Date());
}