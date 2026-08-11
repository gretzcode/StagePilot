"use client";

import { useState, useEffect, useRef } from "react";
import { Material, SlideMetadata } from "@/core/types";
import { PdfSlideViewer } from "./PdfSlideViewer";

interface SlideViewerProps {
  material: Material | null;
  slide: SlideMetadata | null;
  currentPage: number;
  blanked?: boolean;
  role?: "control" | "audience" | "confidence";
  /** Called when the real PDF page count is discovered from PDF.js */
  onNumPagesDiscovered?: (numPages: number) => void;
}

// Global Memory-Mapped RAM Cache for Slide Images (0ms Sync Retrieval)
const slideImageMemoryCache = new Map<string, HTMLImageElement>();
const PREFETCH_DELAY_MS = 1800;
const MAX_PREFETCH_AHEAD = 12;

function preloadSlideImage(url: string): HTMLImageElement {
  if (slideImageMemoryCache.has(url)) {
    return slideImageMemoryCache.get(url)!;
  }
  const img = new Image();
  img.src = url;
  slideImageMemoryCache.set(url, img);
  return img;
}

export function SlideViewer({ material, slide, currentPage, blanked, role, onNumPagesDiscovered }: SlideViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const baseIframeSrc = useRef<string | null>(null);

  const rawUrl = material?.externalUrl || material?.url || "";
  const isGoogleSlides = rawUrl.includes("docs.google.com/presentation");
  const isGoogleDrive = rawUrl.includes("drive.google.com");

  const match = rawUrl.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
  const googlePresentationId = match ? match[1] : null;

  const driveMatch = rawUrl.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || rawUrl.match(/id=([A-Za-z0-9_-]+)/);
  const googleFileId = driveMatch ? driveMatch[1] : null;

  // Target Google Slides PNG export URL
  const targetGoogleSlideImg = googlePresentationId
    ? `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${currentPage}`
    : null;

  // Currently displayed image URL on screen
  const [displayedImgUrl, setDisplayedImgUrl] = useState<string | null>(() => {
    if (!targetGoogleSlideImg) return null;
    preloadSlideImage(targetGoogleSlideImg);
    return targetGoogleSlideImg;
  });
  const [useFallbackIframe, setUseFallbackIframe] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [prefetchQueue, setPrefetchQueue] = useState<number[]>([]);
  const [prefetchedPages, setPrefetchedPages] = useState<number[]>([]);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);

  // 1. Sequential prefetch: prepare one next slide at a time with a safe delay.
  useEffect(() => {
    if (!googlePresentationId || !material?.totalPages || material.totalPages <= 1) return;

    const pendingPages = Array.from({ length: material.totalPages }, (_, index) => index + 1).filter(
      (page) => page !== currentPage && !prefetchedPages.includes(page) && page <= currentPage + MAX_PREFETCH_AHEAD
    );

    if (pendingPages.length === 0) return;

    const nextPage = pendingPages[0];
    if (prefetchQueue[0] === nextPage) return;

    setPrefetchQueue([nextPage]);
    setLoadingPage(nextPage);

    const timer = window.setTimeout(() => {
      const url = `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${nextPage}`;
      preloadSlideImage(url);
      setPrefetchedPages((prev) => (prev.includes(nextPage) ? prev : [...prev, nextPage]));
      setLoadingPage(null);
    }, PREFETCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [googlePresentationId, currentPage, material?.totalPages, prefetchedPages, prefetchQueue]);

  // 2. Synchronous Instant Image Swap Engine (0ms Lag Response)
  useEffect(() => {
    if (!targetGoogleSlideImg) {
      setIsImageLoading(false);
      return;
    }

    setIsImageLoading(true);
    const cachedImg = preloadSlideImage(targetGoogleSlideImg);
    if (cachedImg.complete) {
      setDisplayedImgUrl(targetGoogleSlideImg);
      setIsImageLoading(false);
    } else {
      cachedImg.onload = () => {
        setDisplayedImgUrl(targetGoogleSlideImg);
        setIsImageLoading(false);
      };
      cachedImg.onerror = () => {
        setIsImageLoading(false);
        setUseFallbackIframe(true);
      };
    }
  }, [targetGoogleSlideImg]);

  // 3. Persistent Base Iframe URL (used only as a fallback when image export is unavailable)
  if (isGoogleSlides && googlePresentationId && !baseIframeSrc.current) {
    baseIframeSrc.current = `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false#slide=id.p${currentPage}`;
  } else if (isGoogleDrive && googleFileId && !baseIframeSrc.current) {
    baseIframeSrc.current = `https://drive.google.com/file/d/${googleFileId}/preview#page=${currentPage}&zoom=page-fit&toolbar=0&navpanes=0`;
  }
  const persistentIframeSrc = baseIframeSrc.current || rawUrl;

  useEffect(() => {
    setUseFallbackIframe(false);
  }, [googlePresentationId, currentPage]);

  // 4. Reactive fallback iframe update engine for the rare cases where PNG export is blocked.
  useEffect(() => {
    if (useFallbackIframe && isGoogleSlides && googlePresentationId && iframeRef.current) {
      const targetSrc = `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false&delayms=60000#slide=id.p${currentPage}`;
      if (iframeRef.current.src !== targetSrc) {
        iframeRef.current.src = targetSrc;
      }
    } else if (useFallbackIframe && isGoogleDrive && googleFileId && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.location.replace(
          `https://drive.google.com/file/d/${googleFileId}/preview#page=${currentPage}&zoom=page-fit&toolbar=0&navpanes=0`
        );
      } catch {
        // Cross-origin fallback
      }
    }
  }, [currentPage, isGoogleSlides, googlePresentationId, isGoogleDrive, googleFileId, useFallbackIframe]);

  if (blanked) {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center select-none">
        {role === "control" && (
          <span className="text-rose-500 font-bold text-sm tracking-wider uppercase">
            OUTPUT BLANKED (BLACK)
          </span>
        )}
      </div>
    );
  }

  if (!material) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-8 text-center border border-slate-800 rounded-2xl">
        <span className="text-xs uppercase font-mono tracking-widest text-slate-500 mb-2">STAGEPILOT OUTPUT</span>
        <h3 className="text-xl font-bold text-slate-400">WAITING FOR PRESENTATION</h3>
        <p className="text-slate-500 text-xs mt-1">Select material in Control Room and click Present</p>
      </div>
    );
  }

  if (material.type === "pdf" || isGoogleDrive) {
    return (
      <PdfSlideViewer
        url={rawUrl}
        currentPage={currentPage}
        role={role}
        title={material.name}
        onNumPagesDiscovered={onNumPagesDiscovered}
      />
    );
  }

  if (material.type === "url" || material.type === "canva") {
    if (isGoogleSlides && googlePresentationId && !useFallbackIframe) {
      const activeImgUrl = displayedImgUrl || targetGoogleSlideImg;
      return (
        <div className="w-full h-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
          <div className={`w-full h-full relative flex items-center justify-center ${role !== "control" ? "pointer-events-none" : ""}`}>
            {activeImgUrl ? (
              <img
                src={activeImgUrl}
                alt={material.name}
                className="max-w-full max-h-full object-contain transition-opacity duration-150"
                onError={() => setUseFallbackIframe(true)}
              />
            ) : (
              <div className="text-slate-400 text-sm uppercase tracking-widest">Loading slide…</div>
            )}

            {isImageLoading && role === "control" && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-[1px]">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex gap-2">
                    <span className="h-3 w-3 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.2s]" />
                    <span className="h-3 w-3 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.1s]" />
                    <span className="h-3 w-3 rounded-full bg-purple-400 animate-bounce" />
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Preparing slide</div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (useFallbackIframe && isGoogleSlides && googlePresentationId) {
      const embedUrl = `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false&delayms=60000#slide=id.p${currentPage}`;
      return (
        <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center">
          <div className={`w-full h-full relative ${role !== "control" ? "pointer-events-none" : ""}`}>
            <iframe
              ref={iframeRef}
              key={`gslide-iframe-${googlePresentationId}`}
              src={embedUrl}
              title={material.name}
              className="w-full h-full border-0 bg-slate-950 z-10"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center">
        <div className={`w-full h-full relative ${role !== "control" ? "pointer-events-none" : ""}`}>
          <iframe
            ref={iframeRef}
            src={persistentIframeSrc}
            title={material.name}
            className="w-full h-full border-0 bg-slate-950 z-10"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </div>
    );
  }

  if (material.type === "image") {
    return (
      <div className="w-full h-full bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide?.contentUrl || material.url}
          alt={material.name}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-150"
        />
      </div>
    );
  }

  // Default PDF/PPTX Normalized Slide Renderer Surface
  return (
    <div className="w-full h-full bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
      <div className="absolute top-4 left-4 text-[10px] font-mono uppercase tracking-widest bg-slate-800/80 px-2.5 py-1 rounded text-purple-300">
        {material.type.toUpperCase()} • PAGE {currentPage} OF {material.totalPages}
      </div>

      <div className="max-w-2xl w-full">
        <span className="text-6xl font-extrabold text-purple-400 block mb-3">{currentPage}</span>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">{slide?.title || `${material.name} — Slide ${currentPage}`}</h2>
        {slide?.notes && role !== "audience" && (
          <p className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 text-xs leading-relaxed text-left font-sans">
            <strong className="text-purple-400 block mb-1 uppercase tracking-wider text-[10px]">Speaker Note:</strong>
            {slide.notes}
          </p>
        )}
      </div>
    </div>
  );
}
