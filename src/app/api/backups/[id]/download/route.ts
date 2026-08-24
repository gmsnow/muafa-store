import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { Readable } from "stream";
import { AppError } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import { getBackupFilePath } from "@/features/backups/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/backups/[id]/download">) {
  let filePath: string;
  let filename: string;
  try {
    await requirePermission("backup.manage");
    const { id } = await ctx.params;
    ({ filePath, filename } = await getBackupFilePath(id));
  } catch (err) {
    if (err instanceof AppError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "UNAUTHORIZED" ? 401 : 403;
      return NextResponse.json({ ok: false, error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "Unexpected error" } },
      { status: 500 },
    );
  }
  const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/sql",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
