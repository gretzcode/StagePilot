"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StageSessionState } from "@/core/types";
import { SlideViewer } from "@/features/material/components/SlideViewer";
import { Clock, MessageSquare, AlertCircle, Maximize2 } from "lucide-react";

function ConfidenceDisplayContent() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("roomCode") || "A7K9P2";
  const deviceId = searchParams.get("deviceId") || `dev-conf-${Date.now().toString(36)}`;

  const [state, setState] = useState<StageSessionState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${wsProtocol}//${window.location.host}/api/ws?roomCode=${encodeURIComponent(
      roomCode
    )}&deviceId=${encodeURIComponent(deviceId)}&role=confidence`;

    const socket = new WebSocket(socketUrl);

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "SYNC_STATE") {
          setState(msg.state);
        }
      } catch (err) {
        console.error("Failed to parse Confidence WebSocket message:", err);
      }
    };

    return () => {
      socket.close();
    };
  }, [roomCode, deviceId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const activeMaterial = state?.materials.find((m) => m.id === state?.presentation.materialId) || null;

  // Compute timestamp-based timer countdown
  const now = Date.now();
  let remainingSeconds = state?.timer.remaining || 0;
  if (state?.timer.status === "running" && state.timer.startedAt) {
    const elapsed = Math.floor((now - state.timer.startedAt) / 1000);
    remainingSeconds = Math.max(0, state.timer.duration - elapsed);
  }

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const formattedTime = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const isWarning = remainingSeconds > 0 && remainingSeconds <= 120;
  const isCritical = remainingSeconds > 0 && remainingSeconds <= 30;
  const isFinished = remainingSeconds === 0 && state?.timer.status === "running";

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden p-6 space-y-4">
      {/* Top Bar: Room & Connection Header */}
      <header className="flex items-center justify-between bg-slate-900/80 px-6 py-3 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-3">
          <span className="font-extrabold text-sm tracking-wider text-purple-400 uppercase">
            CONFIDENCE DISPLAY HUD
          </span>
          <span className="font-mono text-xs text-slate-400 font-bold bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-700">
            ROOM: {roomCode}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <span className="text-xs font-mono text-slate-400">
            SLIDE {state?.presentation.currentPage || 1} OF {state?.presentation.totalPages || 1}
          </span>
          {!isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main HUD Body */}
      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Current Slide Display Canvas */}
        <div className="col-span-8 bg-black rounded-3xl border border-slate-800 overflow-hidden relative shadow-2xl">
          <SlideViewer
            material={activeMaterial}
            slide={state?.presentation.currentSlide || null}
            currentPage={state?.presentation.currentPage || 1}
            blanked={state?.presentation.blanked}
            role="confidence"
          />
        </div>

        {/* Right Info Column: Timer, Next Slide, Speaker Brief */}
        <div className="col-span-4 flex flex-col space-y-4">
          {/* Large Countdown Stage Timer */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 text-center flex flex-col justify-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-center space-x-1.5 mb-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>REMAINING STAGE TIME</span>
            </span>
            <div className={`font-mono text-6xl font-black tracking-tight ${
              isCritical || isFinished
                ? "text-rose-400 animate-pulse"
                : isWarning
                ? "text-amber-400"
                : "text-white"
            }`}>
              {formattedTime}
            </div>
            <span className="text-[10px] font-mono uppercase font-bold text-slate-500 mt-2">
              STATUS: {state?.timer.status || "IDLE"}
            </span>
          </div>

          {/* Next Slide Preview */}
          <div className="glass-panel p-4 rounded-3xl border border-slate-800">
            <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block mb-1">
              NEXT SLIDE PREVIEW
            </span>
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-semibold text-purple-300">
              {state?.presentation.nextSlide?.title || (state?.presentation.currentPage ? `Slide ${state.presentation.currentPage + 1}` : "End of Deck")}
            </div>
          </div>

          {/* Speaker Brief / Show Caller Banner */}
          <div className="flex-1 glass-panel p-5 rounded-3xl border border-slate-800 flex flex-col">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5 border-b border-slate-800 pb-2 mb-3">
              <MessageSquare className="w-4 h-4 text-purple-400" />
              <span>SHOW CALLER BRIEF</span>
            </span>

            {state?.brief.activeMessage ? (
              <div className={`p-4 rounded-2xl border flex-1 flex flex-col justify-center ${
                state.brief.activeMessage.urgency === "urgent"
                  ? "bg-rose-950/80 border-rose-700 text-rose-100"
                  : state.brief.activeMessage.urgency === "warning"
                  ? "bg-amber-950/80 border-amber-700 text-amber-100"
                  : "bg-slate-900 border-slate-800 text-slate-100"
              }`}>
                <span className="text-[10px] font-mono font-bold uppercase mb-1 opacity-75 flex items-center space-x-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{state.brief.activeMessage.urgency} CUE</span>
                </span>
                <p className="text-base font-bold leading-snug">{state.brief.activeMessage.text}</p>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 text-center text-slate-500 text-xs bg-slate-900/40 rounded-2xl border border-slate-800/80">
                No active speaker notes.
              </div>
            )}
          </div>
        </div>
      </div>
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
