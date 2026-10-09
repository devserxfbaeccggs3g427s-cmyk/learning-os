import { STUDY_BLOCK_TYPES, type StudyBlockType } from "@/config/domain";
import type { ScheduledBlock, ScheduledDay } from "@/lib/db/queries/tasks";

export const DEFAULT_DAILY_BLOCK_TYPES: readonly StudyBlockType[] = ["LEARN", "DEEP_DIVE", "LAB", "FAILURE_DRILL"];

export type DailyTask = {
  id: string;
  code: string | null;
  title: string;
  blocks: ScheduledBlock[];
};

export type DailyDay = {
  date: string;
  tasks: DailyTask[];
};

/** URL param absent → defaults; present-but-empty → empty selection (no fallback). */
export function parseDailyBlockTypes(raw: string | string[] | undefined): StudyBlockType[] {
  if (raw === undefined) return [...DEFAULT_DAILY_BLOCK_TYPES];
  const tokens = (Array.isArray(raw) ? raw.join(",") : raw)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  return STUDY_BLOCK_TYPES.filter((type) => tokens.includes(type));
}

export function serializeDailyBlockTypes(types: readonly StudyBlockType[]): string {
  return STUDY_BLOCK_TYPES.filter((type) => types.includes(type)).join(",");
}

export function toggleDailyBlockType(
  types: readonly StudyBlockType[],
  type: StudyBlockType,
): StudyBlockType[] {
  return types.includes(type) ? types.filter((item) => item !== type) : [...types, type];
}

export function filterBlocksByType<T extends { type: string }>(blocks: T[], types: readonly StudyBlockType[]): T[] {
  const selected = new Set<string>(types);
  return blocks.filter((block) => selected.has(block.type));
}

export function groupDailyRoadmap(
  days: ScheduledDay[],
  types: readonly StudyBlockType[] = DEFAULT_DAILY_BLOCK_TYPES,
): DailyDay[] {
  const result: DailyDay[] = [];
  for (const day of days) {
    const tasks = new Map<string, DailyTask>();
    for (const block of day.blocks) {
      if (!block.taskId || !types.includes(block.type as StudyBlockType)) continue;
      let task = tasks.get(block.taskId);
      if (!task) {
        task = { id: block.taskId, code: block.taskCode, title: block.taskTitle ?? block.title, blocks: [] };
        tasks.set(block.taskId, task);
      }
      task.blocks.push(block);
    }
    if (tasks.size) result.push({ date: day.date, tasks: [...tasks.values()] });
  }
  return result;
}
