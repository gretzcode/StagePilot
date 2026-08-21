"use client";

import "@/lib/polyfills";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SlideViewer } from "@/features/material/components/SlideViewer";
import { Clock, MessageSquare, AlertCircle, Monitor } from "lucide-react";
import { useStageRoomSession } from "@/core/realtime/useStageRoomSession";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";

import { getPersistentDeviceId } from "@/core/utils/device-id";
import { useTimerTicker } from "@/features/timer/hooks/useTimerTicker";
import { useAutoHideCursor } from "@/core/hooks/useAutoHideCursor";
import { formatStageTimer } from "@/features/timer/utils/timer-formatter";
import { useMaterialQueuePreloader } from "@/features/material/hooks/useMaterialQueuePreloader";
import { useScreenShareSubscriber, ScreenShareLiveViewer } from "@/features/screen-share";

function getBriefFontSize(length: number): string {
  if (length <= 35) return "text-5xl sm:text-6xl md:text-7xl lg:text-8xl";
  if (length <= 80) return "text-3xl sm:text-4xl md:text-5xl lg:text-6xl";
  return "text-xl sm:text-2xl md:text-3xl lg:text-4xl";
}

function ConfidenceDisplayContent() {
  const searchParams = useSearchParams();
  const rawRoomCode = searchParams.get("roomCode");
  const roomCode = rawRoomCode ? rawRoomCode.trim().toUpperCase() : "";
  const grant = searchParams.get("grant");
  const [deviceId] = useState(() => getPersistentDeviceId("confidence", roomCode, searchParams.get("deviceId")));
  useAutoHideCursor(2500);

  const { state, roomError, approvalStatus, sendWebRtcSignal } = useStageRoomSession({
    roomCode,
    role: "confidence",
    deviceId,
    deviceName: "Confidence Display",
    displayGrant: grant || undefined,
  });

  const now = useTimerTicker(state?.timer.status === "running");

  useMaterialQueuePreloader(state?.materials, deviceId, state?.presentation?.materialId);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F" || e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const liveSource = state?.liveSource;
  const activeMaterial = state?.materials.find((m) => m.id === (liveSource?.type === "material" ? liveSource.id : state?.presentation?.materialId)) || null;
  const isLiveScreenShare = Boolean(liveSource?.type === "screen_share" && state?.screenShareSources?.[liveSource.id]?.status === "active");
  const isLiveMaterial = Boolean(liveSource?.type === "material" && activeMaterial && activeMaterial.id === liveSource.id);
  const isPresenting = Boolean(liveSource && (isLiveMaterial || isLiveScreenShare));
  const activeScreenShare = isLiveScreenShare && liveSource ? state?.screenShareSources?.[liveSource.id] : null;

  // WebRTC Screen Share Subscriber: unconditionally registered hook
  const { stream: screenShareStream, status: screenShareStatus } = useScreenShareSubscriber({
    sourceId: isLiveScreenShare && liveSource ? liveSource.id : null,
    deviceId,
    sendSignal: sendWebRtcSignal,
  });

  // Compute timestamp-based timer countdown & negative overtime increment
  const { formattedTime, isOvertime, isWarning, isCritical, isFinished } = formatStageTimer(
    state?.timer.status || "idle",
    state?.timer.duration || 300,
    state?.timer.remaining || 300,
    state?.timer.startedAt || null,
    now
  );

  // 1. Room/Network Error State
  if (roomError) {
    return <FriendlyErrorState errorType={roomError} roomCode={roomCode} />;
  }

  // 2. Pending Approval State
  if (approvalStatus === "pending") {
    return <PendingApprovalState roomCode={roomCode} role="confidence" />;
  }

  // 3. Rejected or Revoked Access State
  if (approvalStatus === "rejected" || approvalStatus === "revoked") {
    return <FriendlyErrorState errorType={approvalStatus === "revoked" ? "DEVICE_REVOKED" : "DEVICE_REJECTED"} roomCode={roomCode} />;
  }

  return (
    <div
      onDoubleClick={toggleFullscreen}
      className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden p-3 relative cursor-none"
    >
      {/* Main HUD Body */}
      {isPresenting ? (
        <div className="flex-1 flex flex-col md:grid md:grid-cols-12 gap-3 md:gap-4 overflow-y-auto md:overflow-hidden">
          {/* Current Slide / Screen Display Canvas (Expanded to 75% screen area on landscape) */}
          <div className="col-span-1 md:col-span-8 lg:col-span-9 bg-black rounded-3xl border border-slate-800/80 overflow-hidden relative shadow-2xl flex items-center justify-center min-h-[260px] md:min-h-0">
            {isLiveScreenShare ? (
              <ScreenShareLiveViewer
                stream={screenShareStream}
                status={screenShareStatus}
                speakerName={activeScreenShare?.speakerName}
              />
            ) : (
              <SlideViewer
                material={activeMaterial}
                slide={state?.presentation.currentSlideMetadata || null}
                currentSlide={state?.presentation.currentSlide || 1}
                blanked={state?.presentation.blanked}
                role="confidence"
                deviceId={deviceId}
                mediaState={state?.presentation.mediaState}
                zoom={state?.presentation.zoom}
              />
            )}
          </div>

          {/* Right Info Column: Timer (1/3 height) & Speaker Brief (2/3 height) */}
          <div className="col-span-1 md:col-span-4 lg:col-span-3 flex flex-col space-y-3 h-full min-h-[300px] md:min-h-0 overflow-hidden">
            {/* 1/3 Height Countdown Stage Timer */}
            <div className="h-1/3 glass-panel p-4 rounded-3xl border border-slate-800 text-center flex flex-col items-center justify-center bg-slate-900/80 shadow-2xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center space-x-1 mb-1">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                <span>STAGE TIMER</span>
              </span>
              <div
                className={`font-mono text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-none ${
                  isOvertime || isCritical || isFinished
                    ? "text-rose-400 animate-pulse"
                    : isWarning
                    ? "text-amber-400"
                    : "text-white"
                }`}
              >
                {formattedTime}
              </div>
              <span className={`text-[9px] font-mono uppercase font-bold px-2.5 py-0.5 rounded-full border border-slate-800 self-center mt-2 ${
                isOvertime
                  ? "bg-rose-950 text-rose-400 border-rose-800 animate-pulse"
                  : "bg-slate-950 text-slate-400"
              }`}>
                {isOvertime ? "OVERTIME" : (state?.timer.status || "IDLE")}
              </span>
            </div>

            {/* 2/3 Height Speaker Brief / Stage Cue Banner */}
            <div className="h-2/3 glass-panel p-4 rounded-3xl border border-slate-800 flex flex-col bg-slate-900/80 overflow-hidden shadow-2xl">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5 border-b border-slate-800 pb-2 mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                <span>STAGE CUE</span>
              </span>

              {state?.brief.activeMessage ? (
                <div
                  className={`p-4 rounded-2xl border flex-1 flex flex-col justify-center items-center text-center overflow-hidden ${
                    state.brief.activeMessage.urgency === "urgent"
                      ? "bg-rose-950/80 border-rose-700 text-rose-100"
                      : state.brief.activeMessage.urgency === "warning"
                      ? "bg-amber-950/80 border-amber-700 text-amber-100"
                      : "bg-slate-900 border-slate-800 text-slate-100"
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold uppercase mb-2 opacity-80 flex items-center space-x-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{state.brief.activeMessage.urgency} CUE</span>
                  </span>
                  <p className="text-sm sm:text-base md:text-lg font-black leading-snug break-words max-w-full">
                    &ldquo;{state.brief.activeMessage.text}&rdquo;
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-3 text-center text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800/80">
                  <MessageSquare className="w-8 h-8 text-slate-700 mb-2" />
                  <span>No active stage cue.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Standby Mode Layout when NOT Presenting: Equal Balanced Split (Timer Top 45%, Brief Bottom 55%) */
        <div className="flex-1 flex flex-col justify-between w-full h-full p-2 overflow-hidden space-y-4">
          {/* Top Half: Stage Countdown Timer */}
          <div className="flex-1 glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col justify-center items-center text-center shadow-2xl bg-slate-900/80 relative overflow-hidden">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center space-x-2 mb-1">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>STAGE COUNTDOWN TIMER</span>
            </span>

            <div
              className={`font-mono text-7xl sm:text-8xl md:text-[9rem] lg:text-[10.5rem] font-black tracking-tight leading-none drop-shadow-2xl ${
                isOvertime || isCritical || isFinished
                  ? "text-rose-400 animate-pulse"
                  : isWarning
                  ? "text-amber-400"
                  : "text-white"
              }`}
            >
              {formattedTime}
            </div>

            <span className={`text-[11px] font-mono uppercase font-bold px-3 py-1 rounded-full border shadow-md mt-1 ${
              isOvertime
                ? "bg-rose-950 text-rose-400 border-rose-800 animate-pulse"
                : "bg-slate-950 text-slate-400 border-slate-800"
            }`}>
              STATUS: {isOvertime ? "OVERTIME" : (state?.timer.status || "IDLE")}
            </span>
          </div>

          {/* Bottom Half: Giant Prominent Stage Brief / Cue */}
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-900/60 rounded-3xl border border-slate-800/80">
            {state?.brief.activeMessage ? (
              <div className="flex flex-col items-center justify-center text-center space-y-4 w-full h-full">
                <span className={`text-xs font-mono font-black uppercase tracking-wider px-5 py-1.5 rounded-full flex items-center space-x-2 shadow-lg ${
                  state.brief.activeMessage.urgency === "urgent"
                    ? "bg-rose-600 text-white animate-pulse"
                    : state.brief.activeMessage.urgency === "warning"
                    ? "bg-amber-500 text-slate-950 font-extrabold"
                    : "bg-purple-600 text-white"
                }`}>
                  <AlertCircle className="w-4 h-4" />
                  <span>{state.brief.activeMessage.urgency.toUpperCase()} STAGE CUE</span>
                </span>

                <p className={`${getBriefFontSize(state.brief.activeMessage.text.length)} font-black tracking-tight leading-snug max-w-6xl w-full text-center overflow-hidden transition-all ${
                  state.brief.activeMessage.urgency === "urgent"
                    ? "text-rose-300"
                    : state.brief.activeMessage.urgency === "warning"
                    ? "text-amber-300"
                    : "text-white"
                }`}>
                  &ldquo;{state.brief.activeMessage.text}&rdquo;
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center text-slate-500 space-y-2 my-auto">
                <MessageSquare className="w-12 h-12 text-slate-700 mb-2" />
                <p className="text-2xl font-black text-slate-400">Belum ada Stage Brief / Catatan panggung.</p>
                <span className="text-xs text-slate-600 font-mono">Control Room Ready</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfidenceDisplayPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-slate-950" />}>
      <ConfidenceDisplayContent />
    </Suspense>
  );
}
