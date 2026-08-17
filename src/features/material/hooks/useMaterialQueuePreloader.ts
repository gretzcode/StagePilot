"use client";

import { useEffect } from "react";
import { Material } from "@/core/types";
import { appendAssetAccessParams } from "../validator";
import { preloadPdfDocument } from "./usePdfDocument";

/**
 * Background preloader hook that automatically pre-warms materials in queue.
 * For PDF materials, downloads and parses the document into memory in the background
 * so that when "Go Live" or "Present" is clicked, presentation starts instantly (0ms delay).
 */
export function useMaterialQueuePreloader(
  materials: Material[] | undefined,
  deviceId?: string,
  activeMaterialId?: string | null
): void {
  useEffect(() => {
    if (!materials || materials.length === 0 || typeof window === "undefined") return;

    // Use requestIdleCallback or setTimeout fallback to avoid competing with UI render thread
    const scheduleWarmup =
      typeof window.requestIdleCallback === "function"
        ? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 2000 })
        : (cb: () => void) => setTimeout(cb, 100);

    const cancelToken = scheduleWarmup(() => {
      materials.forEach((mat) => {
        // Phase D: Skip the currently presenting material to prevent duplicate parallel loading with PdfSlideViewer
        if (mat.id === activeMaterialId) return;

        if (mat.type === "pdf" && mat.url) {
          const targetUrl = appendAssetAccessParams(mat.url, deviceId);
          preloadPdfDocument(targetUrl).catch(() => {
            // Non-fatal background warm-up
          });
        }
      });
    });

    return () => {
      if (typeof window.cancelIdleCallback === "function" && typeof cancelToken === "number") {
        window.cancelIdleCallback(cancelToken);
      }
    };
  }, [materials, deviceId, activeMaterialId]);
}
