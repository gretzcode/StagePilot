"use client";

import React from "react";
import { useAspectFit, AspectFitResult } from "../hooks/useAspectFit";
import { PresentationZoomState } from "@/core/types";

interface PresentationStageProps {
  contentWidth?: number;
  contentHeight?: number;
  zoom?: PresentationZoomState;
  children: (fit: AspectFitResult) => React.ReactNode;
  className?: string;
  stageClassName?: string;
}

/**
 * PresentationStage wraps any presentation renderer (PDF, Slide, Video, Image)
 * in an outer responsive container, calculating the exact boundary box based on:
 *   scale = min(containerWidth / contentWidth, containerHeight / contentHeight)
 *
 * This ensures that portrait, landscape, A4, 16:9, 4:3, or custom aspect ratios
 * are ALWAYS 100% visible inside the container without cropping or distortion.
 */
export function PresentationStage({
  contentWidth = 1920,
  contentHeight = 1080,
  zoom,
  children,
  className = "",
  stageClassName = "",
}: PresentationStageProps) {
  const fit = useAspectFit(contentWidth, contentHeight);

  const zoomScale = zoom?.scale || 1.0;
  const panX = zoom?.panX || 0;
  const panY = zoom?.panY || 0;

  const zoomStyle: React.CSSProperties = {
    transform: `scale(${zoomScale}) translate(${panX}%, ${panY}%)`,
    transformOrigin: "center center",
    transition: "transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
    willChange: "transform",
  };

  return (
    <div
      ref={fit.containerRef}
      className={`w-full h-full relative overflow-hidden flex items-center justify-center select-none bg-slate-950 ${className}`}
    >
      <div
        style={fit.style}
        className={`relative flex items-center justify-center overflow-hidden shrink-0 shadow-2xl transition-[width,height] duration-75 ${stageClassName}`}
      >
        <div style={zoomStyle} className="w-full h-full relative flex items-center justify-center">
          {children(fit)}
        </div>
      </div>
    </div>
  );
}
