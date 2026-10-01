import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiConfigurations } from "@/lib/db/schema";
import { ids } from "@/lib/utils/ids";
import { encrypt, mask } from "@/lib/security/crypto";
import { nowIso } from "@/lib/utils/time";

const Body = z.object({
  userId: z.string().min(1),
  provider: z.string().min(1),
  label: z.string().min(1).default("default"),
  model: z.string().min(1),
  baseUrl: z.string().nullable().optional(),
  // Accept numbers OR numeric strings; coerce to number, clamp to range.
  temperature: z.coerce.number().min(0).max(2).default(0.4),
  maxTokens: z.coerce.number().int().min(100).max(32_000).default(2000),
  streaming: z.coerce.boolean().default(true),
  apiKey: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid setting body",
        details: parsed.error.flatten(),
        hint: "userId, provider, label, model, temperature, maxTokens, streaming, apiKey (optional)",
      },
      { status: 400 },
    );
  }
  const b = parsed.data;

  // Mark all other configs for this user/provider as not default, then upsert.
  await db
    .update(aiConfigurations)
    .set({ isDefault: false, updatedAt: nowIso() })
    .where(eq(aiConfigurations.userId, b.userId));

  const existing = await db
    .select()
    .from(aiConfigurations)
    .where(and(eq(aiConfigurations.userId, b.userId), eq(aiConfigurations.provider, b.provider), eq(aiConfigurations.label, b.label)))
    .limit(1);

  let apiCipher: string | null = null;
  let iv: string | null = null;
  let last4: string | null = null;
  if (b.apiKey) {
    const enc = encrypt(b.apiKey);
    apiCipher = "v1:" + enc.ciphertext;
    iv = enc.iv;
    last4 = mask(b.apiKey);
    // authTag is concatenated for now to keep schema stable
    apiCipher = "v1:" + enc.ciphertext + "." + enc.authTag;
  }

  const values = {
    userId: b.userId,
    provider: b.provider,
    label: b.label,
    baseUrl: b.baseUrl ?? null,
    model: b.model,
    temperature: String(b.temperature),
    maxTokens: b.maxTokens,
    streaming: b.streaming,
    apiKeyCiphertext: apiCipher,
    apiKeyIv: iv,
    apiKeyLast4: last4,
    isDefault: true,
    updatedAt: nowIso(),
  } as const;

  if (existing[0]) {
    const patch = { ...values };
    if (!b.apiKey) {
      // don't touch existing key if not provided
      (patch as Record<string, unknown>).apiKeyCiphertext = existing[0].apiKeyCiphertext;
      (patch as Record<string, unknown>).apiKeyIv = existing[0].apiKeyIv;
      (patch as Record<string, unknown>).apiKeyLast4 = existing[0].apiKeyLast4;
    }
    await db.update(aiConfigurations).set(patch).where(eq(aiConfigurations.id, existing[0].id));
  } else {
    await db.insert(aiConfigurations).values({
      id: ids.aiConfig(),
      ...values,
    });
  }

  return NextResponse.json({ ok: true, saved: Boolean(b.apiKey) });
}