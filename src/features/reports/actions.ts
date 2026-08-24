"use server";

import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import { isReportFamily, parseReportRange } from "./schema";
import { exportReportCsv } from "./service";

export async function exportReportAction(family: string, fromISO?: string, toISO?: string) {
  return guard(async () => {
    await requirePermission("reports.view");
    if (!isReportFamily(family)) throw new Error("Unknown report");
    const range = parseReportRange({ from: fromISO, to: toISO });
    const csv = await exportReportCsv(family, range);
    return ok({ csv });
  });
}
