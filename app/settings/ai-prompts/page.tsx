import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";
import { listPromptNames, getPrompt } from "@/lib/ai/prompts";

export default function AIPromptsPage() {
  const names = listPromptNames();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Prompt registry</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            All system prompts live in <code>lib/ai/prompts/index.ts</code>. Bump the version when
            editing; old artifacts remain tagged with the version that produced them.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {names.map((n) => {
            const p = getPrompt(n);
            return (
              <div key={n} className="rounded-md border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{n}</div>
                  <Badge>v{p.version}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-primary">View system prompt</summary>
                  <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-2 text-[11px] leading-5">
                    {p.system}
                  </pre>
                </details>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}