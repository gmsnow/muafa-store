"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export const txnImageUrl = (txnId: string) =>
  `/api/customers/transactions/${txnId}/image`;

/** Click-to-enlarge thumbnail for a transaction note image. */
export function TxnImage({ txnId, label }: { txnId: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ms-2 inline-block shrink-0 overflow-hidden rounded border align-middle transition hover:opacity-80"
        aria-label={label}
        title={label}
      >
        {/* Plain <img> — this is an auth-gated proxy, not an optimizer pipeline. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={txnImageUrl(txnId)} alt="" loading="lazy" className="size-8 object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(92vw,640px)] sm:max-w-[640px]">
          <div className="flex max-h-[80vh] items-center justify-center overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={txnImageUrl(txnId)} alt={label} className="h-auto max-h-[75vh] w-auto max-w-full rounded" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}