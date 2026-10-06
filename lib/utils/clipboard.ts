export type ClipboardWriter = (text: string) => Promise<void>;

function browserClipboardWriter(): ClipboardWriter | undefined {
  if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
    return undefined;
  }
  return (text) => navigator.clipboard.writeText(text);
}

function legacyCopy(text: string): boolean {
  // ponytail: Deprecated fallback covers older/non-secure browsers; remove when browser support guarantees Clipboard API.
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}

export async function copyPlainText(
  text: string,
  writer: ClipboardWriter | undefined = browserClipboardWriter(),
): Promise<void> {
  let clipboardError: unknown;

  if (writer) {
    try {
      await writer(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  if (legacyCopy(text)) return;

  if (clipboardError instanceof Error) throw clipboardError;
  throw new Error("Clipboard is unavailable");
}
