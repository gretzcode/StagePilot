"use client";

import { Material, SlideMetadata } from "@/core/types";

interface SlideViewerProps {
  material: Material | null;
  slide: SlideMetadata | null;
  currentPage: number;
  blanked?: boolean;
  role?: "control" | "audience" | "confidence";
}

export function SlideViewer({ material, slide, currentPage, blanked, role }: SlideViewerProps) {
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

  if (material.type === "url") {
    return (
      <div className="w-full h-full bg-slate-950 relative overflow-hidden flex flex-col">
        <iframe
          src={material.url}
          title={material.name}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-popups"
        />
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
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
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
