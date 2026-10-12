"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Plain reload — safe in event handlers, avoids location-assign lint. */
export function ReloadButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
      <RotateCcw className="size-3.5" />
      إعادة التحميل
    </Button>
  );
}