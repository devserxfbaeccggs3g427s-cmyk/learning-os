import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/ai/registry";

const Body = z.object({
  provider: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    const provider = getProvider(parsed.data.provider, {
      apiKey: parsed.data.apiKey,
      baseUrl: parsed.data.baseUrl,
    });
    const r = await provider.testConnection(parsed.data.apiKey, parsed.data.baseUrl);
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}