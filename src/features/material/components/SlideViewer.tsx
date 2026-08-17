"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Material, MediaPlaybackState, SlideMetadata } from "@/core/types";
import { PdfSlideViewer } from "./PdfSlideViewer";
import { SyncVideoPlayer } from "./SyncVideoPlayer";

interface SlideViewerProps {
  material: Material | null;
  slide: SlideMetadata | null;
  currentSlide?: number;
  currentPage?: number;
  blanked?: boolean;
  role?: "control" | "audience" | "confidence";
  /** Called when the real PDF page count is discovered from PDF.js */
  onNumPagesDiscovered?: (numPages: number) => void;
  deviceId?: string;
  mediaState?: MediaPlaybackState;
  onMediaPlay?: (currentTime?: number) => void;
  onMediaPause?: (currentTime?: number) => void;
  onMediaSeek?: (targetTime: number) => void;
  onMediaStop?: () => void;
  onMediaDurationDiscovered?: (duration: number) => void;
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

// ─── Double-buffer layer state ────────────────────────────────────────────────
// We maintain exactly two image layers (A and B). One is always "front"
// (opacity 1, currently displayed). The other is "back" (opacity 0, loading
// the next slide). On page change, we write the new URL into the back layer
// and crossfade when it fires onLoad — so the front layer NEVER goes blank.
interface LayerState {
  a: string | null;
  b: string | null;
  front: "a" | "b";
}

function appendAssetAccessParams(url: string, deviceId?: string): string {
  if (!deviceId || !url.startsWith("/api/material/asset")) return url;
  const [path, hash = ""] = url.split("#");
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}deviceId=${encodeURIComponent(deviceId)}${hash ? `#${hash}` : ""}`;
}

export function SlideViewer({
  material,
  slide,
  currentSlide,
  currentPage,
  blanked,
  role,
  onNumPagesDiscovered,
  deviceId,
  mediaState,
  onMediaPlay,
  onMediaPause,
  onMediaSeek,
  onMediaStop,
  onMediaDurationDiscovered,
}: SlideViewerProps) {
  const activeSlide = currentSlide ?? currentPage ?? 1;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [renderError, _setRenderError] = useState<string | null>(null);

  const rawUrl = appendAssetAccessParams(material?.externalUrl || material?.url || "", deviceId);
  const isGoogleSlides = rawUrl.includes("docs.google.com/presentation");

  const match = rawUrl.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
  const googlePresentationId = match ? match[1] : null;

  // Target Google Slides PNG export URL for the current page
  const targetGoogleSlideImg = googlePresentationId
    ? `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${activeSlide}`
    : null;

  // ── Double-buffer crossfade state ─────────────────────────────────────────
  const [layers, setLayers] = useState<LayerState>({
    a: targetGoogleSlideImg,
    b: null,
    front: "a",
  });
  const [useFallbackIframe, setUseFallbackIframe] = useState(false);

  // Ref always holds the latest target URL so stale-closure onLoad checks work
  const latestTargetRef = useRef<string | null>(targetGoogleSlideImg);

  // Prefetch tracking
  const [prefetchQueue, setPrefetchQueue] = useState<number[]>([]);
  const [prefetchedPages, setPrefetchedPages] = useState<number[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loadingPage, setLoadingPage] = useState<number | null>(null);

  // 1. Sequential prefetch: load upcoming slides into browser cache with a
  //    safe delay so we don't hammer the API on every page change.
  useEffect(() => {
    if (!googlePresentationId || !material?.totalPages || material.totalPages <= 1) return;

    const pendingPages = Array.from({ length: material.totalPages }, (_, index) => index + 1).filter(
      (page) => page !== activeSlide && !prefetchedPages.includes(page) && page <= activeSlide + MAX_PREFETCH_AHEAD
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
  }, [googlePresentationId, activeSlide, material?.totalPages, prefetchedPages, prefetchQueue]);

  // 2. Double-buffer slide transition engine.
  //    When targetGoogleSlideImg changes, write the new URL into the BACK layer
  //    and wait for onLoad. If the image is already cached, onLoad fires
  //    near-instantly → no visible delay. The FRONT layer remains fully opaque
  //    throughout, so there is never a black frame.
  useEffect(() => {
    if (!targetGoogleSlideImg) return;
    latestTargetRef.current = targetGoogleSlideImg;
    setUseFallbackIframe(false);

    setLayers((prev) => {
      // Already showing this slide? No-op.
      if (prev[prev.front] === targetGoogleSlideImg) return prev;

      const back: "a" | "b" = prev.front === "a" ? "b" : "a";

      // Back layer already holds this URL (from a prefetch that just completed)?
      // → Crossfade immediately without waiting for an onLoad.
      if (prev[back] === targetGoogleSlideImg) {
        return { ...prev, front: back };
      }

      // Otherwise, write the new URL into the back layer and let onLoad trigger
      // the crossfade once the image is fetched (or served from browser cache).
      return { ...prev, [back]: targetGoogleSlideImg };
    });
  }, [targetGoogleSlideImg]);

  // Called when either image layer finishes loading.
  // If the loaded layer contains the current target slide and is still in the
  // back position, crossfade it to the front.
  const handleLayerLoad = useCallback((layer: "a" | "b") => {
    setLayers((prev) => {
      if (prev[layer] === latestTargetRef.current && layer !== prev.front) {
        return { ...prev, front: layer };
      }
      return prev;
    });
  }, []);

  const persistentIframeSrc = useMemo(() => {
    if (isGoogleSlides && googlePresentationId) {
      return `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false#slide=id.p${activeSlide}`;
    }
    return rawUrl;
  }, [activeSlide, googlePresentationId, isGoogleSlides, rawUrl]);

  // 4. Reactive fallback iframe update engine for the rare cases where PNG export is blocked.
  useEffect(() => {
    if (useFallbackIframe && isGoogleSlides && googlePresentationId && iframeRef.current) {
      const targetSrc = `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false&delayms=60000#slide=id.p${activeSlide}`;
      if (iframeRef.current.src !== targetSrc) {
        iframeRef.current.src = targetSrc;
      }
    }
  }, [activeSlide, isGoogleSlides, googlePresentationId, useFallbackIframe]);

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

  const resolvedMediaType = material.mediaType ?? material.type;

  // PDF files are served as PDF binary via /api/material/asset.
  if (resolvedMediaType === "pdf" || material.type === "pdf") {
    const pdfAssetUrl = appendAssetAccessParams(slide?.contentUrl || material.url || "", deviceId);
    return (
      <PdfSlideViewer
        url={pdfAssetUrl}
        currentSlide={activeSlide}
        role={role}
        title={material.name}
        onNumPagesDiscovered={onNumPagesDiscovered}
      />
    );
  }

  if (resolvedMediaType === "video" || material.type === "video") {
    const videoUrl = slide?.contentUrl || material.url || rawUrl;
    return (
      <SyncVideoPlayer
        url={videoUrl}
        role={role}
        mediaState={mediaState}
        onMediaPlay={onMediaPlay}
        onMediaPause={onMediaPause}
        onMediaSeek={onMediaSeek}
        onMediaStop={onMediaStop}
        onDurationDiscovered={onMediaDurationDiscovered}
      />
    );
  }

  if (material.type === "url" || material.type === "canva") {
    // ── Google Slides: double-buffer crossfade rendering ──────────────────────
    if (isGoogleSlides && googlePresentationId && !useFallbackIframe) {
      return (
        <div className="w-full h-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
          <div
            className={`w-full h-full relative flex items-center justify-center ${
              role !== "control" ? "pointer-events-none" : ""
            }`}
          >
            {/* Two image layers stacked on top of each other.
                The "front" layer is fully opaque; the "back" layer is invisible
                while it loads the next slide. When the back layer fires onLoad,
                both layers' opacities are swapped — a smooth crossfade with
                zero black frames between slides. */}
            {(["a", "b"] as const).map((layer) => (
              <img
                key={layer}
                src={layers[layer] ?? undefined}
                alt={layer === layers.front ? material.name : undefined}
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  opacity: layers.front === layer ? 1 : 0,
                  // 220ms is imperceptibly short in live presentation but long
                  // enough to suppress any browser-repaint flicker.
                  transition: "opacity 220ms ease-in-out",
                  // Only the front layer should receive pointer events
                  pointerEvents: layers.front === layer ? "auto" : "none",
                }}
                onLoad={() => handleLayerLoad(layer)}
                onError={() => setUseFallbackIframe(true)}
              />
            ))}
          </div>
        </div>
      );
    }

    // ── Google Slides iframe fallback (when PNG export is blocked) ────────────
    if (useFallbackIframe && isGoogleSlides && googlePresentationId) {
      const embedUrl = `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false&delayms=60000#slide=id.p${activeSlide}`;
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

    // ── Canva Connect API: Native Slide Image Rendering (100% Synced) ───────
    if (material.type === "canva") {
      const activeSlideData = slide || material.slides?.[activeSlide - 1] || material.slides?.[0];
      const slideImageUrl = activeSlideData?.contentUrl || material.metadata?.thumbnailUrl || activeSlideData?.thumbnailUrl;

      if (slideImageUrl && !slideImageUrl.includes("/design/") && !slideImageUrl.includes("/view")) {
        return (
          <div className="w-full h-full bg-slate-950 flex items-center justify-center p-2 sm:p-4 overflow-hidden select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={slideImageUrl}
              alt={activeSlideData?.title || `${material.name} — Slide ${activeSlide}`}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-150"
            />
          </div>
        );
      }

      // If Canva material has no exported slide assets yet
      return (
        <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400 font-bold text-lg mb-3">
            C
          </div>
          <h3 className="text-base font-bold text-white mb-1">{material.name}</h3>
          <p className="text-xs text-slate-400 max-w-md mb-4">
            Slide {activeSlide} of {material.totalPages || 1}
          </p>
          <span className="text-[11px] font-mono text-purple-400 bg-purple-950/60 px-3 py-1 rounded-full border border-purple-800/50">
            Canva Native Presentation Mode Active
          </span>
        </div>
      );
    }

    // ── Generic iframe (web embeds) ──────────────────────────────────────────
    const sandboxAttrs = "allow-scripts allow-same-origin allow-popups allow-forms";

    return (
      <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center">
        <div
          className={`w-full h-full relative ${role !== "control" ? "pointer-events-none select-none" : ""}`}
        >
          <iframe
            ref={iframeRef}
            src={persistentIframeSrc}
            title={material.name}
            className="w-full h-full border-0 bg-slate-950 z-10"
            sandbox={sandboxAttrs}
            allowFullScreen
            allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    );
  }

  if (resolvedMediaType === "image" || material.type === "image") {
    return (
      <div className="w-full h-full bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide?.contentUrl || material.url || rawUrl}
          alt={material.name}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity duration-150"
        />
      </div>
    );
  }

  if (renderError) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-8 text-center text-rose-400">
        <span className="text-xs uppercase font-mono tracking-widest mb-3">ERROR</span>
        <p className="text-sm">{renderError}</p>
        <p className="text-xs text-slate-500 mt-4">Please try a different presentation or reload the page</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center p-6 text-slate-300">
      <span className="text-sm uppercase tracking-[0.25em]">Unsupported material type: {resolvedMediaType}</span>
    </div>
  );
}

