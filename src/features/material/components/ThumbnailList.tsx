"use client";

import { useEffect, useState, useRef } from "react";
import { Material } from "@/core/types";
import { Play } from "lucide-react";
import { usePdfDocument } from "../hooks/usePdfDocument";
import { PdfThumbnailItem } from "./PdfThumbnailItem";

// ─────────────────────────────────────────────────────────────────────────────
// ThumbnailItem — used for non-PDF materials (Google Slides, PPTX, image, etc.)
// ─────────────────────────────────────────────────────────────────────────────

interface ThumbnailItemProps {
  slide: {
    index: number;
    title?: string;
    url?: string;
    contentUrl?: string;
    thumbnailUrl?: string;
  };
  isSelected: boolean;
  thumbnailUrl: string | null;
  googlePresentationId?: string | null;
  onSelectSlide: (pageNumber: number) => void;
}

function ThumbnailItem({ slide, isSelected, thumbnailUrl, googlePresentationId, onSelectSlide }: ThumbnailItemProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [fallbackAttempt, setFallbackAttempt] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentSrc =
    fallbackAttempt === 1 && googlePresentationId
      ? `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?slide=id.p${slide.index}`
      : thumbnailUrl;

  useEffect(() => {
    setIsLoading(true);
    setImageError(false);
    setFallbackAttempt(0);
  }, [slide.index, thumbnailUrl]);

  useEffect(() => {
    if (imgRef.current && imgRef.current.complete && currentSrc) {
      setIsLoading(false);
    }
  }, [currentSrc]);

  return (
    <button
      onClick={() => onSelectSlide(slide.index)}
      className={`w-full text-left rounded-2xl border transition-all duration-200 group overflow-hidden relative ${
        isSelected
          ? "border-purple-500 ring-2 ring-purple-500/40 bg-purple-950/30 shadow-xl"
          : "border-slate-800/90 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/60"
      }`}
    >
      {/* 16:9 Aspect Ratio Mini Slide Preview Canvas */}
      <div className={`w-full aspect-video relative flex flex-col justify-between p-3 overflow-hidden border-b border-slate-800/60 ${currentSrc && !imageError ? "bg-slate-950" : "bg-slate-900/80"}`}>
        {currentSrc && !imageError ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={currentSrc}
              alt={slide.title || `Slide ${slide.index}`}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                if (fallbackAttempt === 0 && googlePresentationId) {
                  setFallbackAttempt(1);
                } else {
                  setIsLoading(false);
                  setImageError(true);
                }
              }}
              className="absolute inset-0 w-full h-full object-cover z-0"
            />
            {/* Gradient overlay for readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-slate-950/60 z-0" />
          </>
        ) : null}

        {isLoading && thumbnailUrl ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/80 backdrop-blur-[1px]">
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.2s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.1s]" />
                <span className="h-2.5 w-2.5 rounded-full bg-purple-400 animate-bounce" />
              </div>
              <span className="text-[10px] uppercase tracking-[0.25em] text-slate-400">Loading</span>
            </div>
          </div>
        ) : null}

        {/* Mini Slide Card Header Badge */}
        <div className="flex items-center justify-between z-10 relative">
          <span className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
            isSelected ? "bg-purple-600 text-white" : "bg-slate-800/90 text-slate-300"
          }`}>
            #{slide.index.toString().padStart(2, "0")}
          </span>

          {isSelected && (
            <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center space-x-1 animate-pulse">
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>LIVE</span>
            </span>
          )}
        </div>

        {!thumbnailUrl && (
          <div className="z-10 my-auto relative flex w-full flex-col items-start rounded-xl border border-dashed border-slate-700/70 bg-gradient-to-r from-slate-950/40 via-slate-900/50 to-slate-950/40 bg-[length:200%_100%] animate-shimmer p-3">
            <div className={`h-2.5 rounded-sm w-3/4 bg-gradient-to-r from-slate-700/60 via-slate-600/40 to-slate-700/60 bg-[length:200%_100%] animate-shimmer ${isSelected ? "from-purple-600/60 via-purple-500/40 to-purple-600/60" : ""}`} />
            <div className="mt-2 h-1.5 rounded-sm w-1/2 bg-gradient-to-r from-slate-700/40 via-slate-600/20 to-slate-700/40 bg-[length:200%_100%] animate-shimmer" />
            <div className="mt-2 h-1.5 rounded-sm w-2/3 bg-gradient-to-r from-slate-700/30 via-slate-600/10 to-slate-700/30 bg-[length:200%_100%] animate-shimmer" />
            <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-spin" />
              <span>Ready</span>
            </div>
          </div>
        )}

        <div className="z-10 relative">
          <span className="text-[10px] text-slate-300 font-medium block truncate drop-shadow">
            Slide {slide.index}
          </span>
        </div>
      </div>

      {/* Bottom Meta Bar */}
      <div className="px-3 py-1.5 flex items-center justify-between bg-slate-900/90">
        <span className={`text-[11px] font-semibold truncate ${isSelected ? "text-purple-300" : "text-slate-400 group-hover:text-white"}`}>
          {slide.title || `Slide ${slide.index}`}
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {isSelected ? "Active" : "Select"}
        </span>
      </div>
    </button>
  );
}

function appendAssetAccessParams(url: string, deviceId?: string): string {
  if (!deviceId || !url.startsWith("/api/material/asset")) return url;
  const [path, hash = ""] = url.split("#");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}deviceId=${encodeURIComponent(deviceId)}${hash ? `#${hash}` : ""}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PdfThumbnailList — dedicated sidebar for PDF materials
