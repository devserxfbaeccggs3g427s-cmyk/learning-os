"use client";
import { useState } from "react";
import { Card, CardContent, Button, Input, Label, Badge } from "@/components/ui";
import { Loader2, Check, AlertCircle, Eye, EyeOff } from "lucide-react";

interface AIConfigFormProps {
  userId: string;
  initial: {
    provider: string;
    label: string;
    model: string;
    baseUrl: string;
    temperature: number;
    maxTokens: number;
    streaming: boolean;
    hasKey: boolean;
  };
}

const PRESETS = [
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
];

export function AIConfigForm({ userId, initial }: AIConfigFormProps) {
  const [provider, setProvider] = useState(initial.provider);
  const [label, setLabel] = useState(initial.label || "default");
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [temperature, setTemperature] = useState(initial.temperature);
  const [maxTokens, setMaxTokens] = useState(initial.maxTokens);
  const [streaming, setStreaming] = useState(initial.streaming);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function loadModels() {
    setLoadingModels(true);
    setTestResult(null);
    const r = await fetch("/api/ai/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
      }),
    });
    setLoadingModels(false);
    if (r.ok) {
      const j = await r.json();
      setModels(j.models ?? []);
    } else {
      const err = await r.json().catch(() => ({ error: "Unknown error" }));
      setTestResult({ ok: false, message: err.error ?? "Failed to load models" });
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    const r = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, apiKey: apiKey || undefined, baseUrl: baseUrl || undefined }),
    });
    setTesting(false);
    if (r.ok) {
      const j = await r.json();
      setTestResult(j);
    } else {
      const err = await r.json().catch(() => ({ error: "Unknown error" }));
      setTestResult({ ok: false, message: err.error ?? "Test failed" });
    }
  }

  async function save() {
    setSaving(true);
    const r = await fetch("/api/ai/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId,
        provider,
        label,
        model,
        baseUrl: baseUrl || null,
        temperature,
        maxTokens,
        streaming,
        apiKey: apiKey || null,
      }),
    });
    setSaving(false);
    if (r.ok) {
      const j = await r.json();
      if (j.saved) setHasKey(true);
      setSavedAt(Date.now());
      setApiKey("");
    } else {
      const err = await r.json().catch(() => ({ error: "Unknown error" }));
      setTestResult({ ok: false, message: err.error ?? "Save failed" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="block mb-1">Provider</Label>
          <select
            value={provider}
            onChange={(e) => {
              const p = e.target.value;
              setProvider(p);
              const preset = PRESETS.find((x) => x.id === p);
              if (preset) setBaseUrl(preset.baseUrl);
            }}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="block mb-1">Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="default" />
        </div>
        <div className="sm:col-span-2">
          <Label className="block mb-1">Base URL</Label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label className="block mb-1">
            API key {hasKey && <Badge>key stored</Badge>}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? "••••••• (leave blank to keep existing)" : "sk-or-..."}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Encrypted at rest with AES-256-GCM. Never logged.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Label className="block mb-1">Model</Label>
          <div className="flex gap-2">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="openai/gpt-4o-mini" className="flex-1" />
            <Button variant="outline" onClick={loadModels} disabled={loadingModels}>
              {loadingModels ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load models"}
            </Button>
          </div>
          {models.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
                >
                  {m.id}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label className="block mb-1">Temperature ({temperature})</Label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div>
          <Label className="block mb-1">Max tokens</Label>
          <Input
            type="number"
            value={maxTokens}
            min={100}
            max={8000}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={streaming} onChange={(e) => setStreaming(e.target.checked)} />
          Streaming responses
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save configuration"}
        </Button>
        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test connection"}
        </Button>
        {savedAt && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3 w-3" /> Saved.
          </span>
        )}
        {testResult && (
          <span
            className={`inline-flex items-center gap-1 ${
              testResult.ok ? "text-emerald-600" : "text-red-600"
            } text-xs`}
          >
            {testResult.ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            {testResult.ok ? "Connection works." : testResult.message ?? "Failed."}
          </span>
        )}
      </div>
    </div>
  );
}