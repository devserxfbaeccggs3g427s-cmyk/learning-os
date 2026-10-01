import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ImportForm } from "@/components/settings/ImportForm";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import roadmap (JSON)</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste a JSON document matching the Roadmap schema. We preview the counts so you can
            confirm before importing.
          </p>
        </CardHeader>
        <CardContent>
          <ImportForm kind="roadmap" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import daily schedule (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportForm kind="schedule" />
        </CardContent>
      </Card>
    </div>
  );
}