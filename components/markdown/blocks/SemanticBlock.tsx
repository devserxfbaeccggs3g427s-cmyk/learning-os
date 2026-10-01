/**
 * Common shell used by all semantic-block renderers. Centralizing here keeps
 * each block focused on its visual identity (icon, color) instead of layout.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface SemanticBlockProps {
  title?: string;
  body: string;
  icon?: ReactNode;
  tone?: "info" | "warning" | "success" | "danger" | "neutral" | "accent";
}

const TONE_CLASSES: Record<NonNullable<SemanticBlockProps["tone"]>, string> = {
  info: "border-blue-500/40 bg-blue-500/5",
  success: "border-emerald-500/40 bg-emerald-500/5",
  warning: "border-amber-500/40 bg-amber-500/5",
  danger: "border-red-500/40 bg-red-500/5",
  accent: "border-violet-500/40 bg-violet-500/5",
  neutral: "border-border bg-muted/30",
};

export function SemanticBlock({ title, body, icon, tone = "neutral", className }: SemanticBlockProps & { className?: string }) {
  return (
    <aside
      className={cn(
        "my-4 rounded-lg border-l-4 px-4 py-3",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {(title || icon) && (
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide opacity-90">
          {icon}
          {title}
        </div>
      )}
      <div className="markdown-body whitespace-pre-wrap text-sm leading-relaxed">{body}</div>
    </aside>
  );
}