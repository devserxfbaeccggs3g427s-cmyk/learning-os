/**
 * No-answer detection.
 *
 * When retrieval finds nothing above the grounding threshold, the model
 * is instructed to answer with a specific marker rather than inventing
 * content. This module reads the reply back and decides whether that
 * protocol was followed, so the UI can offer an escalation path
 * ("search my notes harder" / "answer from general knowledge") instead
 * of leaving the user with a confident, ungrounded paragraph.
 *
 * Pure string logic — no model, no DB.
 */

/** Markers the frame system prompt tells the model to emit. */
export const NO_ANSWER_MARKERS = [
  "NO ANSWER FOUND",
  "KHÔNG TÌM THẤY",
  "KHONG TIM THAY",
] as const;

/**
 * How far into the reply we look for a marker. The protocol says the
 * marker leads the reply; scanning the whole text would misfire on a
 * long answer that merely *mentions* the phrase in a quotation.
 */
const MARKER_WINDOW_CHARS = 120;

/** Strip markdown/emphasis and collapse whitespace for marker matching. */
function normalizeForMatch(text: string): string {
  return text
    .replace(/[*_`#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * True when the reply opened with a no-answer marker.
 *
 * The check is positional on purpose: the marker must appear within the
 * first {@link MARKER_WINDOW_CHARS} characters. A marker buried deep in
 * an otherwise complete answer does not count as "no answer".
 */
export function detectNoAnswer(reply: string): boolean {
  if (!reply) return false;
  const head = normalizeForMatch(reply.slice(0, MARKER_WINDOW_CHARS));
  return NO_ANSWER_MARKERS.some((marker) => head.includes(normalizeForMatch(marker)));
}

/**
 * Strip the marker from a reply so the UI can show the remainder as the
 * explanation ("I don't have anything on that in your notes.") rather
 * than the raw protocol token.
 */
export function stripNoAnswerMarker(reply: string): string {
  let out = reply.trim();
  for (const marker of NO_ANSWER_MARKERS) {
    const idx = out.toUpperCase().indexOf(marker);
    if (idx >= 0) {
      // Consume the marker plus one following separator character.
      out = (out.slice(0, idx) + out.slice(idx + marker.length))
        .replace(/^[\s:—–\-.]+/, "")
        .trim();
    }
  }
  return out;
}

/** Human-readable fallback shown when retrieval found nothing. */
export const NO_ANSWER_FALLBACK =
  "I couldn't find anything about that in the material you made available to this frame.";