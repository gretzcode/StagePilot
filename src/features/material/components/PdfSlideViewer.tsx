"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePdfDocument } from "../hooks/usePdfDocument";

interface PdfSlideViewerProps {
  url: string;
  currentPage: number;
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
  currentPage,
  role,
  title,
  onNumPagesDiscovered,
}: PdfSlideViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageRendering, setPageRendering] = useState(false);
  // Track active render task so we can cancel on page change
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Extract Google Drive File ID if present
  const driveMatch =
    url.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || url.match(/id=([A-Za-z0-9_-]+)/);
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

  // ── Render the target page whenever pdfDoc or currentPage changes ──────────
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const pageNum = Math.min(Math.max(1, currentPage), pdfDoc.numPages);

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
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const pdfRenderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = {
          cancel: () => pdfRenderTask.cancel(),
        };
        return pdfRenderTask.promise;
      })
      .then(() => {
        if (isMounted) {
          setPageRendering(false);
          renderTaskRef.current = null;
        }
      })
      .catch((err: unknown) => {
        // RenderingCancelledException is expected on fast page changes — ignore it
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
  }, [pdfDoc, currentPage]);

  // ── Graceful iframe fallback when PDF.js cannot fetch (CORS / network) ─────
  if (docError) {
    const iframeSrc = googleFileId
      ? `https://drive.google.com/file/d/${googleFileId}/preview#page=${currentPage}&toolbar=0&navpanes=0`
      : url;

    return (
      <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center">
        <div
          className={`w-full h-full relative ${
            role !== "control" ? "pointer-events-none" : ""
          }`}
          // Clip the Google Drive toolbar that appears at the top of the iframe
          style={googleFileId ? { clipPath: "inset(48px 0 0 0)" } : undefined}
        >
          <iframe
            src={iframeSrc}
            title={title || "PDF Document"}
            className="w-full h-full border-0 bg-slate-950 z-10"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </div>
    );
  }

  // ── Main canvas renderer ───────────────────────────────────────────────────
  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center p-0 relative overflow-hidden">
      {/* Loading overlay — shown while PDF doc is fetching OR page is rendering */}
      {(docLoading || pageRendering) && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center z-20 space-y-2">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            {docLoading
              ? "Loading PDF..."
              : `Rendering Page ${currentPage}…`}
          </span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain shadow-2xl transition-opacity duration-200"
      />
    </div>
  );
}
