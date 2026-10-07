import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const route = source("app/api/ai/conversations/[id]/route.ts");
const hook = source("lib/ai/useConversationList.ts");
const frame = source("components/ai/FrameChatDialog.tsx");
const clients = [
  source("components/ai/GlobalAIChat.tsx"),
  source("components/tasks/AITutor.tsx"),
  source("components/tasks/TaskWorkspace.tsx"),
];

describe("delete a chat from history", () => {
  it("deletes only the current user's conversation and cascades its messages", () => {
    const handler = route.slice(route.indexOf("export async function DELETE"));
    expect(handler).toContain("await getDefaultUser()");
    expect(handler).toContain("eq(aiConversations.userId, user.id)");
    expect(handler).toMatch(/db\s*\.delete\(aiConversations\)/);
    expect(handler).toContain("status: 404");
    expect(source("lib/db/schema/ai.ts")).toContain('references(() => aiConversations.id, { onDelete: "cascade" })');
  });

  it("keeps a failed deletion in history and clears a deleted active chat", () => {
    expect(hook).toContain('method: "DELETE"');
    expect(hook.indexOf("if (!r.ok)")).toBeLessThan(hook.indexOf("removedIds.current.add(id)"));
    for (const client of clients) {
      expect(client).toContain("window.confirm(");
      expect(client).toContain("deleteError &&");
      expect(client).toContain("await remove(id) && conversationId === id");
      expect(client).toContain("startNewChat();");
    }
  });

  it("deletes any frame in history without resetting a different open frame", () => {
    expect(frame).toContain("deleteFrame(f.id)");
    expect(frame).toContain("window.confirm(");
    expect(frame).toContain("if (frameId === id) newFrame()");
    expect(frame.indexOf("if (!r.ok)", frame.indexOf("async function deleteFrame")))
      .toBeLessThan(frame.indexOf("setList((cur) => cur.filter((f) => f.id !== id))"));
  });
});
