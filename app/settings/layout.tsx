import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

const SECTIONS = [
  { href: "/settings", label: "General" },
  { href: "/settings/appearance", label: "Appearance" },
  { href: "/settings/ai", label: "AI provider" },
  { href: "/settings/ai-models", label: "AI models" },
  { href: "/settings/ai-prompts", label: "Prompt templates" },
  { href: "/settings/study", label: "Study" },
  { href: "/settings/flashcards", label: "Flashcards" },
  { href: "/settings/quiz", label: "Quiz" },
  { href: "/settings/import", label: "Import" },
  { href: "/settings/data", label: "Data" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[200px_1fr] lg:p-8">
        <nav className="space-y-1">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</h2>
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm hover:bg-accent",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <div>{children}</div>
      </div>
    </AppShell>
  );
}