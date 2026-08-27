"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prepareImage, formatBytes, type PreparedImage, ImageError } from "@/shared/client/image";

/**
 * Note-image attachment area used by the record-payment and edit dialogs.
 * - No existing image  → pick + preview + remove.
 * - Existing image     → keep (default) / replace / delete.
 */
export function TxnImageField({
  tCommon,
  tCustomers,
  existingUrl,
  onNewImage,
  onDeleteExisting,
}: {
  tCommon: Record<string, string>;
  tCustomers: Record<string, string>;
  existingUrl?: string | null;
  onNewImage: (image: PreparedImage | null) => void;
  onDeleteExisting: (deleteImage: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PreparedImage | null>(null);
  const [action, setAction] = useState<"keep" | "replace" | "delete">(existingUrl ? "keep" : "replace");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const img = await prepareImage(file);
      setPending(img);
      setAction("replace");
      onNewImage(img);
      onDeleteExisting(false);
    } catch (err) {
      const code = err instanceof ImageError ? err.code : "INVALID_IMAGE_TYPE";
      toast.error(code === "IMAGE_TOO_LARGE" ? tCustomers.imageTooLarge : tCustomers.invalidImageType);
    }
  }

  function reset() {
    setPending(null);
    if (inputRef.current) inputRef.current.value = "";
    setAction(existingUrl ? "keep" : "replace");
    onNewImage(null);
    onDeleteExisting(false);
  }

  function chooseKeep() {
    setPending(null);
    if (inputRef.current) inputRef.current.value = "";
    setAction("keep");
    onNewImage(null);
    onDeleteExisting(false);
  }

  function chooseDelete() {
    setPending(null);
    if (inputRef.current) inputRef.current.value = "";
    setAction("delete");
    onNewImage(null);
    onDeleteExisting(true);
  }

  const currentUrl = pending ? pending.dataUrl : existingUrl;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium leading-none">{tCustomers.image}</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {!currentUrl && (
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5"
            onClick={() => inputRef.current?.click()}>
            <ImagePlus className="size-3.5" /> {tCustomers.attachImage}
          </Button>
        )}
      </div>

      {currentUrl && (
        <div className="flex items-center gap-2 rounded-md border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentUrl}
            alt={tCustomers.image}
            className="size-14 shrink-0 rounded border object-cover"
          />
          <div className="min-w-0 flex-1">
            {pending ? (
              <>
                <div className="truncate text-sm">{pending.name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(pending.size)}</div>
              </>
            ) : action === "delete" ? (
              <div className="text-sm text-destructive">{tCustomers.imageWillBeDeleted}</div>
            ) : (
              <div className="text-sm text-muted-foreground">{tCustomers.imageAttached}</div>
            )}
          </div>

          {pending ? (
            <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
              aria-label={tCommon.remove ?? tCommon.cancel} title={tCommon.remove ?? tCommon.cancel}
              onClick={reset}>
              <X className="size-4" />
            </Button>
          ) : action === "delete" ? (
            <Button type="button" size="sm" variant="outline" className="h-7 shrink-0" onClick={chooseKeep}>
              {tCustomers.keepImage}
            </Button>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" size="sm" variant="outline" className="h-7"
                onClick={() => inputRef.current?.click()}>
                {tCustomers.replaceImage}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive"
                onClick={chooseDelete}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}