import { NextResponse } from "next/server";
import { z } from "zod";
import { getDefaultUser } from "@/lib/ai/service";
import { readSetting, writeSetting } from "@/lib/ai/service";
import { DEFAULT_LANGUAGE, LANGUAGE_SETTING_KEY } from "@/lib/ai/language";

export const dynamic = "force-dynamic";

const Body = z.object({
  language: z.string().trim().min(1).max(40),
});

export async function GET() {
  const user = await getDefaultUser();
  const value = await readSetting<string>(user.id, LANGUAGE_SETTING_KEY);
  return NextResponse.json({
    language: typeof value === "string" && value.length > 0 ? value : DEFAULT_LANGUAGE,
    defaults: { env: process.env.AI_DEFAULT_LANGUAGE ?? null, hardcoded: DEFAULT_LANGUAGE },
  });
}

export async function PUT(req: Request) {
  const user = await getDefaultUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.flatten() }, { status: 400 });
  }
  await writeSetting(user.id, LANGUAGE_SETTING_KEY, parsed.data.language);
  return NextResponse.json({ ok: true, language: parsed.data.language });
}