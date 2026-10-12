"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Segment-level boundary: a thrown server component inside (app) lands here
 * instead of Next's raw "server error occurred" page. Logs to the console on
 * the client; the user can retry or go back in one tap.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center">
        <p className="text-2xl font-bold">عذرًا، حدث خطأ</p>
        <p className="mt-2 text-sm text-muted-foreground">
          تعذّر تحميل الصفحة. حاول مرة أخرى أو عد للوحة التحكم.
        </p>
        {error.digest && <p className="mt-2 text-xs text-muted-foreground/60">digest: {error.digest}</p>}
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw className="size-4" />
            إعادة المحاولة
          </Button>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            لوحة التحكم
          </Button>
        </div>
      </div>
    </div>
  );
}