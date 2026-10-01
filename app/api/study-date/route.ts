/**
 * Study date API.
 *
 *   POST /api/study-date            body: { date: "YYYY-MM-DD" } → set
 *   POST /api/study-date  body: { reset: true }                  → clear
 *   DELETE /api/study-date                                          → clear
 *
 * Cookie is not HttpOnly (client UI needs to read it for instant feedback).
 * It has a 30-day max-age so the override quietly expires.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { STUDY_DATE_COOKIE } from "@/lib/utils/study-date";

const Body = z.union([
  z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ reset: z.literal(true) }),
]);

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if ("reset" in parsed.data) {
    const r = NextResponse.json({ ok: true, cleared: true });
    r.cookies.delete(STUDY_DATE_COOKIE);
    return r;
  }
  const r = NextResponse.json({ ok: true, date: parsed.data.date });
  r.cookies.set(STUDY_DATE_COOKIE, parsed.data.date, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return r;
}

export async function DELETE() {
  const r = NextResponse.json({ ok: true, cleared: true });
  r.cookies.delete(STUDY_DATE_COOKIE);
  return r;
}