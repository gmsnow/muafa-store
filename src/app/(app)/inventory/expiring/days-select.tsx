"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DAY_OPTIONS = [7, 30, 60, 90] as const;

export function DaysSelect({ days, labelTemplate }: { days: number; labelTemplate: string }) {
  const router = useRouter();

  return (
    <Select value={String(days)} onValueChange={(v) => router.push(`/inventory/expiring?days=${v}`)}>
      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
      <SelectContent>
        {DAY_OPTIONS.map((d) => (
          <SelectItem key={d} value={String(d)}>{labelTemplate.replace("{days}", String(d))}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
