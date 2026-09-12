"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { VoiceInput } from "@/components/voice-input";
import { cn } from "@/lib/utils";

/**
 * Debounced live search — navigates as the user types (no Enter needed).
 * Lives inside existing filter forms: it preserves every other URL param
 * (status/category/month/…), drops the page param on each change, and carries
 * "q" in the form via a hidden input so the Filter button / Enter still work.
 */
export function LiveQueryInput({ placeholder, className }: { placeholder?: string; className?: string }) {
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
    <div className={cn("relative", className)}>
      <VoiceInput
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="pe-14"
      />
      <input type="hidden" name="q" value={value} />
      {pending && (
        <Loader2 className="absolute end-8 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}