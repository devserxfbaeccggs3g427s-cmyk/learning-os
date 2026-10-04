/**
 * The frame LIST route — the sidebar the user picks a
 * conversation from.
 *
 * Two things must be true for that list to be usable, and both
 * were false at once:
 *
 *  1. Every row said "New chat". 26 identical rows cannot
 *     answer "which conversation was that one?" — see
 *     tests/frame-title.test.ts for the fix.
 *
 *  2. Every row said `messageCount: 0`, including frames
 *     with several turns. That was a scope bug, not a data
 *     bug: the count subquery interpolated the frame column
 *     as a bare, unqualified `"id"`, which Postgres resolved
 *     against the INNER scope (ai_chat_messages.id). The
 *     predicate compared a message id to itself and was never
 *     true, so the count was always 0.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const listRoute = readFileSync(
  join(process.cwd(), "app/api/ai/frames/route.ts"),
  "utf8",
);

/** The message-count subquery, exactly as written. */
function countSubquery(): string {
  return listRoute.match(/messageCount: sql<number>`([\s\S]*?)`/)?.[1] ?? "";
}

describe("the frame list is distinguishable", () => {
  it("counts messages against the outer frame id, not the inner message id", () => {
    // The one-line version of the bug: `${aiChatFrames.id}`
    // renders inside the subquery as `"id"` — no table
    // qualifier — so Postgres binds it to
    // ai_chat_messages.id, the only `id` in that scope.
    // `sql.raw("ai_chat_frames.id")` keeps the qualifier.
    const sub = countSubquery().replace(/\s+/g, " ");
    expect(sub).toMatch(/m\.frame_id = \$\{sql\.raw\("ai_chat_frames\.id"\)\}/);
    // Not the interpolated-column form, which is the bug.
    expect(sub).not.toMatch(/m\.frame_id = \$\{aiChatFrames\.id\}/);
  });

  it("still casts the count to int so it is a JSON number", () => {
    // Postgres COUNT(*) is bigint; postgres-js hands bigints
    // back as strings, and the dialog compares
    // `messageCount === 1`, which is false for "1".
    expect(countSubquery()).toMatch(/CAST\(COUNT\(\*\) AS int\)/);
  });

  it("scopes the list to the resolved user and non-archived frames", () => {
    const src = listRoute.replace(/\s+/g, " ");
    expect(src).toMatch(/eq\(aiChatFrames\.userId, user\.id\)/);
    expect(src).toMatch(/eq\(aiChatFrames\.archived, false\)/);
  });

  it("returns the frame's bound task so the dialog can label it", () => {
    // The sidebar shows the task a frame belongs to; without
    // the column it cannot, and every row reads as generic.
    const src = listRoute.replace(/\s+/g, " ");
    expect(src).toMatch(/taskId:\s*aiChatFrames\.taskId/);
  });
});

describe("the dialog renders the list with the task code", () => {
  const dialog = readFileSync(
    join(process.cwd(), "components/ai/FrameChatDialog.tsx"),
    "utf8",
  );

  it("history rows carry the knowledge mode and message count", () => {
    const src = dialog.replace(/\s+/g, " ");
    // A row that shows neither is indistinguishable from any
    // other row in the list.
    expect(src).toMatch(
      /KNOWLEDGE_MODE_LABELS\[f\.knowledgeMode/,
    );
    expect(src).toMatch(/f\.messageCount/);
  });

  it("renaming a frame updates the row in the already-loaded list", () => {
    // The list is fetched once per open. Without this sync a
    // rename only appears after reopening the dialog.
    const src = dialog.replace(/\s+/g, " ");
    expect(src).toMatch(/setList\(\(cur\) => cur\.map/);
  });
});