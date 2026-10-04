/**
 * Frame titles.
 *
 * A frame is named after its FIRST QUESTION, prefixed with the code
 * of the task it is bound to: `[PAY-01] task này yêu cầu gì?`.
 *
 * The question, not the task, is the name — it is the only thing in
 * the frame that is unambiguously about what the user wanted, and it
 * is already written in their own words. The code is a prefix because
 * a bare question is ambiguous in the history sidebar: three frames
 * called "task này yêu cầu gì?" cannot be told apart without opening
 * all three.
 *
 * This lives in its own module because several callers must agree
 * exactly: the chat route persists it, the create and patch routes
 * bound it, the dialog displays it optimistically and strips it back
 * off for the rename editor, and the tests pin the edge cases. Two
 * copies of the trim-and-clip rule would drift, and a drifted title
 * is invisible until someone opens two frames side by side.
 *
 * Pure string functions — no DB, no request context, so this is
 * testable directly (see tests/frame-title.test.ts).
 */

/**
 * The placeholder every frame carries until it has a first
 * question. The chat route compares against this to decide whether
 * a frame is still unnamed — a frame the user renamed via PATCH must
 * never be overwritten by turn two, and "still exactly the
 * placeholder" is the only way to tell those apart.
 */
export const NEW_CHAT_TITLE = "New chat";

/**
 * Longest stored title. Matches the DB column, the create route's
 * `CreateBody.title`, and the PATCH route's `PatchBody.title` — all
 * three must agree or a title that validates on one path is
 * truncated on another.
 */
export const MAX_TITLE_CHARS = 120;

/**
 * Longest task code that can be a prefix. Real codes are `PAY-01`,
 * `OBS-001` — under 12 characters. The cap is a sanity bound: a
 * "code" of 200 characters is a title the user pasted in, and
 * bracketing it would eat the whole title.
 */
export const MAX_TITLE_CODE_CHARS = 24;

/**
 * Render a task code as the title prefix, e.g. `[PAY-01] …`.
 *
 * The code is bracketed so it reads as a tag rather than as the start
 * of the question: "task này yêu cầu gì?" on its own is ambiguous in a
 * sidebar full of rows, and `[PAY-01] task này yêu cầu gì?` says which
 * task "task này" referred to without the user having to open the
 * frame.
 *
 * Returns null for anything that cannot be a code — an empty string,
 * a nullish value, or one long enough that the prefix would eat the
 * whole budget. A missing code must not crash a turn; the title just
 * falls back to the bare question.
 */
export function taskTitlePrefix(code: string | null | undefined): string | null {
  const clean = code?.trim();
  if (!clean) return null;
  // Length guard, not just MAX_TITLE_CHARS: the clipped question
  // itself still needs room, and `[x] ` on its own is noise.
  if (clean.length > MAX_TITLE_CODE_CHARS) return null;
  return `[${clean}] `;
}

/**
 * Derive a frame title from its first question, prefixed with the
 * bound task's code when the frame has one.
 *
 * Newlines and runs of whitespace collapse to single spaces: a frame
 * title is a one-line list-row label, and a raw multi-line prompt
 * renders as a ragged wrapped line with stray spacing. Trailing
 * whitespace goes too, so a prompt that was all whitespace cannot
 * produce a title of "".
 *
 * The prefix is inside the clip, so a long first question is truncated
 * to MAX_TITLE_CHARS *including* `[PAY-01] ` — otherwise a prefixed
 * title could exceed the DB column and the PATCH schema, which both
 * cap at MAX_TITLE_CHARS.
 *
 * A blank prompt returns the placeholder unchanged, so an unnamed
 * frame can never be renamed to "" (which the DB and the PATCH schema
 * both forbid anyway).
 */
export function titleFromPrompt(prompt: string, taskCode?: string | null): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  if (!oneLine) return NEW_CHAT_TITLE;
  const prefix = taskTitlePrefix(taskCode) ?? "";
  const budget = MAX_TITLE_CHARS - prefix.length;
  if (budget <= 0) return prefix.trimEnd();
  return prefix + (oneLine.length > budget ? oneLine.slice(0, budget) : oneLine);
}

/**
 * Strip a leading `[CODE] ` tag back off a title.
 *
 * Returns the code separately instead of dropping it, because the
 * caller needs to decide what to do with it: a rename that strips
 * "PAY-01" off the PAY-01 frame has silently unlabelled the frame the
 * user was working on, so the dialog re-applies the code it already
 * knows rather than treating the tag as user-authored prose.
 *
 * Only a bracketed tag followed by whitespace counts. A title that
 * merely STARTS with brackets ("[todo] rewrite this") is left alone —
 * guessing is worse than not stripping.
 */
export function stripTitlePrefix(title: string): { code: string | null; title: string } {
  // A tag is a bracketed CODE followed by whitespace. A code
  // contains a digit (PAY-01, OBS-001, FLOW-02) — the project's
  // codes are all `LETTERS-DIGITS`. That one character is the
  // difference between a tag and a bracketed word the user
  // wrote ("[todo] rewrite this" is prose, not a code), so
  // prose keeps its brackets instead of being silently
  // relabelled as a task.
  // Length cap as a regex range — MAX_TITLE_CODE_CHARS is a
  // compile-time constant, so the bound is inlined here.
  const m = new RegExp(
    `^(\\[[A-Z0-9-]*\\d[A-Z0-9-]{0,${MAX_TITLE_CODE_CHARS - 1}}\\])[ \\t]+`,
  ).exec(title);
  if (!m) return { code: null, title };
  return { code: m[1]!.slice(1, -1), title: title.slice(m[0].length) };
}

/**
 * True when `title` is still the untouched placeholder — i.e. the
 * frame has never been named by a question or by the user.
 *
 * Exported so the "don't overwrite a rename" check in the chat
 * route and its test assert the same predicate rather than each
 * open-coding `title === "New chat"`.
 */
export function isUnnamed(title: string | null | undefined): boolean {
  return !title || title === NEW_CHAT_TITLE;
}