/**
 * Frame titles.
 *
 * A frame is named after its first question. Before this existed,
 * every one of the 26 frames in the database was called "New chat" —
 * the history sidebar was 26 identical rows, so the list could not
 * answer the only question it exists to answer: which conversation
 * was that one?
 *
 * These pin the pure string rules. The route-level behaviour
 * ("name it once, never overwrite a manual rename") is asserted
 * structurally in tests/frame-isolation.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NEW_CHAT_TITLE,
  MAX_TITLE_CHARS,
  MAX_TITLE_CODE_CHARS,
  titleFromPrompt,
  stripTitlePrefix,
  taskTitlePrefix,
  isUnnamed,
} from "@/lib/ai/frame/title";

describe("a frame is named after its first question", () => {
  it("uses the prompt verbatim", () => {
    expect(titleFromPrompt("task này yêu cầu gì?")).toBe("task này yêu cầu gì?");
  });

  it("collapses a multi-line prompt onto one line", () => {
    // Titles are one-line list rows. A raw newline renders as a ragged
    // wrap with stray vertical space.
    const out = titleFromPrompt("so sánh normal flow\n\nvới   failure flow");
    expect(out).toBe("so sánh normal flow với failure flow");
    expect(out).not.toContain("\n");
  });

  it("trims leading and trailing whitespace", () => {
    expect(titleFromPrompt("   PAY-01 cần gì?   \n")).toBe("PAY-01 cần gì?");
  });

  it("clips at MAX_TITLE_CHARS without adding an ellipsis", () => {
    const out = titleFromPrompt("x".repeat(400));
    expect(out).toHaveLength(MAX_TITLE_CHARS);
    // The sidebar already does `line-clamp-1`; a "…" here would be a
    // second truncation mark on the same string.
    expect(out).not.toContain("…");
  });
});

describe("the task code prefixes the title", () => {
  it("prefixes with the code in brackets", () => {
    // The user's request, exactly: "tiêu đề nên prefix bằng
    // [ID task] (id ở này có nghĩa là PAY-001 hay OBS-001 chẳng hạn)"
    expect(titleFromPrompt("task này yêu cầu gì?", "PAY-01")).toBe(
      "[PAY-01] task này yêu cầu gì?",
    );
    expect(titleFromPrompt("cần làm gì?", "OBS-001")).toBe(
      "[OBS-001] cần làm gì?",
    );
  });

  it("does not prefix when there is no bound task", () => {
    for (const code of [undefined, null, "", "   "]) {
      expect(titleFromPrompt("task này yêu cầu gì?", code)).toBe(
        "task này yêu cầu gì?",
      );
    }
  });

  it("clips the question, not the whole title, so it still fits MAX_TITLE_CHARS", () => {
    // The prefix is INSIDE the budget: a title that exceeds
    // MAX_TITLE_CHARS would fail the DB column and the PATCH
    // schema, both of which cap at MAX_TITLE_CHARS.
    const out = titleFromPrompt("x".repeat(400), "PAY-01");
    expect(out).toHaveLength(MAX_TITLE_CHARS);
    expect(out.startsWith("[PAY-01] ")).toBe(true);
  });

  it("rejects an over-long code rather than eating the whole title", () => {
    // A "code" of 200 characters is a pasted title, not a code.
    const long = "x".repeat(MAX_TITLE_CODE_CHARS + 1);
    expect(taskTitlePrefix(long)).toBeNull();
    expect(titleFromPrompt("task này yêu cầu gì?", long)).toBe(
      "task này yêu cầu gì?",
    );
    // The boundary itself is a valid code.
    expect(taskTitlePrefix("x".repeat(MAX_TITLE_CODE_CHARS))).toBe(
      `[${"x".repeat(MAX_TITLE_CODE_CHARS)}] `,
    );
  });

  it("stripTitlePrefix returns the code and the bare question", () => {
    expect(stripTitlePrefix("[PAY-01] task này yêu cầu gì?")).toEqual({
      code: "PAY-01",
      title: "task này yêu cầu gì?",
    });
    expect(stripTitlePrefix("[OBS-001] cần làm gì?")).toEqual({
      code: "OBS-001",
      title: "cần làm gì?",
    });
    // A bracketed WORD is prose the user wrote, not a code —
    // stripping it would silently delete their text from the
    // title. Every project code carries a digit (PAY-01); this
    // does not, so it stays exactly as typed.
    expect(stripTitlePrefix("[todo] rewrite this")).toEqual({
      code: null,
      title: "[todo] rewrite this",
    });
    // No whitespace after the bracket is not a tag either.
    expect(stripTitlePrefix("[PAY-01]x")).toEqual({
      code: null,
      title: "[PAY-01]x",
    });
  });

  it("a rename cannot lose the tag: commit re-applies it", () => {
    // The rename editor strips the tag so the user edits only
    // the question; the commit re-attaches it. This is what
    // keeps a stored title in the same shape the server writes,
    // so a later turn still compares apples to apples.
    const stored = "[PAY-01] task này yêu cầu gì?";
    const { code, title } = stripTitlePrefix(stored);
    const next = (code ? `[${code}] ` : "") + title.toUpperCase();
    expect(next).toBe("[PAY-01] TASK NÀY YÊU CẦU GÌ?");
  });

  it("round-trips: strip then re-apply is identity", () => {
    // The two halves run in sequence on every rename. If they
    // disagree, the title drifts — a second rename would strip
    // something the first added.
    for (const stored of [
      "[PAY-01] task này yêu cầu gì?",
      "[FLOW-02] compare normal vs failure flow",
      "no task at all here",
      "[todo] rewrite this",
      "[1] single digit code",
    ]) {
      const { code, title } = stripTitlePrefix(stored);
      expect((code ? `[${code}] ` : "") + title).toBe(stored);
    }
  });
});

describe("a frame is named after its first question", () => {
  it("keeps Vietnamese diacritics intact", () => {
    // The whole app is Vietnamese; folding diacritics out of a title
    // would make every row read identically in the sidebar.
    expect(titleFromPrompt("Tái thiết ownership của GOV?")).toBe("Tái thiết ownership của GOV?");
    expect(titleFromPrompt("Tái thiết ownership của GOV?", "PAY-01")).toBe(
      "[PAY-01] Tái thiết ownership của GOV?",
    );
  });

  it("never produces an empty title", () => {
    // Blank input falls back to the placeholder rather than "", which
    // both the DB column and the PATCH schema forbid.
    for (const blank of ["", "   ", "\n\n", "\t"]) {
      expect(titleFromPrompt(blank)).toBe(NEW_CHAT_TITLE);
    }
  });
});

describe("isUnnamed", () => {
  it("is true only for the untouched placeholder", () => {
    expect(isUnnamed(NEW_CHAT_TITLE)).toBe(true);
    expect(isUnnamed(null)).toBe(true);
    expect(isUnnamed(undefined)).toBe(true);
    expect(isUnnamed("")).toBe(true);
    // A renamed frame must not look unnamed, or turn two would
    // silently overwrite the user's own title.
    expect(isUnnamed("PAY-01 cần gì?")).toBe(false);
  });
});

describe("the routes agree on the rules", () => {
  const ROOT = process.cwd();
  const chatRoute = readFileSync(join(ROOT, "app/api/ai/frames/chat/route.ts"), "utf8");
  const createRoute = readFileSync(join(ROOT, "app/api/ai/frames/route.ts"), "utf8");
  const patchRoute = readFileSync(join(ROOT, "app/api/ai/frames/[id]/route.ts"), "utf8");

  it("the chat route names a frame only while it is unnamed", () => {
    const src = chatRoute.replace(/\s+/g, " ");
    // The guard is the whole point: a renamed frame must survive.
    expect(src).toMatch(/if \(isUnnamed\(frame\.title\)\)/);
    expect(src).toMatch(
      /title:\s*titleFromPrompt\(parsed\.data\.prompt, boundCode\)/,
    );
    // The prefix must come from the frame's OWN bound task,
    // looked up by id — never from the request body (which
    // `.strict()` rejects a taskId in) and never from a task
    // the user merely mentioned in the question.
    expect(src).toMatch(/where\(eq\(tasks\.id, frame\.taskId\)\)/);
  });

  it("the create route starts every frame at the shared placeholder", () => {
    expect(createRoute.replace(/\s+/g, " ")).toMatch(
      /title:\s*parsed\.data\.title \?\? NEW_CHAT_TITLE/,
    );
  });

  it("no route hardcodes the placeholder as a string literal", () => {
    // The literal lives in title.ts once. A second copy in a route is
    // a drift bug: the chat route compares the stored title against
    // it, so a mismatch silently breaks "never overwrite a rename".
    // Comments are stripped — the prose MENTIONS the placeholder.
    const stripComments = (src: string) =>
      src
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .join("\n");
    for (const [name, src] of [
      ["chat", chatRoute],
      ["create", createRoute],
      ["patch", patchRoute],
    ] as const) {
      expect(stripComments(src), `${name} route hardcodes the placeholder`).not.toMatch(
        /"New chat"/,
      );
    }
  });

  it("every route bounds the title with the same constant", () => {
    // A title that validates at 120 on one path and is truncated to 60
    // on another is a bug that only shows up on long frames.
    expect(createRoute).toMatch(/max\(MAX_TITLE_CHARS\)/);
    expect(patchRoute).toMatch(/max\(MAX_TITLE_CHARS\)/);
    expect(createRoute).not.toMatch(/max\(120\)/);
    expect(patchRoute).not.toMatch(/max\(120\)/);
  });
});

describe("the dialog can rename a frame in place", () => {
  const dialog = readFileSync(
    join(process.cwd(), "components/ai/FrameChatDialog.tsx"),
    "utf8",
  );

  it("the header title is an editable control, not static text", () => {
    expect(dialog).toMatch(/onClick=\{beginRename\}/);
    expect(dialog).toMatch(/aria-label="Frame title"/);
    // Enter commits, Escape cancels — the two a rename must answer.
    expect(dialog).toMatch(/e\.key === "Enter"/);
    expect(dialog).toMatch(/e\.key === "Escape"/);
  });

  it("a rename patches the row and syncs the history list", () => {
    const src = dialog.replace(/\s+/g, " ");
    expect(src).toMatch(/method: "PATCH"/);
    // The sidebar is loaded once per open, so without this the new
    // title would not appear until the dialog is reopened.
    expect(src).toMatch(/setList\(\(cur\) => cur\.map\(\(f\) => \(f\.id === frameId/);
  });

  it("refuses to save an empty title", () => {
    // The PATCH schema rejects "" with a 400; failing locally keeps
    // the dialog from round-tripping a guaranteed error.
    expect(dialog).toMatch(/if \(!draft\) return/);
  });

  it("keeps the task code out of the rename input", () => {
    // The tag is derived from the bound task, which a rename cannot
    // change. Letting the user edit it would let a rename silently
    // re-label the frame as a different task than the one it is
    // bound to — a title that lies about the row.
    expect(dialog).toMatch(/setDraftTitle\(isUnnamedTitle \? "" : titleQuestion\)/);
    // …and the commit puts it back, so the stored title keeps the
    // same shape the server writes.
    expect(dialog).toMatch(/const next = prefix \? prefix \+ draft : draft/);
  });

  it("renders the code as its own label next to the title", () => {
    // A tag glued onto the title string is invisible as a tag;
    // the header splits it so the code is scannable.
    expect(dialog).toMatch(/const titleQuestion = isUnnamedTitle \? frameTitle : stripTitlePrefix\(frameTitle\)\.title/);
  });
});

describe("the dialog panel fits the viewport", () => {
  const dialog = readFileSync(
    join(process.cwd(), "components/ai/FrameChatDialog.tsx"),
    "utf8",
  );

  it("height tracks its margins instead of overflowing them", () => {
    // `h-full` + `sm:m-4` was 100dvh PLUS 1rem of margin: a gap at
    // the top and a composer clipped off the bottom. The height must
    // subtract the same margin it is inset by.
    expect(dialog).not.toMatch(/relative z-10 flex h-full/);
    expect(dialog).toMatch(/sm:h-\[calc\(100dvh-2rem\)\]/);
  });

  it("uses dvh so a mobile URL bar cannot hide the composer", () => {
    // `vh` excludes the browser chrome, so `100vh` + margins is the
    // overflow case even on a correct margin box.
    expect(dialog).toMatch(/h-\[100dvh\]/);
    expect(dialog).not.toMatch(/h-\[100vh\]/);
  });
});