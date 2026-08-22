"use client";

import { useEffect, useRef, useCallback } from "react";
import { Material, StageSessionState, StageCommand } from "@/core/types";
import { appendAssetAccessParams } from "../validator";
import { preloadPdfDocument } from "./usePdfDocument";

const CACHE_NAME = "stagepilot-material-assets-v1";

// Module-level in-memory Blob Cache for 0ms instant buffering-free local playback
const materialBlobCache = new Map<string, { blob: Blob; blobUrl: string; size: number }>();

export function getCachedMaterialBlobUrl(key: string): string | null {
  if (!key) return null;
  const entry = materialBlobCache.get(key);
  return entry ? entry.blobUrl : null;
}

export function setCachedMaterialBlob(key: string, blob: Blob): string {
  const existing = materialBlobCache.get(key);
  if (existing) {
    try {
      URL.revokeObjectURL(existing.blobUrl);
    } catch {}
  }
  const blobUrl = URL.createObjectURL(blob);
  materialBlobCache.set(key, { blob, blobUrl, size: blob.size });
  return blobUrl;
}

export function hasCachedMaterialBlob(key: string): boolean {
  return materialBlobCache.has(key);
}

/**
 * Preload and warm up local browser cache for a given Material.
 * Downloads the ENTIRE file into local memory/Blob with real byte progress.
 * Supports PDF, Images, Google Slides, Canva, and Video.
 */
export async function warmMaterialAsset(
  material: Material,
  deviceId?: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (!material || typeof window === "undefined") return;

  onProgress?.(5);

  let cache: Cache | null = null;
  if ("caches" in window) {
    try {
      cache = await caches.open(CACHE_NAME);
    } catch {
      cache = null;
    }
  }

  try {
    // 1. PDF Materials
    if (material.type === "pdf") {
      const rawUrl = material.url || material.externalUrl || "";
      if (rawUrl) {
        const targetUrl = appendAssetAccessParams(rawUrl, deviceId);
        
        // 1. Preload via PDF.js worker
        await preloadPdfDocument(targetUrl).catch(() => null);
        onProgress?.(60);

        // 2. Pre-fetch binary into CacheStorage & Blob Cache if available
        if (targetUrl.startsWith("/")) {
          try {
            const res = await fetch(targetUrl);
            if (res.ok) {
              const blob = await res.blob();
              setCachedMaterialBlob(material.id, blob);
              setCachedMaterialBlob(targetUrl, blob);
              if (cache) {
                await cache.put(targetUrl, new Response(blob, {
                  headers: {
                    "Content-Type": blob.type || "application/pdf",
                    "Content-Length": String(blob.size),
                    "Accept-Ranges": "bytes",
                  },
                }));
              }
            }
          } catch {
            // Non-fatal cache write
          }
        }
      }
      onProgress?.(100);
      return;
    }

    // 2. Images, Canva, and Google Slides
    if (material.type === "image" || material.type === "canva" || material.type === "url") {
      const slides = material.slides || [];
      const total = Math.max(slides.length, 1);
      let loaded = 0;

      const slideUrls = slides
        .map((s) => s.contentUrl || s.url || s.thumbnailUrl)
        .filter((u): u is string => Boolean(u && !u.includes("/design/") && !u.includes("/view")));

      if (slideUrls.length === 0 && material.url) {
        slideUrls.push(material.url);
      }

      await Promise.all(
        slideUrls.map(async (url) => {
          try {
            // Preload Image Element into browser memory
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = url;
            });

            // Cache in CacheStorage if relative/local URL
            if (cache && url.startsWith("/")) {
              const match = await cache.match(url);
              if (!match) {
                const res = await fetch(url);
                if (res.ok) await cache.put(url, res);
              }
            }
          } catch {
            // Ignore individual slide failure
          } finally {
            loaded++;
            onProgress?.(Math.min(95, Math.round(10 + (loaded / total) * 85)));
          }
        })
      );

      onProgress?.(100);
      return;
    }

    // 3. Video Materials: Download the ENTIRE binary stream with real chunk-by-chunk progress
    if (material.type === "video") {
      const rawUrl = material.url || material.externalUrl || "";
      if (rawUrl && !rawUrl.includes("youtube.com") && !rawUrl.includes("youtu.be") && !rawUrl.includes("vimeo.com")) {
        const videoUrl = appendAssetAccessParams(rawUrl, deviceId);

        // If already cached in memory, report 100% immediately
        if (hasCachedMaterialBlob(material.id) || hasCachedMaterialBlob(videoUrl)) {
          onProgress?.(100);
          return;
        }

        const response = await fetch(videoUrl);
        if (!response.ok) {
          throw new Error(`Gagal mengunduh stream video (${response.status} ${response.statusText})`);
        }

        const contentLengthHeader = response.headers.get("content-length");
        const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : (material.sizeBytes || 0);

        if (!response.body) {
          const blob = await response.blob();
          setCachedMaterialBlob(material.id, blob);
          setCachedMaterialBlob(videoUrl, blob);
          onProgress?.(100);
          return;
        }

        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            if (totalBytes > 0) {
              const percent = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
              onProgress?.(percent);
            } else {
              const mb = receivedBytes / (1024 * 1024);
              onProgress?.(Math.min(95, Math.round(mb * 2)));
            }
          }
        }

        const blobMime = response.headers.get("content-type") || "video/mp4";
        const blob = new Blob(chunks, { type: blobMime });
        setCachedMaterialBlob(material.id, blob);
        setCachedMaterialBlob(videoUrl, blob);

        // Also store full response in CacheStorage if available
        if (cache && videoUrl.startsWith("/")) {
          try {
            await cache.put(videoUrl, new Response(blob, {
              headers: {
                "Content-Type": blobMime,
                "Content-Length": String(blob.size),
                "Accept-Ranges": "bytes",
              },
            }));
          } catch {}
        }
      }
      onProgress?.(100);
      return;
    }

    onProgress?.(100);
  } catch (err) {
    console.warn("[warmMaterialAsset] Error:", err);
    throw err;
  }
}

