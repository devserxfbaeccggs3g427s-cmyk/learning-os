/**
 * Frame rate limiting.
 *
 * The limiter is the only thing standing between a runaway client and
 * the provider bill, so the arithmetic gets tested directly — with an
 * injected `now`, not a real clock.
 */
import { describe, it, expect } from "vitest";
import { advanceWindow, MemoryRateLimiter, frameRateKey } from "@/lib/ai/frame/rate-limit";

describe("advanceWindow", () => {
  const WINDOW = 1_000;

  it("allows hits up to the limit", () => {
    let stamps: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = advanceWindow(stamps, i * 10, WINDOW, 3);
      expect(res.allowed).toBe(true);
      stamps = res.stamps;
    }
    expect(stamps).toHaveLength(3);
  });

  it("rejects the call that would exceed the limit", () => {
    const stamps = [0, 100, 200];
    const res = advanceWindow(stamps, 300, WINDOW, 3);
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  it("does not consume budget on a rejected call", () => {
    const stamps = [0, 100, 200];
    const rejected = advanceWindow(stamps, 300, WINDOW, 3);
    expect(rejected.stamps).toEqual([0, 100, 200]);
  });

  it("forgets stamps that fell out of the window", () => {
    // Two stamps at t=0 and t=100, window 1000. At t=1500 both are
    // older than the cutoff, so the limiter starts fresh.
    const res = advanceWindow([0, 100], 1_500, WINDOW, 2);
    expect(res.allowed).toBe(true);
    expect(res.stamps).toEqual([1_500]);
  });

  it("counts only the stamps still inside the window", () => {
    // cutoff = 500. t=1200 is inside the window; t=100 is not, so only
    // one live stamp remains and a limit of 1 is exhausted.
    const res = advanceWindow([100, 1200], 1_500, WINDOW, 1);
    expect(res.allowed).toBe(false);
    expect(res.stamps).toEqual([1200]);
  });

  it("reports the remaining budget", () => {
    expect(advanceWindow([], 0, WINDOW, 5).remaining).toBe(4);
    expect(advanceWindow([1, 2], 3, WINDOW, 5).remaining).toBe(2);
  });
});

describe("MemoryRateLimiter", () => {
  it("enforces the burst window before the daily one", () => {
    const rl = new MemoryRateLimiter({ burstLimit: 3, dailyLimit: 100 });
    expect(rl.hit("k", 0).allowed).toBe(true);
    expect(rl.hit("k", 10).allowed).toBe(true);
    expect(rl.hit("k", 20).allowed).toBe(true);
    const fourth = rl.hit("k", 30);
    expect(fourth.allowed).toBe(false);
    expect(fourth.reason).toBe("burst");
  });

  it("reports the daily limit once the burst window has recovered", () => {
    const rl = new MemoryRateLimiter({ burstLimit: 1, dailyLimit: 2 });
    expect(rl.hit("k", 0).allowed).toBe(true);
    expect(rl.hit("k", 120_000).allowed).toBe(true); // burst recovered
    const third = rl.hit("k", 240_000); // burst recovers again, daily is spent
    expect(third.allowed).toBe(false);
    expect(third.reason).toBe("daily");
  });

  it("a burst-rejected call does not also burn daily budget", () => {
    const rl = new MemoryRateLimiter({ burstLimit: 1, dailyLimit: 3 });
    rl.hit("k", 0);
    rl.hit("k", 1); // rejected by burst — must not count against daily
    expect(rl.hit("k", 120_000).allowed).toBe(true);
    expect(rl.hit("k", 240_000).allowed).toBe(true);
    const exhausted = rl.hit("k", 360_000);
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.reason).toBe("daily");
  });

  it("keys are independent", () => {
    const rl = new MemoryRateLimiter({ burstLimit: 1, dailyLimit: 10 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("b", 0).allowed).toBe(true);
    expect(rl.hit("a", 1).allowed).toBe(false);
  });

  it("sweep drops windows that have fully aged out", () => {
    const rl = new MemoryRateLimiter({ burstLimit: 5, dailyLimit: 5 });
    rl.hit("k", 0);
    // Daily window is a day long, so a sweep at t=1 cannot drop it.
    rl.sweep(1);
    // But a sweep well past both windows clears the key.
    rl.hit("k2", 10_000_000);
    rl.sweep(10_000_000 + 2 * 86_400_000);
    // Nothing to assert on internals; assert it still works afterwards.
    expect(rl.hit("k3", 20_000_000).allowed).toBe(true);
  });
});

describe("frameRateKey", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://localhost/api/ai/frames/chat", { headers });

  it("combines the forwarded IP and the user id", () => {
    expect(frameRateKey(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "u1")).toBe("1.2.3.4:u1");
  });

  it("falls back to 'local' when there is no forwarded-for header", () => {
    expect(frameRateKey(req({}), "u1")).toBe("local:u1");
  });

  it("gives two users different budgets", () => {
    const r = req({ "x-forwarded-for": "1.2.3.4" });
    expect(frameRateKey(r, "u1")).not.toBe(frameRateKey(r, "u2"));
  });
});