// ─────────────────────────────────────────────────────────────────────────────

interface PdfThumbnailListProps {
  material: Material;
  currentPage: number;
  onSelectSlide: (pageNumber: number) => void;
  deviceId?: string;
}

function PdfThumbnailList({ material, currentPage, onSelectSlide, deviceId }: PdfThumbnailListProps) {
  const rawUrl = appendAssetAccessParams(material.externalUrl || material.url || "", deviceId);
  const driveMatch = rawUrl.includes("drive.google.com")
    ? rawUrl.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || rawUrl.match(/[?&]id=([A-Za-z0-9_-]+)/)
    : null;
  const googleFileId = driveMatch ? driveMatch[1] : null;

  const { pdfDoc, numPages, loading, error } = usePdfDocument(rawUrl, googleFileId);

  // Effective count: use real numPages from PDF.js when available, else fall back to material metadata
  const effectiveCount = numPages > 0 ? numPages : Math.max(material.totalPages || 1, 1);

  if (loading && !pdfDoc) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <div className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.2s]" />
          <span className="h-3 w-3 rounded-full bg-purple-400 animate-bounce [animation-delay:-0.1s]" />
          <span className="h-3 w-3 rounded-full bg-purple-400 animate-bounce" />
        </div>
        <span className="text-xs text-slate-500 uppercase tracking-widest font-mono">Loading PDF…</span>
      </div>
    );
  }

  if (error || !pdfDoc) {
    // PDF couldn't be loaded via PDF.js (e.g. CORS) — show page number buttons as fallback
    return (
      <div className="grid grid-cols-1 gap-2">
        {Array.from({ length: effectiveCount }, (_, i) => {
          const page = i + 1;
          const isSel = page === currentPage;
          return (
            <button
              key={page}
              onClick={() => onSelectSlide(page)}
              className={`w-full py-3 px-4 rounded-xl border text-xs font-bold transition-all ${
                isSel
                  ? "bg-purple-600 border-purple-500 text-white shadow-lg ring-2 ring-purple-500/40"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800"
              }`}
            >
              {isSel && (
                <Play className="w-3 h-3 fill-current inline mr-1.5" />
              )}
              Page {page}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {Array.from({ length: effectiveCount }, (_, i) => (
        <PdfThumbnailItem
          key={i + 1}
          pdfDoc={pdfDoc}
          pageNumber={i + 1}
          isSelected={currentPage === i + 1}
          onSelectSlide={onSelectSlide}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ThumbnailList — main export, routes to PDF or standard list
// ─────────────────────────────────────────────────────────────────────────────

interface ThumbnailListProps {
  material: Material | null;
  currentPage: number;
  onSelectSlide: (pageNumber: number) => void;
  placeholderCount?: number | null;
  isDiscoveringSlides?: boolean;
  deviceId?: string;
}

const LOAD_INTERVAL = 100;

export function ThumbnailList({
  material,
  currentPage,
  onSelectSlide,
  placeholderCount,
  isDiscoveringSlides,
  deviceId,
}: ThumbnailListProps) {
  // ── ALL hooks must be declared before any conditional return ──────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const rawUrl = appendAssetAccessParams(material?.externalUrl || material?.url || "", deviceId);
  const driveMatch = rawUrl.includes("drive.google.com")
    ? rawUrl.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || rawUrl.match(/[?&]id=([A-Za-z0-9_-]+)/)
    : null;
  const googleDriveFileId = driveMatch ? driveMatch[1] : null;
  const isPdf = material?.type === "pdf" || material?.type === "pptx" || Boolean(googleDriveFileId);

  const match = rawUrl.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
  const googlePresentationId = match ? match[1] : null;

  const effectiveCount = isPdf
    ? 1
    : Math.max(
        placeholderCount || material?.totalPages || 1,
        material?.totalPages || 1,
        material?.slides?.length || 1,
        currentPage + 1
      );

  // ── Sequential reveal with self-discovering probe ──────────────────────────
  //
  // `localMax` is the working effective count local to this component.
  // It starts at `effectiveCount` (from props/state) and can ONLY grow.
  // After all `localMax` slides have been revealed, we probe the NEXT slide:
  // if its export image loads successfully, we expand `localMax` and keep going.
  // This means thumbnails self-discover the true slide count without relying
  // on a separate async scan running on a different page/component.
  //
  const [revealedCount, setRevealedCount] = useState(1);
  const [localMax, setLocalMax] = useState(() => Math.max(effectiveCount, 1));
  const probeImgRef = useRef<HTMLImageElement | null>(null);
  const probeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync localMax upward when external effectiveCount grows (e.g. MATERIAL_ADD broadcast)
  useEffect(() => {
    setLocalMax((prev) => Math.max(prev, effectiveCount));
  }, [effectiveCount]);

  // Reset everything when switching to a different material
  useEffect(() => {
    setRevealedCount(1);
    setLocalMax(Math.max(effectiveCount, 1));
    if (timerRef.current) clearTimeout(timerRef.current);
    if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current);
    if (probeImgRef.current) {
      probeImgRef.current.onload = null;
      probeImgRef.current.onerror = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material?.id]);

  // Sequential reveal timer — increments revealedCount by 1 every LOAD_INTERVAL ms
  useEffect(() => {
    if (isPdf || revealedCount >= localMax) return;
    timerRef.current = setTimeout(() => {
      setRevealedCount((prev) => Math.min(prev + 1, localMax));
    }, LOAD_INTERVAL);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [revealedCount, localMax, isPdf]);

  // Self-discovering probe — once all current slides are revealed and this is
  // a Google Slides presentation, attempt to load the NEXT slide image.
  // • Load succeeds → there IS a next slide; expand localMax by 1 and continue.
  // • Load fails / times out → we've reached the end of the deck.
  useEffect(() => {
    if (isPdf || !googlePresentationId) return;
    if (revealedCount < localMax) return; // Still revealing known slides

    const nextPage = localMax + 1;
    if (nextPage > 120) return; // Absolute safety cap

    // Abort any in-progress probe before starting a new one
    if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current);
    if (probeImgRef.current) {
      probeImgRef.current.onload = null;
      probeImgRef.current.onerror = null;
    }

    const img = new Image();
    probeImgRef.current = img;

    probeTimeoutRef.current = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      // Probe timed out → treat as end of deck
    }, 6000) as unknown as NodeJS.Timeout;

    img.onload = () => {
      if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current);
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        // Slide exists — expand local max so the reveal timer picks it up
        setLocalMax((prev) => Math.max(prev, nextPage));
      }
    };
    img.onerror = () => {
      if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current);
      // Image failed → no slide at nextPage, stop probing
    };
    img.src = `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${nextPage}`;

    return () => {
      if (probeTimeoutRef.current) clearTimeout(probeTimeoutRef.current);
      img.onload = null;
      img.onerror = null;
    };
  }, [revealedCount, localMax, googlePresentationId, isPdf]);

  // ── Conditional early returns (after all hooks) ───────────────────────────
  if (!material || !material.slides || material.slides.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
        Belum ada materi presentasi yang dimuat.
      </div>
    );
  }

  // ── PDF / PPTX path: delegate to PdfThumbnailList ────────────────────────
  // PPTX is served as a converted PDF via /api/material/asset, so PdfSlideViewer
  // and PdfThumbnailItem render its slides identically to a native PDF upload.
  if (isPdf) {
    return (
      <div className="overflow-y-auto max-h-[calc(100vh-160px)] pr-1 custom-scrollbar">
        <PdfThumbnailList
          material={material}
          currentPage={currentPage}
          onSelectSlide={onSelectSlide}
          deviceId={deviceId}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Non-PDF path (Google Slides, PPTX, image, etc.)
  // ─────────────────────────────────────────────────────────────────────────

  const displaySlides = Array.from({ length: localMax }, (_, i) => {
    const slideIdx = i + 1;
    return (
      material.slides?.[i] || {
        index: slideIdx,
        title: `Slide ${slideIdx}`,
        url: rawUrl,
        contentUrl: rawUrl,
      }
    );
  });

  const showDiscoveryBanner = Boolean(
    isDiscoveringSlides &&
      placeholderCount &&
      placeholderCount > (material.slides?.length || 0)
  );

  return (
    <div>
      {showDiscoveryBanner ? (
        <div className="mb-3 rounded-2xl border border-purple-500/20 bg-purple-950/20 p-3 shadow-inner">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
            <span>Preparing previews</span>
            <span>{placeholderCount} slides</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-violet-500" />
          </div>
        </div>
      ) : null}

      <div
        className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[calc(100vh-160px)] pr-1 custom-scrollbar"
        ref={containerRef}
      >
        {displaySlides.map((slide) => {
          // A thumbnail URL is only assigned once this slide's index has been
          // "revealed" by the sequential timer — guaranteeing 1→2→3 order.
          const isRevealed = slide.index <= revealedCount;
          const isSelected = slide.index === currentPage;

          const googleThumbnailUrl =
            isRevealed && googlePresentationId
              ? `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${slide.index}`
              : null;
          const thumbnailUrl = isRevealed ? slide.thumbnailUrl || googleThumbnailUrl : null;

          return (
            <ThumbnailItem
              key={slide.index}
              slide={slide}
              isSelected={isSelected}
              thumbnailUrl={thumbnailUrl ?? null}
              googlePresentationId={googlePresentationId}
              onSelectSlide={onSelectSlide}
            />
          );
        })}
      </div>
    </div>
  );
}
