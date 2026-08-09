"use client";

import { useState, useEffect, useRef } from "react";
import { Material, SlideMetadata } from "@/core/types";

interface SlideViewerProps {
  material: Material | null;
  slide: SlideMetadata | null;
  currentPage: number;
  blanked?: boolean;
  role?: "control" | "audience" | "confidence";
}

// Global Memory-Mapped RAM Cache for Slide Images (0ms Sync Retrieval)
const slideImageMemoryCache = new Map<string, HTMLImageElement>();

function preloadSlideImage(url: string): HTMLImageElement {
  if (slideImageMemoryCache.has(url)) {
    return slideImageMemoryCache.get(url)!;
  }
  const img = new Image();
  img.src = url;
  slideImageMemoryCache.set(url, img);
  return img;
}

export function SlideViewer({ material, slide, currentPage, blanked, role }: SlideViewerProps) {
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

  // 1. High-Priority Proximal Pre-fetch Engine (N+1, N+2, N-1) for 0ms transitions
  useEffect(() => {
    if (!googlePresentationId || !material?.totalPages || material.totalPages <= 0) return;

    // Prioritize immediate next & previous slides first
    const pagesToPreload = [currentPage + 1, currentPage + 2, currentPage - 1, currentPage + 3].filter(
      (p) => p >= 1 && p <= material.totalPages
    );

    pagesToPreload.forEach((p) => {
      const url = `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${p}`;
      preloadSlideImage(url);
    });

    // Background pre-fetch remaining deck slides
    const maxToLoad = Math.min(material.totalPages, 100);
    for (let page = 1; page <= maxToLoad; page++) {
      const url = `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${page}`;
      preloadSlideImage(url);
    }
  }, [googlePresentationId, currentPage, material?.totalPages]);

  // 2. Synchronous Instant Image Swap Engine (0ms Lag Response)
  useEffect(() => {
    if (!targetGoogleSlideImg) return;

    const cachedImg = preloadSlideImage(targetGoogleSlideImg);
    if (cachedImg.complete) {
      setDisplayedImgUrl(targetGoogleSlideImg);
    } else {
      cachedImg.onload = () => {
        setDisplayedImgUrl(targetGoogleSlideImg);
      };
    }
  }, [targetGoogleSlideImg]);

  // 3. Persistent Base Iframe URL (Avoids iframe re-mounts on slide change)
  if (isGoogleSlides && googlePresentationId && !baseIframeSrc.current) {
    baseIframeSrc.current = `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false#slide=id.p${currentPage}`;
  } else if (isGoogleDrive && googleFileId && !baseIframeSrc.current) {
    baseIframeSrc.current = `https://drive.google.com/file/d/${googleFileId}/preview#page=${currentPage}&zoom=page-fit&toolbar=0&navpanes=0`;
  }
  const persistentIframeSrc = baseIframeSrc.current || rawUrl;

  // 4. Ultra-Fast Hash & postMessage Update for Control Room Iframe
  useEffect(() => {
    if (isGoogleSlides && iframeRef.current?.contentWindow) {
      try {
        const targetHash = `#slide=id.p${currentPage}`;
        iframeRef.current.contentWindow.location.hash = targetHash;
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ gslides: "slide", page: currentPage, slide: currentPage }),
          "*"
        );
      } catch {
        // Cross-origin fallback
      }
    } else if (isGoogleDrive && googleFileId && iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.location.replace(
          `https://drive.google.com/file/d/${googleFileId}/preview#page=${currentPage}&zoom=page-fit&toolbar=0&navpanes=0`
        );
      } catch {
        // Cross-origin fallback
      }
    }
  }, [currentPage, isGoogleSlides, isGoogleDrive, googleFileId]);

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

  if (material.type === "url" || material.type === "canva" || material.type === "pdf") {
    // Audience & Confidence Displays: Render Pre-cached Full Deck HD Image Feed with onLoad Guard
    if (isGoogleSlides && (displayedImgUrl || targetGoogleSlideImg) && role !== "control") {
      return (
        <div className="w-full h-full bg-slate-950 flex items-center justify-center p-0 overflow-hidden relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayedImgUrl || targetGoogleSlideImg || ""}
            alt={`${material.name} - Slide ${currentPage}`}
            className="w-full h-full object-contain z-10 transition-opacity duration-150"
          />
        </div>
      );
    }

    return (
      <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col items-center justify-center">
        {/* Container clipping mask crops Google Slides bottom control bar & Google Drive PDF top bar */}
        <div
          className={`w-full h-full relative ${role !== "control" ? "pointer-events-none" : ""}`}
          style={
            isGoogleSlides
              ? { clipPath: "inset(0 0 32px 0)" }
              : isGoogleDrive
              ? { clipPath: "inset(48px 0 0 0)" }
              : undefined
          }
        >
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
