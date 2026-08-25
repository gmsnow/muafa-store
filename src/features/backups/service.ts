import "server-only";
import { spawn } from "child_process";
import { mkdir, stat, unlink } from "fs/promises";
import path from "path";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import type { AuthUser } from "@/features/auth/session";

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

function resolvePgDump(): string {
  if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;
  if (process.platform === "win32") {
    return "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe";
  }
  return "pg_dump";
}

interface ConnInfo {
  host: string; port: string; user: string; password: string; database: string;
}

function parseDatabaseUrl(url: string): ConnInfo {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

/** Runs pg_dump server-side; credentials never leave the server process. */
export async function createBackup(actor: AuthUser, note?: string) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new AppError("INTERNAL_ERROR", "DATABASE_URL is not configured");

  await db.backupRecord.create({
    data: {
      filename: "(in progress)",
      status: "IN_PROGRESS",
      note: note ?? null,
      createdBy: actor.id,
    },
  });
  // keep only one IN_PROGRESS marker at a time — reuse the latest
  const marker = await db.backupRecord.findFirst({
    where: { status: "IN_PROGRESS", createdBy: actor.id },
    orderBy: { createdAt: "desc" },
  });

  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `grocery-backup-${stamp}.sql`;
    const filePath = path.join(BACKUP_DIR, filename);

    const conn = parseDatabaseUrl(dbUrl);
    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn(
        resolvePgDump(), /*turbopackIgnore: true*/
        ["--host", conn.host, "--port", conn.port, "--username", conn.user,
         "--no-owner", "--no-privileges", "--format=plain", "--file", filePath, conn.database],
        { env: { ...process.env, PGPASSWORD: conn.password }, windowsHide: true },
      );
      child.on("close", (code) => resolve(code ?? 1));
      child.on("error", () => resolve(1));
    });
    if (exitCode !== 0) throw new AppError("INTERNAL_ERROR", "pg_dump failed — see server logs");

    const info = await stat(filePath);
    if (marker) {
      return db.backupRecord.update({
        where: { id: marker.id },
        data: { filename, sizeBytes: BigInt(info.size), status: "COMPLETED" },
      });
    }
    throw new AppError("INTERNAL_ERROR", "Backup marker lost");
  } catch (err) {
    if (marker) {
      await db.backupRecord.update({ where: { id: marker.id }, data: { status: "FAILED" } }).catch(() => {});
    }
    throw err;
  }
}

export async function listBackups() {
  const rows = await db.backupRecord.findMany({
    include: { user: { select: { username: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ ...r, sizeBytes: r.sizeBytes === null ? null : Number(r.sizeBytes) }));
}

export async function getBackupFilePath(id: string): Promise<{ filePath: string; filename: string }> {
  const rec = await db.backupRecord.findUnique({ where: { id } });
  if (!rec || rec.status !== "COMPLETED") throw new AppError("NOT_FOUND", "Backup not found");
  const safe = path.basename(rec.filename);
  const filePath = path.join(/*turbopackIgnore: true*/ BACKUP_DIR, safe);
  await stat(/*turbopackIgnore: true*/ filePath).catch(() => {
    throw new AppError("NOT_FOUND", "Backup file missing on disk");
  });
  return { filePath, filename: safe };
}

export async function deleteBackup(id: string) {
  const rec = await db.backupRecord.findUnique({ where: { id } });
  if (!rec) throw new AppError("NOT_FOUND", "Backup not found");
  if (rec.status === "COMPLETED" && rec.filename && rec.filename !== "(in progress)") {
    await unlink(path.join(/*turbopackIgnore: true*/ BACKUP_DIR, path.basename(rec.filename))).catch(() => {});
  }
  await db.backupRecord.delete({ where: { id } });
}
