"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePdfDocument } from "../hooks/usePdfDocument";
import { useAspectFit } from "../hooks/useAspectFit";
import { PresentationZoomState } from "@/core/types";

interface PdfSlideViewerProps {
  url: string;
  currentSlide?: number;
  currentPage?: number;
  role?: "control" | "audience" | "confidence";
  title?: string;
  zoom?: PresentationZoomState;
  /** Called once when the real page count is known from the loaded PDF */
  onNumPagesDiscovered?: (numPages: number) => void;
}

/**
 * Renders a single PDF page as a high-DPI canvas conforming to the container constraint:
 *   scale = min(containerWidth / contentWidth, containerHeight / contentHeight)
 *
 * Landscape pages fit width constraint, portrait pages fit height constraint.
 * Preserves exact intrinsic aspect ratio with zero distortion and zero crop.
 */
export function PdfSlideViewer({
  url,
  currentSlide,
  currentPage,
  role,
  title: _title,
  zoom,
  onNumPagesDiscovered,
}: PdfSlideViewerProps) {
  const activeSlide = currentSlide ?? currentPage ?? 1;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageRendering, setPageRendering] = useState(false);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });

  // Extract Google Drive File ID if present in direct Google Drive link
  const driveMatch = url.includes("drive.google.com")
    ? url.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || url.match(/[?&]id=([A-Za-z0-9_-]+)/)
    : null;
  const googleFileId = driveMatch ? driveMatch[1] : null;

  const { pdfDoc, numPages, loading: docLoading, error: docError } = usePdfDocument(
    url,
    googleFileId
  );

  // Dynamic aspect fit hook conforming to scale = min(cW / contentW, cH / contentH)
  const fit = useAspectFit(pageDimensions.width, pageDimensions.height);

  // ── Emit total page count once discovered ──────────────────────────────────
  useEffect(() => {
    if (numPages > 0) {
      onNumPagesDiscovered?.(numPages);
    }
  }, [numPages, onNumPagesDiscovered]);

  // ── Render the target page whenever pdfDoc, activeSlide, or dimensions change ─
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

        // 1. Capture intrinsic unscaled page dimensions
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        setPageDimensions((prev) =>
          prev.width === unscaledViewport.width && prev.height === unscaledViewport.height
            ? prev
            : { width: unscaledViewport.width, height: unscaledViewport.height }
        );

        // 2. High-DPI scale for sharp bitmap rendering
        const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 2, 3) : 2;
        const renderedW = fit.renderedWidth > 0 ? fit.renderedWidth : unscaledViewport.width;
        const targetScale = Math.max(1.0, (renderedW * dpr) / unscaledViewport.width);
        const viewport = page.getViewport({ scale: targetScale });

        const visibleCanvas = canvasRef.current;

        // Double Buffering: Render to offscreen canvas first so visible canvas never clears or flickers
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

          // Atomic GPU Blit: Copy offscreen rendered page to visible canvas
          visibleCanvas.height = viewport.height;
          visibleCanvas.width = viewport.width;
          ctx.drawImage(offscreenCanvas, 0, 0);
        });
      })
      .then(() => {
        if (isMounted) {
          setPageRendering(false);
          renderTaskRef.current = null;

          // Proactively warm up next page in PDF.js worker cache
          if (pageNum + 1 <= pdfDoc.numPages) {
            pdfDoc.getPage(pageNum + 1).catch(() => {});
          }
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
  }, [pdfDoc, activeSlide, fit.renderedWidth]);

  // ── Canonical Error State ───────────────────────────────────────────────────
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
    <div
      ref={fit.containerRef}
      className="w-full h-full bg-slate-950 flex items-center justify-center p-0 relative overflow-hidden select-none"
    >
      {/* Loading overlay — shown only when initial PDF doc is fetching or on control screen */}
      {showLoadingOverlay && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center z-20 space-y-2">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            {docLoading ? "Loading PDF..." : `Rendering Page ${activeSlide}…`}
          </span>
        </div>
      )}

      {/* Aspect-Ratio Stage Box: fits container constraint with exact intrinsic aspect ratio */}
      <div
        style={fit.style}
        className="relative flex items-center justify-center overflow-hidden shrink-0 shadow-2xl transition-[width,height] duration-75"
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `scale(${zoom?.scale || 1.0}) translate(${zoom?.panX || 0}%, ${zoom?.panY || 0}%)`,
            transformOrigin: "center center",
            transition: "transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
            willChange: "transform",
          }}
          className="w-full h-full relative flex items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            className="max-w-full max-h-full block shadow-2xl transition-opacity duration-150"
          />
        </div>
      </div>
    </div>
  );
}
