import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupDailyRoadmap,
  parseDailyBlockTypes,
  serializeDailyBlockTypes,
  toggleDailyBlockType,
} from "@/lib/roadmap/daily";
import type { ScheduledBlock, ScheduledDay } from "@/lib/db/queries/tasks";

function block(type: string, taskId: string | null, id: string): ScheduledBlock {
  return {
    id, date: "2026-10-07", type, title: id, objective: null, deliverable: null,
    startMinute: 540, durationMinutes: 60, status: "PLANNED", taskId,
    taskCode: taskId, taskTitle: taskId, taskStatus: "SCHEDULED", taskPriority: "P1",
  };
}

function days(): ScheduledDay[] {
  return [
    { date: "2026-10-07", objective: null, blocks: [
      block("LEARN", "task-a", "learn"), block("REVIEW", "task-a", "review"),
      block("LAB", "task-b", "lab"), block("DEEP_DIVE", "task-a", "deep"),
      block("RECALL", "task-c", "recall"), block("LEARN", null, "unlinked"),
    ] },
    { date: "2026-10-08", objective: null, blocks: [
      block("REVIEW", "task-a", "only-review"), block("REVIEW", null, "review-unlinked"),
    ] },
  ];
}

describe("daily roadmap", () => {
  it("opens read-only block detail and fetches notes through existing GET endpoint", () => {
    const dialog = readFileSync(join(process.cwd(), "components/roadmap/BlockDetailDialog.tsx"), "utf8");
    const view = readFileSync(join(process.cwd(), "components/roadmap/DailyView.tsx"), "utf8");

    expect(view).toContain("<BlockDetailDialog userId={userId} block={block} />");
    expect(dialog).toContain("dialogRef.current?.showModal()");
    expect(dialog).toContain("/api/notes/block/save?");
    expect(dialog).toContain("<MarkdownRenderer source={block.objective}");
    expect(dialog).toContain("<MarkdownRenderer source={note}");
    expect(dialog).toContain("href={`/tasks/${block.taskId}`}");
    expect(dialog).not.toMatch(/method:\s*["'](?:POST|PATCH|DELETE)["']/);
  });

  it("widens the dialog for Markdown and wires the type filter into grouping", () => {
    const dialog = readFileSync(join(process.cwd(), "components/roadmap/BlockDetailDialog.tsx"), "utf8");
    const view = readFileSync(join(process.cwd(), "components/roadmap/DailyView.tsx"), "utf8");
    const page = readFileSync(join(process.cwd(), "app/roadmap/page.tsx"), "utf8");

    expect(dialog).toContain("max-w-2xl sm:max-w-3xl");
    expect(dialog).toContain('className="mt-1 overflow-x-auto"');
    expect(view).toContain("<BlockTypeFilter selected={types} />");
    expect(view).toContain("groupDailyRoadmap(await listScheduledBlocks({ userId, from, to }), types)");
    expect(page).toContain("parseDailyBlockTypes(params.types)");
    expect(page).toContain("types={types}");
  });

  it("opens an AI frame from the block detail dialog without writing from that file", () => {
    const dialog = readFileSync(join(process.cwd(), "components/roadmap/BlockDetailDialog.tsx"), "utf8");
    const schema = readFileSync(join(process.cwd(), "lib/db/schema/aiFrames.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "app/api/ai/frames/route.ts"), "utf8");

    // Button chỉ bật state; việc tạo frame nằm hết trong FrameChatDialog.
    expect(dialog).toContain("<FrameChatDialog");
    expect(dialog).toContain('entryPoint="BLOCK_DETAIL"');
    expect(dialog).toContain("<Sparkles");
    expect(dialog).toContain("Ask AI");
    expect(dialog).toContain("onCancel");
    expect(dialog).not.toMatch(/method:\s*["'](?:POST|PATCH|DELETE)["']/);

    expect(schema).toContain('"BLOCK_DETAIL"');
    expect(route).toContain('"BLOCK_DETAIL"');
  });

  it("groups main blocks by day and task, omitting review-only tasks, unlinked blocks and empty days", () => {
    expect(groupDailyRoadmap(days()).map((day) => ({
      date: day.date,
      tasks: day.tasks.map((task) => [task.id, task.blocks.map((item) => item.id)]),
    }))).toEqual([{ date: "2026-10-07", tasks: [
      ["task-a", ["learn", "deep"]], ["task-b", ["lab"]],
    ] }]);
  });

  it("filters by the selected types, still hiding unlinked blocks and empty days", () => {
    expect(groupDailyRoadmap(days(), ["REVIEW"]).map((day) => ({
      date: day.date,
      tasks: day.tasks.map((task) => [task.id, task.blocks.map((item) => item.id)]),
    }))).toEqual([
      { date: "2026-10-07", tasks: [["task-a", ["review"]]] },
      { date: "2026-10-08", tasks: [["task-a", ["only-review"]]] },
    ]);

    expect(groupDailyRoadmap(days(), ["RECALL"])).toEqual([
      { date: "2026-10-07", tasks: [{ id: "task-c", code: "task-c", title: "task-c", blocks: [block("RECALL", "task-c", "recall")] }] },
    ]);

    expect(groupDailyRoadmap(days(), [])).toEqual([]);
  });
});

describe("block type filter", () => {
  it("treats a missing URL param as the default main types and an empty one as no selection", () => {
    expect(parseDailyBlockTypes(undefined)).toEqual(["LEARN", "DEEP_DIVE", "LAB"]);
    expect(parseDailyBlockTypes("")).toEqual([]);
    expect(parseDailyBlockTypes([])).toEqual([]);
    expect(parseDailyBlockTypes("REVIEW,LEARN,BOGUS,LEARN")).toEqual(["LEARN", "REVIEW"]);
    expect(parseDailyBlockTypes(["", "LEARN", "REVIEW"])).toEqual(["LEARN", "REVIEW"]);
    expect(parseDailyBlockTypes(",")).toEqual([]);
  });

  it("serializes in STUDY_BLOCK_TYPES order and toggles membership", () => {
    expect(serializeDailyBlockTypes([])).toBe("");
    expect(serializeDailyBlockTypes(["REVIEW", "LEARN"])).toBe("LEARN,REVIEW");
    expect(toggleDailyBlockType(["LEARN"], "LEARN")).toEqual([]);
    expect(toggleDailyBlockType(["LEARN"], "LAB")).toEqual(["LEARN", "LAB"]);
    expect(parseDailyBlockTypes(serializeDailyBlockTypes(["REVIEW", "LAB", "LEARN"])))
      .toEqual(["LEARN", "LAB", "REVIEW"]);
  });
});
