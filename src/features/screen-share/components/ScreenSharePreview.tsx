"use client";

import { useEffect, useRef } from "react";

interface ScreenSharePreviewProps {
  stream: MediaStream | null;
  className?: string;
}

/**
 * Renders a local preview of the Speaker's screen share.
 * Uses a <video> element with srcObject to display the MediaStream.
 * This is NOT the LIVE output — it is a local preview only.
 */
export function ScreenSharePreview({ stream, className = "" }: ScreenSharePreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        // Autoplay may be blocked — user interaction already happened
      });
    } else {
      video.srcObject = null;
    }

    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  if (!stream) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`w-full rounded-xl border border-slate-700 bg-black object-contain ${className}`}
      style={{ maxHeight: "280px" }}
    />
  );
}
