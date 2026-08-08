"use client";

import { Material } from "@/core/types";

interface ThumbnailListProps {
  material: Material | null;
  currentPage: number;
  onSelectSlide: (pageNumber: number) => void;
}

export function ThumbnailList({ material, currentPage, onSelectSlide }: ThumbnailListProps) {
  if (!material || !material.slides || material.slides.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
        No active material deck loaded.
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
      {material.slides.map((slide) => {
        const isSelected = slide.index === currentPage;
        return (
          <button
            key={slide.index}
            onClick={() => onSelectSlide(slide.index)}
            className={`w-full p-2.5 rounded-xl border text-left flex items-center space-x-3 transition ${
              isSelected
                ? "bg-purple-600/20 border-purple-500 shadow-md"
                : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
              isSelected ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400"
            }`}>
              {slide.index}
            </div>

            <div className="flex-1 min-w-0">
              <h5 className={`text-xs font-semibold truncate ${isSelected ? "text-purple-300" : "text-slate-300"}`}>
                {slide.title || `Slide ${slide.index}`}
              </h5>
              {slide.notes && (
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{slide.notes}</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
