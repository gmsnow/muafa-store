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
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    pdf.setProperties({ title: fileName, subject: fileName, creator: "Muafa Store" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const marginX = decorate ? 10 : 0;
    const marginTop = decorate ? 12 : 0;
    const marginBottom = decorate ? 15 : 0;
    const imgW = pageW - marginX * 2;
    const usableH = pageH - marginTop - marginBottom;

    const scale = 2;
    // Fixed viewport width emulated while capturing (html2canvas windowWidth).
    // Keeps PDF layout identical on phones instead of capturing the narrow
    // mobile layout stretched over A4 (giant fonts).
    const windowW = captureWidth ? Math.max(captureWidth, el.offsetWidth) : el.offsetWidth;
    // Measure the element's rendered box inside the emulated viewport. It often
    // doesn't fill the full emulated width (the app container caps it), and the
    // extra white area would appear as margins in the PDF. Cropping each band to
    // the measured box makes the content span the full page width.
    const measured = { left: 0, top: 0, width: windowW, height: Math.max(el.offsetHeight, 1) };
    const probeH = Math.max(1, Math.min(el.offsetHeight, 1250));
    const probe = await html2canvas(el, {
      scale,
      backgroundColor: "#ffffff",
      windowWidth: windowW,
      windowHeight: probeH,
      x: 0,
      y: 0,
      width: windowW,
      height: probeH,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc) => {
        const c = doc.getElementById(targetId);
        if (!c) return;
        const r = c.getBoundingClientRect();
        if (r.width > 0) {
          measured.left = r.left;
          measured.top = r.top;
          measured.width = r.width;
          measured.height = Math.max(c.scrollHeight, 1);
        }
      },
    });
    void probe;
    // Content height (css px) that maps to one A4 usable page when scaled to imgW.
    // Each page is captured as its OWN small canvas band instead of one giant
    // canvas — giant canvases exceed mobile (iOS) canvas size limits and render
    // blank, which showed up as an empty table on long statements.
    const bandHz = (usableH * measured.width) / imgW;
    const pages = Math.max(1, Math.ceil(measured.height / bandHz));

    const capture = (i: number) => {
      const pageOffset = i > 0 ? Math.floor(i * bandHz) : 0;
      const y = measured.top + pageOffset;
      const bandH = Math.min(measured.height - pageOffset, bandHz);
      return html2canvas(el, {
        scale,
        backgroundColor: "#ffffff",
        windowWidth: windowW,
        windowHeight: bandH,
        x: measured.left,
        y,
        width: measured.width,
        height: bandH,
        scrollX: 0,
        scrollY: y,
      });
    };

    let canvas = await capture(0);
    for (let i = 0; i < pages; i++) {
      if (i > 0) {
        canvas = await capture(i);
        pdf.addPage();
      }
      const cW = canvas.width;
      const cH = canvas.height;
      if (cW && cH) {
        const mmH = (cH * imgW) / cW;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", marginX, marginTop, imgW, mmH, undefined, "FAST");
      }
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
    let retryTimer: number | undefined;

    const prebuild = () => {
      getCachedBlob().catch(() => {
        if (alive) blobCacheRef.current = null;
      });
    };

    const invalidate = () => {
      blobCacheRef.current = null;
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        if (alive) prebuild();
      }, 400);
    };

    const el = document.getElementById(targetId);
    const observer = el
      ? new MutationObserver(invalidate)
      : undefined;
    observer?.observe(el!, { childList: true, characterData: true, subtree: true });

    const timer = window.setTimeout(prebuild, 800);
    return () => {
      alive = false;
      observer?.disconnect();
      window.clearTimeout(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
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
