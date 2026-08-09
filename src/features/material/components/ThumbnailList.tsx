"use client";

import { Material } from "@/core/types";
import { Play } from "lucide-react";

interface ThumbnailListProps {
  material: Material | null;
  currentPage: number;
  onSelectSlide: (pageNumber: number) => void;
}

export function ThumbnailList({ material, currentPage, onSelectSlide }: ThumbnailListProps) {
  if (!material || !material.slides || material.slides.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
        Belum ada materi presentasi yang dimuat.
      </div>
    );
  }

  const rawUrl = material.externalUrl || material.url || "";
  const match = rawUrl.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
  const googlePresentationId = match ? match[1] : null;

  const effectiveCount = Math.max(
    material.totalPages || 1,
    material.slides?.length || 1,
    currentPage + 1
  );

  const displaySlides = Array.from({ length: effectiveCount }, (_, i) => {
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

  return (
    <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[calc(100vh-160px)] pr-1 custom-scrollbar">
      {displaySlides.map((slide) => {
        const isSelected = slide.index === currentPage;
        // Generate Google Slides page export image URL if presentationId exists
        const googleThumbnailUrl = googlePresentationId
          ? `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${slide.index}`
          : null;
        const thumbnailUrl = slide.thumbnailUrl || googleThumbnailUrl;

        return (
          <button
            key={slide.index}
            onClick={() => onSelectSlide(slide.index)}
            className={`w-full text-left rounded-2xl border transition-all duration-200 group overflow-hidden relative ${
              isSelected
                ? "border-purple-500 ring-2 ring-purple-500/40 bg-purple-950/30 shadow-xl"
                : "border-slate-800/90 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800/60"
            }`}
          >
            {/* 16:9 Aspect Ratio Mini Slide Preview Canvas */}
            <div className="w-full aspect-video bg-slate-950 relative flex flex-col justify-between p-3 overflow-hidden border-b border-slate-800/60">
              {thumbnailUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnailUrl}
                    alt={slide.title || `Slide ${slide.index}`}
                    onError={(e) => {
                      // Fallback if direct image export is blocked
                      (e.target as HTMLElement).style.display = "none";
                    }}
                    className="absolute inset-0 w-full h-full object-cover z-0"
                  />
                  {/* Gradient overlay for readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-slate-950/60 z-0" />
                </>
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
                <div className="space-y-1 z-10 my-auto relative">
                  <div className={`h-2.5 rounded-sm w-3/4 ${isSelected ? "bg-purple-400/80" : "bg-slate-700/80"}`} />
                  <div className="h-1.5 rounded-sm w-1/2 bg-slate-800" />
                  <div className="h-1.5 rounded-sm w-2/3 bg-slate-800/60" />
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
      })}
    </div>
  );
}
