"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VoiceInput } from "@/components/voice-input";

/**
 * Debounced live search — navigates as the user types (no Enter needed).
 * Replaces the URL so pagination/back behaviour stays sane.
 */
export function LiveSearch({ placeholder }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [pending, startTransition] = useTransition();
  const mounted = useRef(false);

  useEffect(() => {
    // Skip navigating on mount / external q changes (e.g. reset link).
    const current = searchParams.get("q") ?? "";
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (value === current) return;

    const t = setTimeout(() => {
      const params = new URLSearchParams();
      for (const [k, v] of searchParams.entries()) {
        if (k !== "q" && k !== "page") params.set(k, v);
      }
      const q = value.trim();
      if (q) params.set("q", q);
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:w-56">
      <VoiceInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pe-14"
      />
      {pending && (
        <Loader2 className="absolute end-8 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
