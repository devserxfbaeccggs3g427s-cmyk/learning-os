/**
 * The global chat (`/api/ai/chat`) and the chat frames must follow the
 * SAME two rules, and for a long time only the frames did:
 *
 *  1. A conversation is named after its first question by the shared
 *     `titleFromPrompt` rule. `/api/ai/chat` used to open-code
 *     `prompt.slice(0, 60)`, which kept newlines, clipped to a private
 *     constant nothing else agreed with, and never tagged the task —
 *     even though the task id was sitting in the same request body.
 *
 *  2. A conversation whose only turn failed is not kept. Both chat
 *     routes mint their conversation row BEFORE calling the provider,
 *     so a failed first turn otherwise leaves a titled, single-error
 *     row: history the user never had.
 *
 * The client half matters as much as the server half — if the UI keeps
 * the dead id, every subsequent turn POSTs to a 404, and if it keeps
 * the orphaned question, that text is replayed into the NEXT
 * conversation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const chatRoute = readFileSync(join(ROOT, "app/api/ai/chat/route.ts"), "utf8");
const frameChatRoute = readFileSync(join(ROOT, "app/api/ai/frames/chat/route.ts"), "utf8");
const globalChat = readFileSync(join(ROOT, "components/ai/GlobalAIChat.tsx"), "utf8");
const aiTutor = readFileSync(join(ROOT, "components/tasks/AITutor.tsx"), "utf8");
const taskWorkspace = readFileSync(join(ROOT, "components/tasks/TaskWorkspace.tsx"), "utf8");

/** The three components that talk to `/api/ai/chat`. */
const CLIENTS: Array<[string, string]> = [
  ["GlobalAIChat", globalChat],
  ["AITutor", aiTutor],
  ["InterviewMode", taskWorkspace],
];

describe("both chat routes name a conversation the same way", () => {
  it("/api/ai/chat delegates to the shared rule instead of open-coding one", () => {
    expect(chatRoute).toMatch(/title:\s*titleFromPrompt\(parsed\.data\.prompt, taskCode\)/);
    // The old one-liner is the bug; it must be gone from every route.
    for (const src of [chatRoute, frameChatRoute]) {
      expect(src).not.toMatch(/title:\s*parsed\.data\.prompt\.slice/);
    }
  });

  it("the frame route's implicit-create path also defers to the shared rule", () => {
    // A caller that sends `frameId: null` gets a frame minted here,
    // and this path used to name it with `prompt.slice(0, 60)` —
    // which was worse than a duplicate rule: it stored a title that
    // was NOT the placeholder, so the one block that owns naming
    // (`if (isUnnamed(frame.title))`) never fired and the frame was
    // never named again. Start at the placeholder and let that block
    // do it.
    expect(frameChatRoute).toMatch(/title:\s*NEW_CHAT_TITLE/);
    expect(frameChatRoute).toMatch(/NEW_CHAT_TITLE\s*\}\s*from "@\/lib\/ai\/frame\/title"/);
  });

  it("/api/ai/chat looks the code up from the task id it was already given", () => {
    // No extra cost: `taskId` is on the body already, and the lookup
    // runs once per conversation, not per turn.
    const src = chatRoute.replace(/\s+/g, " ");
    expect(src).toMatch(/if \(parsed\.data\.taskId\) \{[\s\S]{0,200}?select\(\{ code: tasks\.code \}\)/);
    expect(src).toMatch(/where\(eq\(tasks\.id, parsed\.data\.taskId\)\)/);
  });

  it("the two routes agree on which task is in scope", () => {
    // Frames read the bound task off the FRAME ROW (their body is
    // `.strict()` and must not carry one). The global chat has no
    // frame row, so its body is the only source — but neither route
    // may invent a code from the prompt text.
    const frame = frameChatRoute.replace(/\s+/g, " ");
    expect(frame).toMatch(/where\(eq\(tasks\.id, frame\.taskId\)\)/);
    const chat = chatRoute.replace(/\s+/g, " ");
    expect(chat).not.toMatch(/tasks\.id, parsed\.prompt/);
  });
});

