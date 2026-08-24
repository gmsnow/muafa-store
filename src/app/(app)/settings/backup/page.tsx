import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatDateTime } from "@/shared/core/format";
import { listBackups } from "@/features/backups/service";
import { CreateBackupButton, DeleteBackupButton, RestoreHint } from "@/features/backups/ui/backup-buttons";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function BackupSettingsPage() {
  const { t, locale } = await getT();
  const rows = await listBackups();
  const dbName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.replace(/^\//, "") : "grocery_db";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t.backupPage.title}</h1>
        <CreateBackupButton t={t} />
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{t.backupPage.backupHint}</p>

      <Card>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.backupPage.filename}</TableHead>
                <TableHead>{t.backupPage.size}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="hidden md:table-cell">{t.backupPage.createdBy}</TableHead>
                <TableHead>{t.common.date}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{r.filename}</TableCell>
                  <TableCell className="text-xs tabular-nums" dir="ltr">{formatSize(r.sizeBytes)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "COMPLETED" ? "default" : r.status === "FAILED" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{r.user?.username ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.createdAt, locale)}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === "COMPLETED" && (
                        <Button asChild variant="ghost" size="sm" className="h-7">
                          <a href={`/api/backups/${r.id}/download`}>{t.common.download}</a>
                        </Button>
                      )}
                      <DeleteBackupButton t={t} id={r.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3">
            <RestoreHint t={t} dbName={dbName} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
