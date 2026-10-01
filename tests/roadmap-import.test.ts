import { describe, it, expect } from "vitest";
import { RoadmapImportSchema } from "@/lib/ai/schemas";

describe("RoadmapImportSchema", () => {
  it("rejects missing required fields", () => {
    const r = RoadmapImportSchema.safeParse({ schemaVersion: 1 });
    expect(r.success).toBe(false);
  });

  it("accepts a minimal valid roadmap", () => {
    const r = RoadmapImportSchema.safeParse({
      schemaVersion: 1,
      title: "T",
      tracks: [
        {
          title: "Track 1",
          modules: [
            {
              title: "Module 1",
              tasks: [
                {
                  title: "Task 1",
                  priority: "P1",
                  difficulty: "BASIC",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tracks).toHaveLength(1);
      expect(r.data.tracks[0]!.modules[0]!.tasks[0]!.title).toBe("Task 1");
    }
  });

  it("applies defaults to optional arrays", () => {
    const r = RoadmapImportSchema.safeParse({
      schemaVersion: 1,
      title: "T",
      tracks: [],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.tracks).toEqual([]);
    }
  });

  it("rejects unknown priority", () => {
    const r = RoadmapImportSchema.safeParse({
      schemaVersion: 1,
      title: "T",
      tracks: [
        { title: "x", modules: [{ title: "y", tasks: [{ title: "t", priority: "P9" }] }] },
      ],
    });
    expect(r.success).toBe(false);
  });
});