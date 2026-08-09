"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

interface PdfSlideViewerProps {
  url: string;
  currentPage: number;
  role?: "control" | "audience" | "confidence";
  title?: string;
}

export function PdfSlideViewer({ url, currentPage, role, title }: PdfSlideViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Extract Google Drive File ID if present
  const driveMatch = url.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || url.match(/id=([A-Za-z0-9_-]+)/);
  const googleFileId = driveMatch ? driveMatch[1] : null;

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    // Dynamic import of pdfjs-dist on client side
    const renderPdfPage = async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        
        // Use CDN worker URL compatible with current pdfjs-dist version
        if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        }

        // Determine PDF fetch target URL
        const fetchTarget = googleFileId
          ? `/api/material/asset?url=${encodeURIComponent(`https://drive.google.com/uc?export=download&id=${googleFileId}`)}`
          : url;

        const loadingTask = pdfjsLib.getDocument(fetchTarget);
        const pdfDoc = await loadingTask.promise;

        if (!isMounted) return;

        const pageNum = Math.min(Math.max(1, currentPage), pdfDoc.numPages);
        const page = await pdfDoc.getPage(pageNum);

        if (!isMounted || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        // Render at 2.0x scale for high-DPI crisp presentation displays
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        if (isMounted) {
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          // Fallback gracefully if PDF.js fails to fetch cross-origin URL
          setError(err instanceof Error ? err.message : "Failed to render PDF page canvas");
          setLoading(false);
        }
      }
    };

    renderPdfPage();

    return () => {
      isMounted = false;
    };
  }, [url, currentPage, googleFileId]);

  if (error || !canvasRef) {
    // Graceful iframe fallback if cross-origin PDF.js is blocked
    const iframeSrc = googleFileId
      ? `https://drive.google.com/file/d/${googleFileId}/preview#page=${currentPage}&zoom=page-fit&toolbar=0&navpanes=0`
      : url;

    return (
      <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center">
        <div
          className={`w-full h-full relative ${role !== "control" ? "pointer-events-none" : ""}`}
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

  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center p-0 relative overflow-hidden">
      {loading && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur flex flex-col items-center justify-center z-20 space-y-2">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">
            Rendering PDF Page {currentPage}...
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
