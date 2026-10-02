/**
 * Resolve `task://CODE` placeholders emitted by the AI into real markdown
 * links (`[CODE — Title](/tasks/{id})`). Unresolved codes (typos, deleted
 * tasks) are left as plain text so the user still sees the reference.
 *
 * Implementation: linear scan, skipping fenced code blocks (``` ... ```).
 * Cheap because chat messages are small (a few KB at most).
 */
import type { TaskLinks } from "./useTaskLinks";

const TASK_LINK_RE = /task:\/\/([A-Za-z0-9._-]+)/g;
const FENCE = "```";

export function resolveTaskLinks(md: string, links: TaskLinks): string {
  if (!md.includes("task://")) return md;
  const out: string[] = [];
  let i = 0;
  let inFence = false;
  while (i < md.length) {
    if (md.startsWith(FENCE, i)) {
      inFence = !inFence;
      out.push(FENCE);
      i += 3;
      continue;
    }
    const nextFence = md.indexOf(FENCE, i);
    const chunkEnd = nextFence === -1 ? md.length : nextFence;
    const chunk = md.slice(i, chunkEnd);
    out.push(inFence ? chunk : chunk.replace(TASK_LINK_RE, (_full, c: string) => {
      const entry = links[c];
      return entry ? `[${c} — ${entry.title}](/tasks/${entry.id})` : c;
    }));
    i = chunkEnd;
  }
  return out.join("");
}