import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { getStoreSettings, getSystemSettings, saveStoreSettings, saveSalesSettings, saveInventorySettings } from "@/features/settings/service";

export async function GET() {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const [store, system] = await Promise.all([getStoreSettings(), getSystemSettings()]);
    return { store, system };
  });
}

export async function PUT(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("settings.manage")) {
      throw new AppError("FORBIDDEN", "You do not have permission to change settings");
    }

    const body = await request.json();
    const section = body.section as string | undefined;

    if (section === "store") {
      await saveStoreSettings(user.id, body);
    } else if (section === "sales") {
      await saveSalesSettings(user.id, body);
    } else if (section === "inventory") {
      await saveInventorySettings(user.id, body);
    } else {
      throw new AppError("VALIDATION_ERROR", "Invalid settings section");
    }

    return { saved: true };
  });
}
