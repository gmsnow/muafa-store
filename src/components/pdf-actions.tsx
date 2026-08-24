"use client";

import { useCallback, useState } from "react";
import { Download, Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type PdfActionLabels = {
  sharePdf: string;
  print?: string;
  generatingPdf: string;
  shareFailed: string;
};

/**
 * Captures the element #targetId (default "pdf-paper") into an A4 PDF built
 * with html2canvas-pro (oklch-safe) + jsPDF, then offers Web-Share (WhatsApp
 * on phones), direct download, and window.print().
 */
export function PdfActions({
  fileName,
  targetId = "pdf-paper",
  labels,
  captureWidth,
}: {
  fileName: string;
  targetId?: string;
  labels: PdfActionLabels;
  /**
   * Fixed viewport width emulated while capturing (html2canvas windowWidth).
   * Keeps PDF layout identical on phones instead of capturing the narrow
   * mobile layout stretched over A4 (giant fonts).
   */
  captureWidth?: number;
}) {
  const [busy, setBusy] = useState(false);

  const buildPdfBlob = useCallback(async (): Promise<Blob> => {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);
    const el = document.getElementById(targetId);
    if (!el) throw new Error(`#${targetId} not found`);
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: "#ffffff",
      ...(captureWidth ? { windowWidth: Math.max(captureWidth, el.offsetWidth) } : {}),
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    let remaining = imgH;
    let position = 0;
    while (remaining > 0) {
      pdf.addImage(imgData, "JPEG", 0, position, pageW, imgH, undefined, "FAST");
      remaining -= pageH;
      if (remaining > 0) {
        position -= pageH;
        pdf.addPage();
      }
    }
    return pdf.output("blob");
  }, [targetId, captureWidth]);

  const triggerDownload = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileName]);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await buildPdfBlob();
      const file = new File([blob], `${fileName}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: fileName });
      } else {
        triggerDownload(blob);
        toast.info("تم تنزيل الملف — أرسله عبر واتساب");
      }
    } catch (e) {
      const err = e as Error;
      if (err?.name !== "AbortError") {
        console.error("[pdf] build failed:", err);
        toast.error(`${labels.shareFailed}${err?.message ? ` (${err.message})` : ""}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      triggerDownload(await buildPdfBlob());
    } catch (e) {
      console.error("[pdf] build failed:", e);
      toast.error(labels.shareFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-2 print:hidden">
      <Button size="sm" onClick={() => void share()} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
        {busy ? labels.generatingPdf : labels.sharePdf}
      </Button>
      <Button size="sm" variant="outline" onClick={() => void download()} disabled={busy}>
        <Download className="size-4" />
        PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <Printer className="size-4" />
        {labels.print ?? "طباعة"}
      </Button>
    </div>
  );
}
