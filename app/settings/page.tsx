import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export const dynamic = "force-dynamic";
import Link from "next/link";

export default function GeneralSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>General</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-6">
        <p>
          Learning OS runs locally on your machine by default. Data is stored in a single SQLite file
          (<code>data/learning-os.db</code>). All processing is local; AI requests are forwarded to your
          configured provider.
        </p>
        <p>
          Configure your AI provider in <Link className="text-primary underline" href="/settings/ai">Settings → AI provider</Link>.
          Import data from <Link className="text-primary underline" href="/settings/import">Settings → Import</Link>.
        </p>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>Light / dark / system theme.</li>
          <li>Keyboard shortcut: <kbd>⌘</kbd>+<kbd>K</kbd> opens search (coming).</li>
          <li>Markdown notes auto-save and keep revisions.</li>
          <li>AI never overwrites notes, decks, or quizzes silently.</li>
        </ul>
      </CardContent>
    </Card>
  );
}