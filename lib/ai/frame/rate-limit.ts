/**
 * Per-user sliding-window rate limiter for AI chat frames.
 *
 * Frames are the one AI surface that accepts arbitrary free-form
 * questions against the user's own notes, so a runaway loop (or a
 * stuck client retrying) can burn provider credits quickly. The limiter
 * runs BEFORE any DB write or provider call, so a throttled request
 * costs nothing but the check itself.
 *
 * Two windows: a burst window (per minute) and a daily budget.
 *
 * Scope note: this is an in-process limiter. On serverless (Vercel)
 * each instance keeps its own window, so the effective ceiling is
 * `limit × instances`. That is an accepted trade-off for a
 * single-user self-hosted app — it still stops the common runaway-loop
 * case, which is what it is here for. A shared store (Redis/Postgres)
 * would be the upgrade if this ever runs multi-tenant.
 *
 * The core (`advanceWindow`) is pure so the arithmetic is testable
 * without timers or a DB.
 */

/** One window's worth of timestamps. */
export interface RateWindow {
  /** Hit timestamps (ms) currently inside the window. */
  stamps: number[];
  /** Window length in ms. */
  windowMs: number;
  /** Max hits allowed inside the window. */
  limit: number;
}

/**
 * Drop stamps that fell out of the window, then append `now` if the
 * caller is under the limit.
 *
 * Returns the post-call window state and whether the hit was allowed.
 * A rejected call does NOT consume budget.
 */
export function advanceWindow(
  stamps: number[],
  now: number,
  windowMs: number,
  limit: number,
): { stamps: number[]; allowed: boolean; remaining: number } {
  const cutoff = now - windowMs;
  const live = stamps.filter((t) => t > cutoff);
  if (live.length >= limit) {
    return { stamps: live, allowed: false, remaining: 0 };
  }
  const next = [...live, now];
  return { stamps: next, allowed: true, remaining: limit - next.length };
}

/** Config for {@link MemoryRateLimiter}. */
export interface RateLimiterConfig {
  /** Hits allowed per `windowMs`. */
  burstLimit: number;
  burstWindowMs?: number;
  /** Hits allowed per day. */
  dailyLimit: number;
  dailyWindowMs?: number;
}

/** In-memory sliding-window limiter, keyed by an opaque string. */
export class MemoryRateLimiter {
  private burst = new Map<string, RateWindow>();
  private daily = new Map<string, RateWindow>();

  constructor(private readonly cfg: RateLimiterConfig) {}

  /**
   * Record a hit for `key`. Returns allowed=false when any window is
   * exhausted. `now` is injectable so tests don't depend on wall clock.
   */
  hit(key: string, now = Date.now()): { allowed: boolean; reason?: "burst" | "daily" } {
    const burstWindowMs = this.cfg.burstWindowMs ?? 60_000;
    const dailyWindowMs = this.cfg.dailyWindowMs ?? 86_400_000;

    const burstRes = advanceWindow(
      this.burst.get(key)?.stamps ?? [],
      now,
      burstWindowMs,
      this.cfg.burstLimit,
    );
    const dailyRes = advanceWindow(
      this.daily.get(key)?.stamps ?? [],
      now,
      dailyWindowMs,
      this.cfg.dailyLimit,
    );

    if (!burstRes.allowed) return { allowed: false, reason: "burst" };
    if (!dailyRes.allowed) return { allowed: false, reason: "daily" };

    // Only persist the windows when the hit is fully allowed, so a
    // burst-rejected call doesn't also burn daily budget.
    this.burst.set(key, { stamps: burstRes.stamps, windowMs: burstWindowMs, limit: this.cfg.burstLimit });
    this.daily.set(key, { stamps: dailyRes.stamps, windowMs: dailyWindowMs, limit: this.cfg.dailyLimit });
    return { allowed: true };
  }

  /** Drop windows whose entries have all aged out. Called opportunistically. */
  sweep(now = Date.now()): void {
    const burstWindowMs = this.cfg.burstWindowMs ?? 60_000;
    const dailyWindowMs = this.cfg.dailyWindowMs ?? 86_400_000;
    for (const [k, w] of this.burst) {
      if (w.stamps.every((t) => t <= now - burstWindowMs)) this.burst.delete(k);
    }
    for (const [k, w] of this.daily) {
      if (w.stamps.every((t) => t <= now - dailyWindowMs)) this.daily.delete(k);
    }
  }
}

/**
 * Per-process limiter instance. Keyed by userId + client IP so two
 * users on one instance (and one user from two devices) each get their
 * own budget.
 */
export const frameRateLimiter = new MemoryRateLimiter({
  burstLimit: Number(process.env.AI_FRAME_BURST_LIMIT ?? 20),
  dailyLimit: Number(process.env.AI_FRAME_DAILY_LIMIT ?? 300),
});

/** Build the limiter key from request headers + user id. */
export function frameRateKey(req: Request, userId: string): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = (fwd.split(",")[0] ?? "").trim() || "local";
  return `${ip}:${userId}`;
}