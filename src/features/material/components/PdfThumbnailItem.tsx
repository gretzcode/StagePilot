"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PdfThumbnailItemProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  isSelected: boolean;
  onSelectSlide: (page: number) => void;
}

/**
 * Renders a mini canvas thumbnail for a single PDF page.
 * Uses IntersectionObserver for lazy rendering — only renders when scrolled into view.
 * Receives a shared, already-loaded PDFDocumentProxy from the parent (no re-fetch).
 */
export function PdfThumbnailItem({
  pdfDoc,
  pageNumber,
  isSelected,
  onSelectSlide,
}: PdfThumbnailItemProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // ── Lazy visibility detection ─────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" } // pre-load 300px before entering viewport
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Render thumbnail canvas once visible ──────────────────────────────────
  useEffect(() => {
    if (!isVisible || !pdfDoc || !canvasRef.current) return;

    let cancelled = false;
    const renderTask = { cancel: () => { cancelled = true; } };

    pdfDoc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled || !canvasRef.current) return;

        // Scale 0.35 → lightweight thumbnail, still sharp enough for preview
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const pdfRenderTask = page.render({ canvasContext: ctx, viewport });
        renderTask.cancel = () => {
          cancelled = true;
          pdfRenderTask.cancel();
        };
        return pdfRenderTask.promise;
      })
      .then(() => {
        if (!cancelled) setRendered(true);
      })
      .catch(() => {
        // Silently ignore RenderingCancelledException and other errors
      });

    return () => renderTask.cancel();
  }, [isVisible, pdfDoc, pageNumber]);

  return (
    <button
      onClick={() => onSelectSlide(pageNumber)}
      className={`w-full text-left rounded-2xl border transition-all duration-200 group overflow-hidden relative ${
        isSelected
          ? "border-purple-500 ring-2 ring-purple-500/40 bg-purple-950/30 shadow-xl"
          : "border-slate-800/90 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/60"
      }`}
    >
      {/* ── 16:9 thumbnail canvas area ─────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="w-full aspect-video relative bg-slate-900 overflow-hidden border-b border-slate-800/60"
      >
        {/* Actual PDF canvas */}
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${
            rendered ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Shimmer / loading state */}
        {!rendered && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90">
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.2s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.1s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-bounce" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
                Page {pageNumber}
              </span>
            </div>
          </div>
        )}

        {/* Subtle gradient overlay for badges */}
        {rendered && (
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/30 pointer-events-none" />
        )}

        {/* Page number badge */}
        <div className="absolute top-2 left-2 z-10">
          <span
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
              isSelected
                ? "bg-purple-600 text-white"
                : "bg-slate-800/90 text-slate-300"
            }`}
          >
            #{String(pageNumber).padStart(2, "0")}
          </span>
        </div>

        {/* LIVE badge */}
        {isSelected && (
          <div className="absolute top-2 right-2 z-10">
            <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center space-x-1 animate-pulse">
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>LIVE</span>
            </span>
          </div>
        )}
      </div>

      {/* ── Bottom meta bar ────────────────────────────────────────────────── */}
      <div className="px-3 py-1.5 flex items-center justify-between bg-slate-900/90">
        <span
          className={`text-[11px] font-semibold truncate ${
            isSelected
              ? "text-purple-300"
              : "text-slate-400 group-hover:text-white"
          }`}
        >
          Page {pageNumber}
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {isSelected ? "Active" : "Select"}
        </span>
      </div>
    </button>
  );
}
