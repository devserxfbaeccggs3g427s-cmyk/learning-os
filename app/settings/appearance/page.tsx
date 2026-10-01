"use client";

export const dynamic = "force-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { setTheme } from "@/components/providers/ThemeProvider";
import { Sun, Moon, Monitor } from "lucide-react";

export default function AppearancePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose how the interface looks. Theme is applied via a class on the root html node.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <ThemeOption icon={<Sun className="h-5 w-5" />} label="Light" onClick={() => setTheme("light")} />
          <ThemeOption icon={<Moon className="h-5 w-5" />} label="Dark" onClick={() => setTheme("dark")} />
          <ThemeOption icon={<Monitor className="h-5 w-5" />} label="System" onClick={() => setTheme("system")} />
        </div>
      </CardContent>
    </Card>
  );
}

function ThemeOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-4 hover:bg-accent">
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}