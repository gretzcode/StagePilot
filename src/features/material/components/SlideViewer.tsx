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

export function SlideViewer({ material, slide, currentPage, blanked, role }: SlideViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const rawUrl = material?.externalUrl || material?.url || "";
  const isGoogleSlides = rawUrl.includes("docs.google.com/presentation");
  const isGoogleDrive = rawUrl.includes("drive.google.com");

  const match = rawUrl.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
  const googlePresentationId = match ? match[1] : null;

  // Target Google Slides PNG export URL
  const targetGoogleSlideImg = googlePresentationId
    ? `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${currentPage}`
    : null;

  // Currently displayed image URL on screen (Guards against black flash during long jumps e.g. slide 2 -> 20)
  const [displayedImgUrl, setDisplayedImgUrl] = useState<string | null>(targetGoogleSlideImg);

  // 1. Full Deck Background Pre-loader Worker: Pre-caches ALL slides (1 to N) into browser HTTP/RAM cache
  useEffect(() => {
    if (googlePresentationId && material?.totalPages && material.totalPages > 0) {
      // Pre-load all slides sequentially in background
      const maxToLoad = Math.min(material.totalPages, 100);
      for (let page = 1; page <= maxToLoad; page++) {
        const img = new Image();
        img.src = `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${page}`;
      }
    }
  }, [googlePresentationId, material?.totalPages]);

  // 2. Double-Buffered Image onLoad Guard: Swaps displayed image ONLY after new slide image finishes loading
  useEffect(() => {
    if (!targetGoogleSlideImg) return;

    // Check if target image is already in memory cache
    const imgPreload = new Image();
    imgPreload.src = targetGoogleSlideImg;

    if (imgPreload.complete) {
      setDisplayedImgUrl(targetGoogleSlideImg);
    } else {
      imgPreload.onload = () => {
        setDisplayedImgUrl(targetGoogleSlideImg);
      };
    }
  }, [targetGoogleSlideImg]);

  // Single persistent base iframe URL for Control Room
  const persistentIframeSrc = isGoogleSlides && googlePresentationId
    ? `https://docs.google.com/presentation/d/${googlePresentationId}/embed?rm=minimal&start=false&loop=false#slide=id.p${currentPage}`
    : rawUrl;

  // In-place postMessage / location update for Google Slides iframe in Control Room
  useEffect(() => {
    if (isGoogleSlides && iframeRef.current?.contentWindow) {
      try {
        const targetHash = `#slide=id.p${currentPage}`;
        iframeRef.current.contentWindow.location.replace(
          `${iframeRef.current.src.split("#")[0]}${targetHash}`
        );
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ gslides: "slide", page: currentPage, slide: currentPage }),
          "*"
        );
      } catch {
        // Cross-origin fallback
      }
    }
  }, [currentPage, isGoogleSlides]);

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

  if (material.type === "url" || material.type === "canva") {
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
        {/* Container clipping mask crops Google Slides bottom control bar */}
        <div className="w-full h-full relative" style={isGoogleSlides ? { clipPath: "inset(0 0 32px 0)" } : undefined}>
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
