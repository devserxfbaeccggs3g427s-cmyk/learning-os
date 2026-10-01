/**
 * Spaced repetition scheduler (SM-2 inspired, simplified).
 *
 * Inputs:
 *   - card: current SRS state
 *   - rating: AGAIN | HARD | GOOD | EASY
 *
 * Output:
 *   - updated SRS state + dueAt timestamp
 *
 * The scheduler is a pure function — same inputs always yield the same
 * outputs, and it does not touch the DB. Persistence happens in the route
 * that calls it.
 */
import { SRS_DEFAULTS, type ReviewRating } from "@/config/domain";

export interface SrsState {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
}

export interface SrsUpdate extends SrsState {
  dueAt: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clampEase(e: number): number {
  return Math.max(1.3, Math.min(3.0, e));
}

function addDaysIso(days: number): string {
  return new Date(Date.now() + Math.max(0, days) * MS_PER_DAY).toISOString();
}

export function scheduleCard(state: SrsState, rating: ReviewRating): SrsUpdate {
  let { intervalDays, repetitions, lapses } = state;
  let ease = clampEase(state.easeFactor);

  switch (rating) {
    case "AGAIN": {
      lapses += 1;
      repetitions = 0;
      intervalDays = SRS_DEFAULTS.lapseResetDays;
      ease = clampEase(ease - 0.2);
      break;
    }
    case "HARD": {
      repetitions += 1;
      intervalDays = Math.max(
        SRS_DEFAULTS.lapseResetDays,
        (intervalDays || SRS_DEFAULTS.initialIntervalDays) * SRS_DEFAULTS.hardMultiplier,
      );
      ease = clampEase(ease - 0.15);
      break;
    }
    case "GOOD": {
      repetitions += 1;
      if (repetitions === 1) intervalDays = SRS_DEFAULTS.secondIntervalDays;
      else if (repetitions === 2) intervalDays = SRS_DEFAULTS.graduatingIntervalDays;
      else intervalDays = (intervalDays || SRS_DEFAULTS.initialIntervalDays) * ease;
      break;
    }
    case "EASY": {
      repetitions += 1;
      ease = clampEase(ease + 0.1);
      if (repetitions === 1) intervalDays = SRS_DEFAULTS.easyIntervalDays;
      else intervalDays = (intervalDays || SRS_DEFAULTS.initialIntervalDays) * ease * SRS_DEFAULTS.easyBonus;
      break;
    }
  }
  intervalDays = Math.min(SRS_DEFAULTS.maxIntervalDays, intervalDays);
  return { intervalDays, easeFactor: ease, repetitions, lapses, dueAt: addDaysIso(intervalDays) };
}

export function initialCardState(): SrsState {
  return {
    intervalDays: 0,
    easeFactor: 2.5,
    repetitions: 0,
    lapses: 0,
  };
}