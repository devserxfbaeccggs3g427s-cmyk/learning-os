import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { copyPlainText } from "@/lib/utils/clipboard";

const RAW_MARKDOWN = [
  "# Tiêu đề",
  "",
  "  - mục thụt vào  ",
  "\t- mục dùng tab",
  "",
  "> trích dẫn",
  "",
  "| Cột A | Cột B |",
  "| --- | --- |",
  "| `code` | [liên kết](https://example.com) |",
  "",
  "```ts",
  "const greeting = \"Xin chào 👋\";",
  "```",
  "",
].join("\n");

const messageBubble = readFileSync(
  join(process.cwd(), "components/ai/MessageBubble.tsx"),
  "utf8",
);

describe("raw Markdown clipboard copy", () => {
  it("passes every character to the clipboard writer unchanged", async () => {
    const writer = vi.fn().mockResolvedValue(undefined);

    await copyPlainText(RAW_MARKDOWN, writer);

    expect(writer).toHaveBeenCalledOnce();
    expect(writer).toHaveBeenCalledWith(RAW_MARKDOWN);
    expect(writer.mock.calls[0]![0]).toBe(RAW_MARKDOWN);
    expect(writer.mock.calls[0]![0].endsWith("\n")).toBe(true);
  });

  it("reports a clipboard failure instead of claiming success", async () => {
    const denied = new Error("Clipboard permission denied");
    const writer = vi.fn().mockRejectedValue(denied);

    await expect(copyPlainText(RAW_MARKDOWN, writer)).rejects.toBe(denied);
  });

  it("copies message content, never display-resolved Markdown", () => {
    expect(messageBubble).toMatch(/copyPlainText\(content\)/);
    expect(messageBubble).not.toMatch(/copyPlainText\(resolved\)/);
  });

  it("offers copy only for a completed assistant response", () => {
    expect(messageBubble).toMatch(/const isCompleteAssistant = role === "assistant"/);
    expect(messageBubble).toMatch(/isCompleteAssistant && content\.length > 0/);
  });
});
