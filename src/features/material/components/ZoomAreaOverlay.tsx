"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { NormalizedZoomRegion } from "@/core/types";

interface ZoomAreaOverlayProps {
  isActive: boolean;
  onSelectRegion: (region: NormalizedZoomRegion) => void;
  onCancel?: () => void;
  className?: string;
}

interface DragPoint {
  x: number;
  y: number;
}

export function ZoomAreaOverlay({
  isActive,
  onSelectRegion,
  onCancel,
  className = "",
}: ZoomAreaOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPoint, setStartPoint] = useState<DragPoint | null>(null);
  const [currentPoint, setCurrentPoint] = useState<DragPoint | null>(null);

  // Handle ESC key to cancel Zoom Area mode
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDragging(false);
        setStartPoint(null);
        setCurrentPoint(null);
        onCancel?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onCancel]);

  const getRelativeCoordinates = useCallback((e: React.PointerEvent<HTMLDivElement>): DragPoint => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    return { x, y };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isActive || e.button !== 0) return;
    const point = getRelativeCoordinates(e);
    setIsDragging(true);
    setStartPoint(point);
    setCurrentPoint(point);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !isActive) return;
    const point = getRelativeCoordinates(e);
    setCurrentPoint(point);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !isActive || !startPoint || !currentPoint || !containerRef.current) {
      setIsDragging(false);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const rect = containerRef.current.getBoundingClientRect();
    const minX = Math.min(startPoint.x, currentPoint.x);
    const minY = Math.min(startPoint.y, currentPoint.y);
    const boxW = Math.abs(currentPoint.x - startPoint.x);
    const boxH = Math.abs(currentPoint.y - startPoint.y);

    setIsDragging(false);
    setStartPoint(null);
    setCurrentPoint(null);

    // Filter out accidental clicks (minimum 12px box)
    if (boxW >= 12 && boxH >= 12 && rect.width > 0 && rect.height > 0) {
      const normX = minX / rect.width;
      const normY = minY / rect.height;
      const normWidth = boxW / rect.width;
      const normHeight = boxH / rect.height;

      onSelectRegion({
        x: normX,
        y: normY,
        width: normWidth,
        height: normHeight,
      });
    }
  };

  if (!isActive) return null;

  // Calculate current selection rectangle dimensions
  let rectStyle: React.CSSProperties | null = null;
  let approximateScale = 1;

  if (isDragging && startPoint && currentPoint) {
    const left = Math.min(startPoint.x, currentPoint.x);
    const top = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);

    rectStyle = {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };

    if (containerRef.current) {
      const cRect = containerRef.current.getBoundingClientRect();
      if (cRect.width > 0 && cRect.height > 0 && width > 0 && height > 0) {
        const normW = width / cRect.width;
        const normH = height / cRect.height;
        approximateScale = Math.max(1, Math.min(5, Math.round(Math.min(1 / normW, 1 / normH) * 10) / 10));
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`absolute inset-0 z-40 cursor-crosshair select-none touch-none bg-indigo-950/10 backdrop-blur-[0.5px] transition-colors ${className}`}
      title="Click & Drag to Zoom Area (ESC to cancel)"
    >
      {/* Top Banner Guide when inactive drag */}
      {!isDragging && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-purple-500/40 text-purple-200 text-[11px] font-mono font-semibold px-3 py-1 rounded-full shadow-2xl pointer-events-none flex items-center gap-2 animate-bounce">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
          <span>DRAG AREA UNTUK ZOOM (ESC UNTUK BATAL)</span>
        </div>
      )}

      {/* Render Active Selection Rectangle */}
      {rectStyle && (
        <div
          style={rectStyle}
          className="absolute border-2 border-purple-400 border-dashed bg-purple-600/25 shadow-2xl rounded-[2px] pointer-events-none transition-none flex flex-col justify-between p-1 ring-2 ring-purple-500/30"
        >
          {/* Corner Guides */}
          <div className="flex justify-between w-full pointer-events-none">
            <div className="w-1.5 h-1.5 bg-purple-300 rounded-xs -mt-1 -ml-1 shadow-sm" />
            <div className="w-1.5 h-1.5 bg-purple-300 rounded-xs -mt-1 -mr-1 shadow-sm" />
          </div>

          {/* Center Estimated Zoom Badge */}
          <div className="self-center bg-slate-900/95 border border-purple-400 text-purple-200 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg">
            {approximateScale > 1 ? `${Math.round(approximateScale * 100)}% ZOOM` : "SELECTING..."}
          </div>

          <div className="flex justify-between w-full pointer-events-none">
            <div className="w-1.5 h-1.5 bg-purple-300 rounded-xs -mb-1 -ml-1 shadow-sm" />
            <div className="w-1.5 h-1.5 bg-purple-300 rounded-xs -mb-1 -mr-1 shadow-sm" />
          </div>
        </div>
      )}
    </div>
  );
}
