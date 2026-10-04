/**
 * Empty frames are not history.
 *
 * The frame row is minted by the chat route the moment a prompt
 * arrives — before the provider is called. So every failed FIRST turn
 * used to leave behind a conversation the user never had: a frame
 * whose only row was a question nobody answered. Reopening it shows
 * one stranded message, and the sidebar fills with dead entries.
 *
 * The rule is narrow on purpose. An empty frame is deleted; a frame
 * that already held an exchange is kept, because losing turn 4 of a
 * 4-turn conversation to a provider blip is worse than a stale
 * sidebar row.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const chatRoute = readFileSync(join(ROOT, "app/api/ai/frames/chat/route.ts"), "utf8");
const dialog = readFileSync(join(ROOT, "components/ai/FrameChatDialog.tsx"), "utf8");

/** The catch block, flattened so the assertions don't fight formatting. */
function errorHandler(): string {
  const src = chatRoute.replace(/\s+/g, " ");
  const start = src.indexOf("} catch (err) {");
  if (start < 0) throw new Error("chat route has no catch block");
  return src.slice(start, src.indexOf("} finally {", start));
}

describe("a frame that never got an answer is not kept", () => {
  it("deletes the frame when the failed turn was its only one", () => {
    const handler = errorHandler();
    // `historyRows` is this frame's history INCLUDING the just-inserted
    // user message, so `<= 1` means "this turn was the first".
    expect(handler).toMatch(/if \(historyRows\.length <= 1\)/);
    expect(handler).toMatch(/db\.delete\(aiChatFrames\)\.where\(eq\(aiChatFrames\.id, frameId\)\)/);
  });

  it("still persists the error message the client is streaming", () => {
    // The turn is not hidden from the user — the row exists for the
    // rest of this request, then the frame (with its messages) is
    // removed as one unit.
    const handler = errorHandler();
    expect(handler).toMatch(/role: "ASSISTANT"/);
    expect(handler).toMatch(/content: `⚠️ \$\{message\} \(\$\{kind\}\)`/);
    // …and the delete comes AFTER the insert, not instead of it.
    expect(handler.indexOf("await db.insert(aiChatMessages)")).toBeLessThan(
      handler.indexOf("await db.delete(aiChatFrames)"),
    );
  });

  it("does not delete a frame that already had a conversation", () => {
    // Same handler, opposite branch: the guard is a length check, not
    // an unconditional delete. A mid-conversation failure keeps the
    // frame so the user can retry inside it.
    expect(errorHandler().match(/db\.delete\(aiChatFrames\)/g) ?? []).toHaveLength(1);
  });
});

describe("the dialog recovers from a dropped frame", () => {
  it("drops the frame id so the next turn mints a fresh one", () => {
    // Otherwise the next message POSTs to a row that is now a 404 and
    // the user is stuck on a dead conversation until they reopen.
    expect(dialog).toMatch(/if \(orphan\) \{\s*setFrameId\(null\)/);
    // …and resets the title, which was set from the question that no
    // longer exists anywhere.
    expect(dialog).toMatch(/setFrameTitle\(NEW_CHAT_TITLE\)/);
  });

  it("removes the orphaned question but keeps the error visible", () => {
    // The transcript must not carry a user message the server no
    // longer has — it would be replayed into the NEXT frame's
    // context, which is exactly the cross-frame leak the isolation
    // design exists to prevent. The error bubble stays.
    expect(dialog).toMatch(/const orphan = !!stream\.error && !messages\.some\(\(m\) => m\.role === "assistant"\)/);
    expect(dialog).toMatch(/const copy = orphan \? cur\.slice\(0, -1\) : \[\.\.\.cur\]/);
  });
});
