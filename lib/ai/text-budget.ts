/**
 * Shared text-budget helper.
 *
 * Moved here (out of `lib/ai/context.ts`) into a leaf module so
 * the AI chat frame feature can clamp retrieved text without
 * importing `context.ts`, which pulls the task/roadmap/schedule
 * query builders. The frame feature's isolation invariant — see
 * `tests/frame-isolation.test.ts` — forbids exactly that import,
 * so the frame module needs its own dependency-free clamp.
 *
 * `context.ts` re-exports this for its existing callers, so no
 * call site changes.
 */
export function clamp(s: string, max: number): string {
  if (!max || s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[... truncated at ${max} characters ...]`;
}

/**
 * Trim a conversation history to at most `max` messages while always
 * keeping the first user message. The first turn usually states the
 * frame's subject; dropping it turns a long frame into an amnesiac one
 * even though the user never closed it.
 *
 * The anchor is spliced in front of the tail and then the tail is
 * re-trimmed to `max - 1`, so the result never exceeds `max` — the
 * budget is a ceiling, not a suggestion.
 *
 * Pure: the caller persists whatever it wants.
 */
export function trimHistoryWindow<T extends { role: string }>(
  messages: T[],
  max: number,
): T[] {
  if (max <= 0) return [];
  if (messages.length <= max) return messages.slice();
  const firstUserIdx = messages.findIndex((m) => m.role.toLowerCase() === "user");
  // No anchor to preserve (assistant-only history): a plain tail.
  if (firstUserIdx < 0) return messages.slice(messages.length - max);
  const anchor = messages[firstUserIdx]!;
  // Anchor already inside the tail — nothing to splice.
  if (firstUserIdx >= messages.length - max) return messages.slice(messages.length - max);
  return [anchor, ...messages.slice(messages.length - (max - 1))];
}
