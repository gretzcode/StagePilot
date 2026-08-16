"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePdfDocument } from "../hooks/usePdfDocument";

interface PdfSlideViewerProps {
  url: string;
  currentSlide?: number;
  currentPage?: number;
  role?: "control" | "audience" | "confidence";
  title?: string;
  /** Called once when the real page count is known from the loaded PDF */
  onNumPagesDiscovered?: (numPages: number) => void;
}

/**
 * Renders a single PDF page as a high-DPI canvas (2x scale).
 * Uses the shared usePdfDocument hook so the PDF is loaded only once
 * regardless of how many components share the same URL.
 */
export function PdfSlideViewer({
  url,
  currentSlide,
  currentPage,
  role,
  title: _title,
  onNumPagesDiscovered,
}: PdfSlideViewerProps) {
  const activeSlide = currentSlide ?? currentPage ?? 1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageRendering, setPageRendering] = useState(false);
  // Track active render task so we can cancel on page change
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Extract Google Drive File ID if present in direct Google Drive link
  const driveMatch = url.includes("drive.google.com")
    ? url.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || url.match(/[?&]id=([A-Za-z0-9_-]+)/)
    : null;
  const googleFileId = driveMatch ? driveMatch[1] : null;

  const { pdfDoc, numPages, loading: docLoading, error: docError } = usePdfDocument(
    url,
    googleFileId
  );

  // ── Emit total page count once discovered ──────────────────────────────────
  useEffect(() => {
    if (numPages > 0) {
      onNumPagesDiscovered?.(numPages);
    }
  }, [numPages, onNumPagesDiscovered]);

  // ── Render the target page whenever pdfDoc or activeSlide changes ──────────
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const pageNum = Math.min(Math.max(1, activeSlide), pdfDoc.numPages);

    // Cancel any in-progress render
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    let isMounted = true;
    setPageRendering(true);

    pdfDoc
      .getPage(pageNum)
      .then((page) => {
        if (!isMounted || !canvasRef.current) return;

        const viewport = page.getViewport({ scale: 2.0 });
        const visibleCanvas = canvasRef.current;

        // Double Buffering: Render to offscreen canvas first so visible canvas never clears or flickers black
        const offscreenCanvas = document.createElement("canvas");
        offscreenCanvas.height = viewport.height;
        offscreenCanvas.width = viewport.width;

        const offscreenCtx = offscreenCanvas.getContext("2d");
        if (!offscreenCtx) return;

        const pdfRenderTask = page.render({ canvasContext: offscreenCtx, viewport });
        renderTaskRef.current = {
          cancel: () => pdfRenderTask.cancel(),
        };

        return pdfRenderTask.promise.then(() => {
          if (!isMounted || !canvasRef.current) return;
          const ctx = visibleCanvas.getContext("2d");
          if (!ctx) return;

          // Atomic GPU Blit: Copy offscreen rendered page to visible canvas instantly without clearing to black
          visibleCanvas.height = viewport.height;
          visibleCanvas.width = viewport.width;
          ctx.drawImage(offscreenCanvas, 0, 0);
        });
      })
      .then(() => {
        if (isMounted) {
          setPageRendering(false);
          renderTaskRef.current = null;
        }
      })
      .catch((err: unknown) => {
        const isCancel =
          err instanceof Error && err.name === "RenderingCancelledException";
        if (!isCancel && isMounted) {
          setPageRendering(false);
        }
      });

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, activeSlide]);

  // ── Canonical Error State (No iframe fallback / no external toolbar) ─────
  if (docError) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/60 max-w-md">
          <span className="text-rose-400 font-mono font-bold text-xs uppercase tracking-wider block mb-1">
            Gagal Memuat Dokumen PDF
          </span>
          <p className="text-slate-400 text-xs">
            {docError || "File PDF tidak dapat dirender. Pastikan file valid dan akun Google Drive tersambung."}
          </p>
        </div>
      </div>
    );
  }

  const showLoadingOverlay = docLoading || (pageRendering && role === "control");

  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center p-0 relative overflow-hidden">
      {/* Loading overlay — shown only when initial PDF doc is fetching or on control screen */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center z-20 space-y-2">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            {docLoading ? "Loading PDF..." : `Rendering Page ${activeSlide}…`}
          </span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain shadow-2xl transition-opacity duration-150"
      />
    </div>
  );
}
