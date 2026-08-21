"use client";

import { useEffect, useCallback } from "react";
import { Monitor, MonitorOff, AlertCircle, Loader2 } from "lucide-react";
import { WebRtcSignalPayload } from "@/core/realtime/protocol";
import { useScreenShare, ScreenShareState } from "../hooks/useScreenShare";
import { useScreenShareCapability, ScreenShareCapability } from "../hooks/useScreenShareCapability";
import { useScreenSharePublisher } from "../hooks/useScreenSharePublisher";
import { ScreenSharePreview } from "./ScreenSharePreview";

interface ScreenSharePanelProps {
  /** Speaker's device ID */
  deviceId?: string;
  /** Dispatch a room command */
  onScreenShareStart: () => void;
  /** Dispatch a room command */
  onScreenShareStop: () => void;
  /** WebRTC signaling callback */
  sendSignal?: (payload: WebRtcSignalPayload) => void;
  /** Callback when local MediaStream changes */
  onStreamChange?: (stream: MediaStream | null) => void;
}

/**
 * Speaker Screen Share Panel
 *
 * Provides:
 * - Capability detection (supported / unsupported)
 * - Start sharing button (user gesture required)
 * - Local preview of the shared screen
 * - WebRTC publishing to connected displays
 * - Stop sharing button
 * - Error handling (cancel, denied, unsupported)
 *
 * This panel does NOT make the screen share LIVE.
 * The Source Manager handles TAKE LIVE.
 */
export function ScreenSharePanel({
  deviceId = "speaker-device",
  onScreenShareStart,
  onScreenShareStop,
  sendSignal,
  onStreamChange,
}: ScreenSharePanelProps) {
  const capability = useScreenShareCapability();

  const handleStarted = useCallback(() => {
    onScreenShareStart();
  }, [onScreenShareStart]);

  const handleStopped = useCallback(() => {
    onScreenShareStop();
  }, [onScreenShareStop]);

  const { status, stream, error, startSharing, stopSharing } = useScreenShare({
    onStarted: handleStarted,
    onStopped: handleStopped,
  });

  useEffect(() => {
    onStreamChange?.(stream);
  }, [stream, onStreamChange]);

  // Automatically publish stream to subscribers via WebRTC
  useScreenSharePublisher({
    stream,
    deviceId,
    sendSignal: sendSignal || (() => {}),
  });

  const handleStartClick = useCallback(() => {
    startSharing();
  }, [startSharing]);

  const handleStopClick = useCallback(() => {
    stopSharing();
  }, [stopSharing]);

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Monitor className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Bagikan Layar
          </span>
        </div>
        {status === "active" && (
          <span className="px-2 py-0.5 rounded-md bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 text-[9px] font-bold uppercase tracking-wider animate-pulse">
            SHARING
          </span>
        )}
      </div>

      {/* Unsupported Browser */}
      {capability === "unsupported" && (
        <div className="p-3 rounded-xl border border-amber-800/60 bg-amber-950/20 text-xs text-amber-300">
          <div className="flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Berbagi layar tidak tersedia</p>
              <p className="text-amber-400/70 mt-0.5">
                Browser atau perangkat Anda tidak mendukung fitur berbagi layar.
                Gunakan Chrome, Edge, atau Firefox di desktop untuk berbagi layar.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Capability Loading */}
      {capability === "unknown" && (
        <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/40 text-xs text-slate-500 flex items-center space-x-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Memeriksa dukungan browser...</span>
        </div>
      )}

      {/* Supported: Show Controls */}
      {capability === "supported" && (
        <>
          {/* Error Message */}
          {error && (
            <div className="p-2.5 rounded-xl border border-rose-800/60 bg-rose-950/20 text-xs text-rose-300 flex items-start space-x-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Idle / Stopped / Failed: Show Start Button */}
          {(status === "idle" || status === "stopped" || status === "failed") && (
            <button
              onClick={handleStartClick}
              className="w-full py-3 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 active:scale-[0.98] text-white font-bold text-xs transition flex items-center justify-center space-x-2 shadow-lg cursor-pointer touch-manipulation"
            >
              <Monitor className="w-4 h-4" />
              <span>Bagikan Layar Saya</span>
            </button>
          )}

          {/* Starting: Show Loading */}
          {status === "starting" && (
            <div className="w-full py-3 px-4 rounded-xl bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 font-bold text-xs flex items-center justify-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memilih layar...</span>
            </div>
          )}

          {/* Active: Show Preview + Stop Button */}
          {status === "active" && (
            <div className="space-y-2.5">
              {/* Local Preview */}
              <div className="relative">
                <ScreenSharePreview stream={stream} />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-cyan-300 uppercase tracking-wider">
                  Preview Lokal
                </div>
              </div>

              {/* Info: Not Live */}
              <p className="text-[10px] text-slate-500 text-center">
                Layar Anda dibagikan sebagai sumber. Belum ditampilkan ke audiens.
              </p>

              {/* Stop Button */}
              <button
                onClick={handleStopClick}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-950/80 border border-rose-800 hover:bg-rose-900 active:scale-[0.98] text-rose-300 font-bold text-xs transition flex items-center justify-center space-x-2 cursor-pointer touch-manipulation"
              >
                <MonitorOff className="w-4 h-4" />
                <span>Berhenti Berbagi Layar</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
