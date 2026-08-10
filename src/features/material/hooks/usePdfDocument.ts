"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

// ─── Module-level caches (survive re-renders and component unmounts) ───────────
const pdfDocCache = new Map<string, PDFDocumentProxy>();
const pdfLoadingPromises = new Map<string, Promise<PDFDocumentProxy>>();

function buildFetchTarget(url: string, googleFileId: string | null): string {
  if (googleFileId) {
    return `/api/material/asset?url=${encodeURIComponent(
      `https://drive.google.com/uc?export=download&id=${googleFileId}`
    )}`;
  }
  return url;
}

async function loadPdfDocument(fetchTarget: string): Promise<PDFDocumentProxy> {
  const pdfjsLib = await import("pdfjs-dist");
  if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
  return pdfjsLib.getDocument(fetchTarget).promise;
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

  const cacheKey = googleFileId ? `gd:${googleFileId}` : url;

  useEffect(() => {
    isMountedRef.current = true;

    // Nothing to load
    if (!url && !googleFileId) {
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

    const fetchTarget = buildFetchTarget(url, googleFileId ?? null);
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
