"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export type ScreenShareState = "idle" | "starting" | "active" | "stopped" | "failed";

export interface UseScreenShareResult {
  /** Current screen share lifecycle state */
  status: ScreenShareState;
  /** The local MediaStream for preview (null when not active) */
  stream: MediaStream | null;
  /** Error message if screen share failed */
  error: string | null;
  /** Start screen sharing - must be called from a user gesture */
  startSharing: () => Promise<void>;
  /** Stop screen sharing and clean up all resources */
  stopSharing: () => void;
}

interface UseScreenShareOptions {
  /** Called when screen sharing starts successfully */
  onStarted?: () => void;
  /** Called when screen sharing stops (by user action or browser/OS) */
  onStopped?: () => void;
  /** Called when screen sharing fails */
  onFailed?: (error: string) => void;
}

/**
 * Manages the full screen share lifecycle:
 * - Start: Calls getDisplayMedia from explicit user action
 * - Preview: Provides the MediaStream for local <video> preview
 * - Stop: Stops all tracks and cleans up resources
 * - Browser Stop: Detects when user stops sharing via browser/OS UI
 * - Cleanup: Guaranteed cleanup on unmount
 */
export function useScreenShare(options: UseScreenShareOptions = {}): UseScreenShareResult {
  const [status, setStatus] = useState<ScreenShareState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup helper: stops all tracks and releases resources
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.removeEventListener("ended", handleTrackEnded);
        track.stop();
      });
      streamRef.current = null;
    }
  }, []);

  // Handle browser/OS stopping the screen share
  const handleTrackEnded = useCallback(() => {
    if (!isMountedRef.current) return;
    cleanupStream();
    setStream(null);
    setStatus("stopped");
    options.onStopped?.();
  }, [cleanupStream, options.onStopped]);

  const startSharing = useCallback(async () => {
    // Guard: already sharing
    if (streamRef.current) {
      return;
    }

    setError(null);
    setStatus("starting");

    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false, // Do not capture audio - screen sharing only
      });

      if (!isMountedRef.current) {
        // Component unmounted during picker
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus("active");
      setError(null);

      // Listen for browser/OS ending the capture
      mediaStream.getTracks().forEach((track) => {
        track.addEventListener("ended", handleTrackEnded);
      });

      options.onStarted?.();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;

      const errorObj = err as DOMException;

      if (errorObj.name === "AbortError" || errorObj.name === "NotAllowedError") {
        // User cancelled the screen picker or denied permission
        setStatus("idle");
        setError(null);
        return;
      }

      const errorMessage =
        errorObj.name === "NotFoundError"
          ? "Tidak ada sumber layar yang tersedia."
          : errorObj.name === "NotReadableError"
          ? "Layar tidak dapat dibaca. Coba tutup aplikasi yang menggunakan layar."
          : `Gagal berbagi layar: ${errorObj.message || "Unknown error"}`;

      setError(errorMessage);
      setStatus("failed");
      options.onFailed?.(errorMessage);
    }
  }, [handleTrackEnded, options]);

  const stopSharing = useCallback(() => {
    cleanupStream();
    if (isMountedRef.current) {
      setStream(null);
      setStatus("stopped");
      setError(null);
      options.onStopped?.();
    }
  }, [cleanupStream, options]);

  // Guaranteed cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        streamRef.current = null;
      }
    };
  }, []);

  return { status, stream, error, startSharing, stopSharing };
}
