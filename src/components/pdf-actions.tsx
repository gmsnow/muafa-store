"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type PdfActionLabels = {
  sharePdf: string;
  print?: string;
  generatingPdf: string;
  shareFailed: string;
  downloadFallback?: string;
};

/** Thin rule + "1 / N" page number + filename in the bottom margin band. */
function drawFooter(
  pdf: import("jspdf").jsPDF,
  page: number,
  pages: number,
  pageW: number,
  pageH: number,
  marginX: number,
  marginBottom: number,
  fileName: string,
) {
  const baseY = pageH - marginBottom + 4;
  pdf.setDrawColor(200, 205, 214);
  pdf.setLineWidth(0.25);
  pdf.line(marginX, baseY - 1, pageW - marginX, baseY - 1);
  pdf.setFontSize(8);
  pdf.setTextColor(110, 120, 134);
  pdf.text(fileName, marginX + 1, baseY + 4);
  pdf.text(`${page} / ${pages}`, pageW / 2, baseY + 4, { align: "center" });
}

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
  decorate = false,
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
  /**
   * Wrap the capture in A4 margins with a footer (page numbers + filename).
   * Turned on for reports; receipts keep the full-bleed thermal layout.
   */
  decorate?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const blobCacheRef = useRef<Promise<Blob> | null>(null);

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
    pdf.setProperties({ title: fileName, subject: fileName, creator: "Muafa Store" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const marginX = decorate ? 10 : 0;
    const marginTop = decorate ? 12 : 0;
    const marginBottom = decorate ? 15 : 0;
    const imgW = pageW - marginX * 2;
    const usableH = pageH - marginTop - marginBottom;

    // Horizontal content band (in canvas px) that maps to one A4 page when the
    // full width is scaled to imgW. Pages are cropped bands of the single
    // capture, so long reports flow onto as many pages as the height needs.
    const pxPage = (usableH * canvas.width) / imgW;
    const pages = Math.max(1, Math.ceil(canvas.height / pxPage));

    const sliceCanvas = document.createElement("canvas");
    const sliceCtx = sliceCanvas.getContext("2d");
    if (!sliceCtx) throw new Error("Canvas 2D context unavailable");
    sliceCanvas.width = canvas.width;

    for (let i = 0; i < pages; i++) {
      const y = Math.floor(i * pxPage);
      const sliceH = Math.min(canvas.height - y, pxPage);
      sliceCanvas.height = Math.ceil(sliceH);
      sliceCtx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      sliceCtx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const sliceMmH = (sliceH * imgW) / canvas.width;
      if (i > 0) pdf.addPage();
      pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", marginX, marginTop, imgW, sliceMmH, undefined, "FAST");
      if (decorate) drawFooter(pdf, i + 1, pages, pageW, pageH, marginX, marginBottom, fileName);
    }
    return pdf.output("blob");
  }, [targetId, captureWidth, decorate, fileName]);

  const getCachedBlob = useCallback((): Promise<Blob> => {
    blobCacheRef.current ??= buildPdfBlob();
    return blobCacheRef.current;
  }, [buildPdfBlob]);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      getCachedBlob().catch(() => {
        if (alive) blobCacheRef.current = null;
      });
    }, 800);
    // The cached blob is only valid while #targetId shows the same content.
    // Soft navigations (e.g. customer period filter → full statement) keep this
    // component mounted, so without this the share could hand back a stale PDF
    // of what was on screen before. Watch the element and drop the cache
    // whenever its content changes; the next share rebuilds fresh.
    const el = document.getElementById(targetId);
    let observer: MutationObserver | null = null;
    if (el) {
      observer = new MutationObserver(() => {
        blobCacheRef.current = null;
      });
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    }
    return () => {
      alive = false;
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [getCachedBlob, targetId]);

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
      const blob = await getCachedBlob();
      const file = new File([blob], `${fileName}.pdf`, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: fileName });
        } catch (e) {
          const err = e as Error;
          if (err?.name === "AbortError") return;
          triggerDownload(blob);
          toast.info(labels.downloadFallback ?? "تم تنزيل الملف — أرسله عبر واتساب");
        }
        return;
      }
      triggerDownload(blob);
      toast.info(labels.downloadFallback ?? "تم تنزيل الملف — أرسله عبر واتساب");
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
      triggerDownload(await getCachedBlob());
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
