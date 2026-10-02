"use client";
import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { Loader2, Save } from "lucide-react";

interface LanguagePreset {
  value: string;
  label: string;
}

const PRESETS: LanguagePreset[] = [
  { value: "Vietnamese", label: "Tiếng Việt" },
  { value: "English", label: "English" },
  { value: "Japanese", label: "日本語" },
  { value: "Chinese", label: "中文" },
  { value: "Korean", label: "한국어" },
  { value: "French", label: "Français" },
];

interface LanguagePickerProps {
  initial: string;
  envDefault: string | null;
  hardcoded: string;
}

export function LanguagePicker({ initial, envDefault, hardcoded }: LanguagePickerProps) {
  const [language, setLanguage] = useState(initial);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = language.trim() !== initial;

  async function save() {
    const value = language.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/settings/language", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: value }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { language: string };
      setLanguage(j.language);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setLanguage(p.value)}
            className={
              "rounded-md border px-3 py-1.5 text-xs transition-colors " +
              (language.trim() === p.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-accent")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="Custom language (e.g. Vietnamese)"
          maxLength={40}
          className="max-w-xs"
        />
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          AI will reply in this language by default — even if you ask in another language. It
          will only switch if you explicitly request a different language in your message
          (e.g. <em>“trả lời bằng tiếng Anh”</em>, <em>“answer in English”</em>).
        </p>
        <p>
          Resolution order: <span className="font-mono">user setting → env AI_DEFAULT_LANGUAGE → {hardcoded}</span>.
          {envDefault && (
            <>
              {" "}Currently env override = <code>{envDefault}</code>.
            </>
          )}
        </p>
        {savedAt && <p className="text-primary">Saved.</p>}
        {error && <p className="text-destructive">{error}</p>}
      </div>
    </div>
  );
}