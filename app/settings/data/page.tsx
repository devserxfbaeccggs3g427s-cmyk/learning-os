import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import Link from "next/link";
import { Download, Upload, Database } from "lucide-react";
import { getDefaultUser } from "@/lib/ai/service";
import { ClearDataControls } from "@/components/settings/ClearDataControls";

export const dynamic = "force-dynamic";

export default async function DataSettingsPage() {
  const user = await getDefaultUser();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Your data lives in Supabase Postgres (<code>LEARNING_OS_POSTGRES_URL</code>). Back up regularly.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/api/admin/backup" download="learning-os-backup.json">
              <Download className="mr-1 h-4 w-4" /> Backup
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings/import">
              <Upload className="mr-1 h-4 w-4" /> Import
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings/seed">
              <Database className="mr-1 h-4 w-4" /> Seed sample
            </Link>
          </Button>
        </CardContent>
      </Card>

      <ClearDataControls userId={user.id} />
    </div>
  );
}

import { Button } from "@/components/ui";