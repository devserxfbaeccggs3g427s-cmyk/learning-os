import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { AI_GENERATION, QUIZ_DIFFICULTIES, QUIZ_FOCUS, QUIZ_SOURCES, QUESTION_TYPES } from "@/config/domain";

export default function QuizSettingsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quiz generation defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {Object.entries(AI_GENERATION.quiz).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-1.5">
              <span className="text-xs font-mono text-muted-foreground">{k}</span>
              <span className="font-medium">{String(v)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Enum label="Difficulties" items={QUIZ_DIFFICULTIES} />
          <Enum label="Focus" items={QUIZ_FOCUS} />
          <Enum label="Sources" items={QUIZ_SOURCES} />
          <Enum label="Question types" items={QUESTION_TYPES} />
        </CardContent>
      </Card>
    </div>
  );
}

function Enum({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <div className="flex flex-wrap gap-1">
        {items.map((i) => (
          <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">{i}</span>
        ))}
      </div>
    </div>
  );
}