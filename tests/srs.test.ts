import { describe, it, expect } from "vitest";
import { scheduleCard, initialCardState } from "@/lib/srs/scheduler";

describe("SRS scheduler", () => {
  it("starts a new card with no dueAt after first GOOD", () => {
    const s = initialCardState();
    const next = scheduleCard(s, "GOOD");
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBeGreaterThan(0);
    expect(next.dueAt).toBeTruthy();
  });

  it("resets after AGAIN", () => {
    const s = { intervalDays: 14, easeFactor: 2.5, repetitions: 5, lapses: 0 };
    const next = scheduleCard(s, "AGAIN");
    expect(next.repetitions).toBe(0);
    expect(next.lapses).toBe(1);
    expect(next.intervalDays).toBeLessThan(14);
    expect(next.easeFactor).toBeLessThan(2.5);
  });

  it("EASY extends interval", () => {
    const s = { intervalDays: 5, easeFactor: 2.5, repetitions: 3, lapses: 0 };
    const after = scheduleCard(s, "GOOD");
    const easy = scheduleCard(s, "EASY");
    expect(easy.intervalDays).toBeGreaterThan(after.intervalDays);
    expect(easy.easeFactor).toBeGreaterThan(s.easeFactor);
  });

  it("clamps ease factor", () => {
    const low = scheduleCard({ intervalDays: 1, easeFactor: 1.4, repetitions: 1, lapses: 0 }, "AGAIN");
    expect(low.easeFactor).toBeGreaterThanOrEqual(1.3);
    const high = scheduleCard({ intervalDays: 1, easeFactor: 3.0, repetitions: 1, lapses: 0 }, "EASY");
    expect(high.easeFactor).toBeLessThanOrEqual(3.0);
  });

  it("caps interval at max", () => {
    const s = { intervalDays: 1000, easeFactor: 2.5, repetitions: 10, lapses: 0 };
    const next = scheduleCard(s, "EASY");
    expect(next.intervalDays).toBeLessThanOrEqual(365);
  });
});