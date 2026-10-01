/**
 * Server-side trigger to run the seed (idempotent). Wraps the seed script
 * logic so the UI can call it without spawning tsx.
 */
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";

export async function POST() {
  return new Promise<Response>((resolve) => {
    const proc = spawn("npx", ["tsx", "scripts/seed.ts"], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "./data/learning-os.db" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => { out += d.toString(); });
    proc.stderr.on("data", (d) => { err += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(NextResponse.json({ ok: true, output: out.trim() }));
      } else {
        resolve(NextResponse.json({ ok: false, error: err.trim() || out.trim() }, { status: 500 }));
      }
    });
  });
}