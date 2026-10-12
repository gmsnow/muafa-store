"use client";

import { useEffect } from "react";
import { sanitizeMessage } from "@/components/ui/safe-section";

/**
 * Root-level boundary. errors that escape every route error.tsx (thrown in the
 * root layout or during flight stream setup) land here. Must render its own
 * <html>/<body>, resets the whole router, and shows the real error message.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "#09090b",
            color: "#fafafa",
          }}
        >
          <div
            dir="rtl"
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 12,
              padding: 24,
              textAlign: "center",
              background: "#18181b",
              border: "1px solid #27272a",
            }}
          >
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>عذرًا، حدث خطأ</p>
            <p style={{ marginTop: 8, fontSize: 14, color: "#a1a1aa" }}>
              تعذّر تحميل الصفحة. حاول مرة أخرى.
            </p>
            {error.message && (
              <p
                dir="ltr"
                style={{
                  marginTop: 12,
                  padding: 8,
                  borderRadius: 8,
                  background: "#27272a",
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: "#a1a1aa",
                  textAlign: "left",
                  wordBreak: "break-all",
                }}
              >
                {sanitizeMessage(error.message)}
              </p>
            )}
            {error.digest && (
              <p style={{ marginTop: 8, fontSize: 12, color: "#71717a" }}>digest: {error.digest}</p>
            )}
            <button
              onClick={reset}
              style={{
                marginTop: 20,
                padding: "8px 16px",
                borderRadius: 8,
                border: 0,
                background: "#16a34a",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}