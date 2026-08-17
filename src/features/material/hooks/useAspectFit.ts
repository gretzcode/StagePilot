"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface AspectFitResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerWidth: number;
  containerHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  scale: number;
  style: React.CSSProperties;
}

/**
 * Universal Presentation Aspect-Ratio Sizing Hook.
 * Calculates exact rendered dimensions based on:
 *   scale = min(containerWidth / contentWidth, containerHeight / contentHeight)
 *   renderedWidth  = contentWidth  * scale
 *   renderedHeight = contentHeight * scale
 *
 * Guarantees zero cropping and zero distortion for any aspect ratio (landscape, portrait, A4, etc.).
 */
export function useAspectFit(
  contentWidth: number = 1920,
  contentHeight: number = 1080
): AspectFitResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const updateSize = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width > 0 && height > 0) {
      setContainerSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    }
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          const w = Math.floor(width);
          const h = Math.floor(height);
          if (w > 0 && h > 0) {
            setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
          }
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
  }, [updateSize]);

  const { width: cW, height: cH } = containerSize;

  const validContentW = contentWidth > 0 ? contentWidth : 1920;
  const validContentH = contentHeight > 0 ? contentHeight : 1080;

  let renderedWidth = validContentW;
  let renderedHeight = validContentH;
  let scale = 1;

  if (cW > 0 && cH > 0) {
    scale = Math.min(cW / validContentW, cH / validContentH);
    renderedWidth = Math.max(1, Math.floor(validContentW * scale));
    renderedHeight = Math.max(1, Math.floor(validContentH * scale));
  }

  const style: React.CSSProperties = {
    width: renderedWidth > 0 && cW > 0 ? `${renderedWidth}px` : "100%",
    height: renderedHeight > 0 && cH > 0 ? `${renderedHeight}px` : "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    aspectRatio: `${validContentW} / ${validContentH}`,
  };

  return {
    containerRef,
    containerWidth: cW,
    containerHeight: cH,
    renderedWidth,
    renderedHeight,
    scale,
    style,
  };
}
