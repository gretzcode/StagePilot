"use client";

import { useEffect, useRef } from "react";
import { Monitor, Loader2, AlertCircle } from "lucide-react";
import { WebRtcConnectionStatus } from "../hooks/useScreenShareSubscriber";

interface ScreenShareLiveViewerProps {
  /** Remote WebRTC MediaStream */
  stream: MediaStream | null;
  /** WebRTC connection status */
  status: WebRtcConnectionStatus;
  /** Display name of the speaker */
  speakerName?: string;
  /** Custom CSS classes for the container */
  className?: string;
}

/**
 * ScreenShareLiveViewer
 *
 * Renders the authoritative LIVE screen share video stream on Audience & Confidence displays.
 * Displays:
 * - HTML5 <video> element with srcObject = stream
 * - Connecting / Negotiating animation while WebRTC handshakes
 * - Clean status indicators and fallback error states
 */
export function ScreenShareLiveViewer({
  stream,
  status,
  speakerName = "Speaker",
  className = "",
}: ScreenShareLiveViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        // Autoplay policy handling
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

  if (status === "connecting" && !stream) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-center p-8 bg-slate-950 select-none ${className}`}>
        <div className="w-16 h-16 rounded-2xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400 mb-4 shadow-xl">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-300 text-xs font-mono font-bold uppercase tracking-wider mb-2">
          <span>Menghubungkan Layar...</span>
        </div>
        <p className="text-sm font-semibold text-white">{speakerName}&apos;s Screen</p>
        <p className="text-xs text-slate-500 mt-1">Menyiapkan koneksi video langsung (WebRTC)...</p>
      </div>
    );
  }

  if (status === "failed" && !stream) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-center p-8 bg-slate-950 select-none ${className}`}>
        <div className="w-16 h-16 rounded-2xl bg-rose-950/80 border border-rose-800/60 flex items-center justify-center text-rose-400 mb-4 shadow-xl">
          <AlertCircle className="w-8 h-8 text-rose-400" />
        </div>
        <p className="text-sm font-bold text-rose-300">Koneksi Video Terputus</p>
        <p className="text-xs text-slate-400 max-w-sm mt-1">
          Tidak dapat menerima stream layar dari {speakerName}. Menunggu pembicara membagikan ulang.
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full h-full bg-black relative flex items-center justify-center overflow-hidden select-none ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
      />

      {/* Floating LIVE watermark badge */}
      <div className="absolute top-4 left-4 flex items-center space-x-2 bg-slate-950/80 backdrop-blur-sm border border-cyan-700/60 px-3 py-1 rounded-full shadow-lg pointer-events-none">
        <Monitor className="w-3.5 h-3.5 text-cyan-400" />
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
          LIVE: {speakerName}
        </span>
      </div>
    </div>
  );
}