describe("the conversation list reports real message counts", () => {
  const listRoute = readFileSync(join(ROOT, "app/api/ai/conversations/route.ts"), "utf8");

  it("counts against the outer conversation id, not the inner message id", () => {
    // The identical bug the frame list had, still live here: the
    // interpolated column renders as the bare, unqualified `"id"`,
    // which Postgres binds to the INNER ai_messages.id. Every
    // conversation read "0 messages" no matter how many turns it had.
    const sub = listRoute.match(/messageCount: sql<number>`([\s\S]*?)`/)?.[1] ?? "";
    expect(sub).toMatch(/m\.conversation_id = \$\{sql\.raw\("ai_conversations\.id"\)\}/);
    expect(sub).not.toMatch(/m\.conversation_id = \$\{aiConversations\.id\}/);
  });

  it("casts to int so the count is a JSON number, not a string", () => {
    // COUNT(*) is bigint; postgres-js returns bigints as strings, and
    // the sidebar compares `messageCount === 1`, false for "1".
    const sub = listRoute.match(/messageCount: sql<number>`([\s\S]*?)`/)?.[1] ?? "";
    expect(sub).toMatch(/CAST\(COUNT\(\*\) AS int\)/);
  });
});

describe("both chat routes drop a conversation that never got an answer", () => {
  /** The catch block, flattened so assertions don't fight formatting. */
  function errorHandler(src: string): string {
    const flat = src.replace(/\s+/g, " ");
    const start = flat.indexOf("} catch (err) {");
    if (start < 0) throw new Error("route has no catch block");
    return flat.slice(start, flat.indexOf("} finally {", start));
  }

  it("/api/ai/chat deletes the conversation when the failed turn was its only one", () => {
    const handler = errorHandler(chatRoute);
    // `history` is this conversation's messages INCLUDING the user
    // message just inserted, so `<= 1` means "this was turn one".
    expect(handler).toMatch(/if \(history\.length <= 1\)/);
    expect(handler).toMatch(/db\.delete\(aiConversations\)/);
  });

  it("the delete happens after the error row is written, never instead of it", () => {
    // The client is streaming that error; dropping the table first
    // would cascade it away before the response is sent.
    for (const src of [chatRoute, frameChatRoute]) {
      const handler = errorHandler(src);
      const table = src.includes("aiConversations") ? "aiConversations" : "aiChatFrames";
      expect(handler.indexOf(`db.insert(aiMessages)`)).toBeLessThan(
        handler.indexOf(`db.delete(${table})`),
      );
    }
  });

  it("neither route deletes a conversation that already had an exchange", () => {
    // A mid-conversation failure keeps the row: losing turn 4 of 4 to
    // a provider blip is worse than a stale sidebar entry.
    for (const src of [chatRoute, frameChatRoute]) {
      expect(errorHandler(src).match(/db\.delete\(/g) ?? []).toHaveLength(1);
    }
  });
});

describe("every client recovers from a dropped conversation", () => {
  it("drops the dead id so the next turn mints a fresh one", () => {
    // Without this the chat is stuck: the id survives in component
    // state and every later message POSTs to a row that is now a 404.
    for (const [name, src] of CLIENTS) {
      const flat = src.replace(/\s+/g, " ");
      expect(flat, `${name} keeps a deleted conversation id`).toMatch(
        /if \(orphan\) \{\s*setConversationId\(null\)/,
      );
    }
  });

  it("takes the orphaned question back out of the transcript", () => {
    // Otherwise the text stays in the component and is replayed into
    // the NEXT conversation — the same cross-conversation leak the
    // frame isolation design exists to prevent.
    for (const [name, src] of CLIENTS) {
      expect(src, `${name} does not detect an orphan turn`).toMatch(
        /const orphan = !!stream\.error && !messages\.some\(\(m\) => m\.role === "assistant"\)/,
      );
      expect(src.replace(/\s+/g, " "), `${name} keeps the orphan question`).toMatch(
        /const copy = orphan \? cur\.slice\(0, -1\) : \[\.\.\.cur\]/,
      );
    }
  });

  it("keeps the error visible rather than swallowing the turn", () => {
    // The user still learns the request failed — only the stored
    // conversation is rolled back.
    for (const [name, src] of CLIENTS) {
      expect(src, `${name} hides the failure`).toMatch(
        /`⚠️ \$\{stream\.error\.message\} \(\$\{stream\.error\.kind\}\)`/,
      );
    }
  });
});