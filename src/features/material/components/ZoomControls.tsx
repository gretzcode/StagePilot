"use client";

import React from "react";
import { ZoomIn, ZoomOut, RotateCcw, Scan } from "lucide-react";
import { PresentationZoomState } from "@/core/types";

interface ZoomControlsProps {
  zoom?: PresentationZoomState;
  isZoomAreaActive?: boolean;
  onToggleZoomArea?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  className?: string;
}

export function ZoomControls({
  zoom = { scale: 1.0, panX: 0, panY: 0 },
  isZoomAreaActive = false,
  onToggleZoomArea,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  className = "",
}: ZoomControlsProps) {
  const scale = zoom.scale || 1.0;
  const isZoomed = scale > 1.0;
  const percentText = `${Math.round(scale * 100)}%`;

  return (
    <div
      className={`inline-flex items-center gap-1 bg-slate-900/90 hover:bg-slate-900 backdrop-blur-md border border-slate-800/90 text-white rounded-xl p-1 shadow-2xl transition-all duration-200 select-none z-30 ${className}`}
      role="group"
      aria-label="Material Zoom Controls"
    >
      {/* Zoom Area Box-Selection Mode Toggle */}
      {onToggleZoomArea && (
        <button
          type="button"
          onClick={onToggleZoomArea}
          className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
            isZoomAreaActive
              ? "bg-purple-600 text-white shadow-md ring-2 ring-purple-400/80 animate-pulse"
              : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white"
          }`}
          title={isZoomAreaActive ? "Batal Pilih Area (ESC)" : "Pilih Area Zoom (Drag Kotak)"}
          aria-label="Zoom Area Selection"
        >
          <Scan className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Zoom Out Button */}
      <button
        type="button"
        onClick={onZoomOut}
        disabled={scale <= 1.0}
        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800/80 text-slate-300 hover:text-white transition cursor-pointer disabled:cursor-not-allowed"
        title="Zoom Out (-25%)"
        aria-label="Zoom Out"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>

      {/* Zoom Percentage / Quick Reset Trigger */}
      <button
        type="button"
        onClick={onZoomReset}
        disabled={!isZoomed}
        className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold transition flex items-center gap-1 ${
          isZoomed
            ? "bg-purple-600/30 border border-purple-500/50 text-purple-200 hover:bg-purple-600/40 cursor-pointer shadow-sm"
            : "text-slate-400 cursor-default"
        }`}
        title={isZoomed ? "Click to Reset Zoom (100%)" : "Zoom 100%"}
      >
        <span>{percentText}</span>
      </button>

      {/* Zoom In Button */}
      <button
        type="button"
        onClick={onZoomIn}
        disabled={scale >= 5.0}
        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800/80 text-slate-300 hover:text-white transition cursor-pointer disabled:cursor-not-allowed"
        title="Zoom In (+25%)"
        aria-label="Zoom In"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      {/* Dedicated Reset Button if Zoomed */}
      {isZoomed && (
        <button
          type="button"
          onClick={onZoomReset}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 transition cursor-pointer ml-0.5"
          title="Reset Zoom to 100%"
          aria-label="Reset Zoom"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
