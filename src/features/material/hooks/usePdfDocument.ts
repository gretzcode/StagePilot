"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { installPolyfills } from "@/lib/polyfills";

// Ensure polyfills (including Promise.withResolvers) are installed immediately
installPolyfills();

// ─── Module-level caches (survive re-renders and component unmounts) ───────────
const pdfDocCache = new Map<string, PDFDocumentProxy>();
const pdfLoadingPromises = new Map<string, Promise<PDFDocumentProxy>>();

export function clearPdfDocumentCache(): void {
  pdfDocCache.clear();
  pdfLoadingPromises.clear();
}

export function removePdfDocumentFromCache(urlOrKey: string): void {
  pdfDocCache.delete(urlOrKey);
  pdfLoadingPromises.delete(urlOrKey);
}

export function getPdfDocumentCacheSize(): number {
  return pdfDocCache.size;
}

export function getPdfLoadingPromisesSize(): number {
  return pdfLoadingPromises.size;
}

function buildFetchTarget(url: string): string {
  return url;
}

async function loadPdfDocument(fetchTarget: string): Promise<PDFDocumentProxy> {
  installPolyfills();
  const pdfjsLib = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }
  return pdfjsLib.getDocument(fetchTarget).promise;
}

/**
 * Proactively preload and parse a PDF document in background memory
 * so that when the user starts the presentation (Go Live), it opens with 0ms delay.
 */
export function preloadPdfDocument(url: string): Promise<PDFDocumentProxy | null> {
  if (!url) return Promise.resolve(null);
  const cacheKey = url;
  if (pdfDocCache.has(cacheKey)) {
    return Promise.resolve(pdfDocCache.get(cacheKey)!);
  }
  if (pdfLoadingPromises.has(cacheKey)) {
    return pdfLoadingPromises.get(cacheKey)!;
  }

  const fetchTarget = buildFetchTarget(url);
  const loadPromise = loadPdfDocument(fetchTarget);
  pdfLoadingPromises.set(cacheKey, loadPromise);

  return loadPromise
    .then((doc) => {
      pdfDocCache.set(cacheKey, doc);
      pdfLoadingPromises.delete(cacheKey);
      return doc;
    })
    .catch((err: unknown) => {
      pdfLoadingPromises.delete(cacheKey);
      console.warn("[PDF Preloader] Background preload skipped or failed:", err);
      return null;
    });
}

interface UsePdfDocumentResult {
  pdfDoc: PDFDocumentProxy | null;
  numPages: number;
  loading: boolean;
  error: string | null;
}

/**
 * Shared PDF document loader with module-level cache.
 * Multiple components using the same URL will reuse the same PDFDocumentProxy
 * without re-fetching or re-parsing the file.
 */
export function usePdfDocument(
  url: string,
  googleFileId?: string | null
): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const cacheKey = url || (googleFileId ? `gd:${googleFileId}` : "");

  useEffect(() => {
    isMountedRef.current = true;

    // Nothing to load
    if (!cacheKey) {
      setLoading(false);
      return;
    }

    // ── Cache hit: instant return ────────────────────────────────────────────
    if (pdfDocCache.has(cacheKey)) {
      const cached = pdfDocCache.get(cacheKey)!;
      setPdfDoc(cached);
      setNumPages(cached.numPages);
      setLoading(false);
      return;
    }

    // ── In-flight: attach to existing promise ────────────────────────────────
    if (pdfLoadingPromises.has(cacheKey)) {
      setLoading(true);
      pdfLoadingPromises.get(cacheKey)!
        .then((doc) => {
          if (!isMountedRef.current) return;
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (!isMountedRef.current) return;
          setError(err instanceof Error ? err.message : "Failed to load PDF");
          setLoading(false);
        });
      return;
    }

    // ── Fresh load ────────────────────────────────────────────────────────────
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);

    const fetchTarget = buildFetchTarget(url);
    const loadPromise = loadPdfDocument(fetchTarget);

    pdfLoadingPromises.set(cacheKey, loadPromise);

    loadPromise
      .then((doc) => {
        pdfDocCache.set(cacheKey, doc);
        pdfLoadingPromises.delete(cacheKey);
        if (!isMountedRef.current) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        pdfLoadingPromises.delete(cacheKey);
        if (!isMountedRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to load PDF");
        setLoading(false);
      });

    return () => {
      isMountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { pdfDoc, numPages, loading, error };
}