/**
 * Background preloader hook that automatically pre-warms materials in queue.
 */
export function useMaterialQueuePreloader(
  materials: Material[] | undefined,
  deviceId?: string,
  activeMaterialId?: string | null
): void {
  useEffect(() => {
    if (!materials || materials.length === 0 || typeof window === "undefined") return;

    const scheduleWarmup =
      typeof window.requestIdleCallback === "function"
        ? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 2000 })
        : (cb: () => void) => setTimeout(cb, 100);

    const cancelToken = scheduleWarmup(() => {
      materials.forEach((mat) => {
        if (mat.id === activeMaterialId) return;

        if (mat.type === "pdf" && mat.url) {
          const targetUrl = appendAssetAccessParams(mat.url, deviceId);
          preloadPdfDocument(targetUrl).catch(() => {});
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

/**
 * Hook that listens for explicit MATERIAL_PRECACHE_REQUEST broadcast commands
 * and reports progress/status back to the room state.
 */
export function useMaterialPrecacheListener(
  state: StageSessionState | null,
  dispatchCommand?: (type: StageCommand["type"], payload?: Record<string, unknown>) => void,
  deviceId?: string,
  deviceName = "Device",
  role = "display"
): void {
  const lastProcessedTimeRef = useRef<number>(0);
  const activeCachingRef = useRef<Set<string>>(new Set());

  const handlePrecache = useCallback(
    async (material: Material) => {
      if (!dispatchCommand || !deviceId) return;
      if (activeCachingRef.current.has(material.id)) return;

      activeCachingRef.current.add(material.id);

      // 1. Initial report: Started Caching
      dispatchCommand("MATERIAL_CACHE_REPORT", {
        materialId: material.id,
        deviceId,
        deviceName,
        role,
        status: "caching",
        progress: 15,
      });

      try {
        await warmMaterialAsset(material, deviceId, (percent) => {
          if (percent < 100) {
            dispatchCommand("MATERIAL_CACHE_REPORT", {
              materialId: material.id,
              deviceId,
              deviceName,
              role,
              status: "caching",
              progress: percent,
            });
          }
        });

        // 2. Success report: Cached
        dispatchCommand("MATERIAL_CACHE_REPORT", {
          materialId: material.id,
          deviceId,
          deviceName,
          role,
          status: "cached",
          progress: 100,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Cache failed";
        dispatchCommand("MATERIAL_CACHE_REPORT", {
          materialId: material.id,
          deviceId,
          deviceName,
          role,
          status: "error",
          progress: 0,
          error: errorMsg,
        });
      } finally {
        activeCachingRef.current.delete(material.id);
      }
    },
    [dispatchCommand, deviceId, deviceName, role]
  );

  useEffect(() => {
    if (!state || !state.lastPrecacheRequest || !dispatchCommand || !deviceId) return;

    const { materialId, requestedAt, targetDeviceId } = state.lastPrecacheRequest;
    if (requestedAt <= lastProcessedTimeRef.current) return;
    if (targetDeviceId && targetDeviceId !== deviceId) return;

    lastProcessedTimeRef.current = requestedAt;

    const targetMaterial = state.materials.find((m) => m.id === materialId);
    if (targetMaterial) {
      handlePrecache(targetMaterial);
    }
  }, [state, dispatchCommand, deviceId, handlePrecache]);
}

