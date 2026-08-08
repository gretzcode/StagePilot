"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { StageSessionState, StageCommand, Material } from "@/core/types";
import { ThumbnailList } from "@/features/material/components/ThumbnailList";
import { SlideViewer } from "@/features/material/components/SlideViewer";
import { TimerControl } from "@/features/timer/components/TimerControl";
import { BriefControl } from "@/features/brief/components/BriefControl";
import { MaterialUploader } from "@/features/material/components/MaterialUploader";
import {
  ChevronLeft,
  ChevronRight,
  Square,
  Eye,
  EyeOff,
  LogOut,
  Tv,
  Layers,
  Sparkles,
} from "lucide-react";

function PresentationControlContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomCode = searchParams.get("roomCode") || "A7K9P2";
  const deviceId = searchParams.get("deviceId") || `dev-ctrl-${Date.now().toString(36)}`;

  const [state, setState] = useState<StageSessionState | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showUploader, setShowUploader] = useState(false);

  // Connect WebSocket to StageRoom Durable Object
  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${wsProtocol}//${window.location.host}/api/ws?roomCode=${encodeURIComponent(
      roomCode
    )}&deviceId=${encodeURIComponent(deviceId)}&role=control`;

    const socket = new WebSocket(socketUrl);

    socket.onopen = () => {
      setIsConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "SYNC_STATE") {
          setState(msg.state);
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    socket.onclose = () => {
      setIsConnected(false);
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [roomCode, deviceId]);

  const dispatchCommand = useCallback(
    (commandType: StageCommand["type"], payload: Record<string, unknown> = {}) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const cmd = {
        type: commandType,
        commandId: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        senderDeviceId: deviceId,
        timestamp: Date.now(),
        payload,
      } as StageCommand;
      ws.send(JSON.stringify({ type: "EXECUTE_COMMAND", payload: cmd }));
    },
    [ws, deviceId]
  );

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        dispatchCommand("SLIDE_NEXT");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        dispatchCommand("SLIDE_PREVIOUS");
      } else if (e.key === " ") {
        e.preventDefault();
        if (state?.timer.status === "running") {
          dispatchCommand("TIMER_PAUSE");
        } else {
          dispatchCommand("TIMER_START");
        }
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        dispatchCommand("DISPLAY_BLANK", { blank: !state?.presentation.blanked });
      } else if (e.key === "Escape") {
        e.preventDefault();
        dispatchCommand("PRESENTATION_EXIT");
      } else if (e.key === "Home") {
        e.preventDefault();
        dispatchCommand("SLIDE_GOTO", { pageNumber: 1 });
      } else if (e.key === "End") {
        e.preventDefault();
        if (state?.presentation.totalPages) {
          dispatchCommand("SLIDE_GOTO", { pageNumber: state.presentation.totalPages });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatchCommand, state]);

  const activeMaterial = state?.materials.find((m) => m.id === state?.presentation.materialId) || null;

  const handleAddMaterial = (newMaterial: Material) => {
    if (state) {
      state.materials.push(newMaterial);
      setState({ ...state });
    }
    setShowUploader(false);
    dispatchCommand("PRESENTATION_START", { materialId: newMaterial.id, startPage: 1 });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Stage Control Header */}
      <header className="h-16 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center font-black text-white glow-purple">
              SP
            </div>
            <span className="font-extrabold text-base tracking-tight text-white">StagePilot</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400 font-medium">ROOM CODE:</span>
            <span className="font-mono font-bold text-sm text-purple-300 bg-slate-800/80 px-2.5 py-0.5 rounded-lg border border-slate-700">
              {roomCode}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            <span className="text-xs font-mono font-semibold text-slate-300">
              {isConnected ? "LIVE RUNTIME CONNECTED" : "RECONNECTING..."}
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowUploader(!showUploader)}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center space-x-1.5 transition"
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span>Materials ({state?.materials.length || 0})</span>
          </button>

          <button
            onClick={() => router.push(`/control?roomCode=${roomCode}`)}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white flex items-center space-x-1.5 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Control Room</span>
          </button>
        </div>
      </header>

      {/* Main Operator Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COLUMN: Thumbnails & Material Deck */}
        <aside className="w-72 bg-slate-900/60 border-r border-slate-800/80 p-4 flex flex-col space-y-4 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Slide Deck</h4>
            <span className="text-[10px] font-mono text-purple-400 font-bold">
              {state?.presentation.currentPage || 0} / {state?.presentation.totalPages || 0}
            </span>
          </div>

          {showUploader && (
            <div className="mb-2">
              <MaterialUploader onMaterialAdded={handleAddMaterial} />
            </div>
          )}

          <ThumbnailList
            material={activeMaterial}
            currentPage={state?.presentation.currentPage || 1}
            onSelectSlide={(pageNumber) => dispatchCommand("SLIDE_GOTO", { pageNumber })}
          />
        </aside>

        {/* CENTER COLUMN: Current & Next Slide Stage Canvas */}
        <main className="flex-1 flex flex-col p-6 space-y-4 overflow-y-auto bg-slate-950">
          {/* Active Presentation Surface */}
          <div className="flex-1 rounded-3xl border border-slate-800 overflow-hidden relative shadow-2xl min-h-[380px]">
            <SlideViewer
              material={activeMaterial}
              slide={state?.presentation.currentSlide || null}
              currentPage={state?.presentation.currentPage || 1}
              blanked={state?.presentation.blanked}
              role="control"
            />
          </div>

          {/* Controller Toolbar & Next Slide Preview */}
          <div className="glass-panel p-4 rounded-3xl border border-slate-800 flex items-center justify-between">
            {/* Primary Slide Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => dispatchCommand("SLIDE_PREVIOUS")}
                className="px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center space-x-1 transition"
              >
                <ChevronLeft className="w-4 h-4 text-purple-400" />
                <span>Prev Slide</span>
              </button>

              <button
                onClick={() => dispatchCommand("SLIDE_NEXT")}
                className="px-5 py-2 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center space-x-1.5 transition glow-purple"
              >
                <span>Next Slide</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => dispatchCommand("DISPLAY_BLANK", { blank: !state?.presentation.blanked })}
                className={`px-4 py-2 rounded-2xl font-bold text-xs flex items-center space-x-1.5 transition border ${
                  state?.presentation.blanked
                    ? "bg-rose-950 text-rose-300 border-rose-800"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                }`}
              >
                {state?.presentation.blanked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-rose-400" />}
                <span>{state?.presentation.blanked ? "Show Display" : "Blank Screen"}</span>
              </button>
            </div>

            {/* Next Slide Preview Banner */}
            <div className="flex items-center space-x-3 bg-slate-900/80 px-4 py-2 rounded-2xl border border-slate-800">
              <span className="text-[10px] font-mono uppercase font-bold text-slate-500">NEXT SLIDE:</span>
              <span className="text-xs font-semibold text-purple-300 truncate max-w-xs">
                {state?.presentation.nextSlide?.title || (state?.presentation.currentPage ? `Slide ${state.presentation.currentPage + 1}` : "End of Deck")}
              </span>
            </div>

            {/* Presentation Exit */}
            <button
              onClick={() => dispatchCommand("PRESENTATION_EXIT")}
              className="px-3.5 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-rose-400 font-bold text-xs flex items-center space-x-1 transition"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Exit Deck</span>
            </button>
          </div>
        </main>

        {/* RIGHT COLUMN: Stage Timer, Brief & Device Status */}
        <aside className="w-80 bg-slate-900/60 border-l border-slate-800/80 p-4 space-y-4 overflow-y-auto">
          {/* Stage Timer */}
          {state && (
            <TimerControl
              timer={state.timer}
              onStart={() => dispatchCommand("TIMER_START")}
              onPause={() => dispatchCommand("TIMER_PAUSE")}
              onReset={() => dispatchCommand("TIMER_RESET")}
              onSetDuration={(duration) => dispatchCommand("TIMER_SET", { duration })}
            />
          )}

          {/* Speaker Brief */}
          {state && (
            <BriefControl
              brief={state.brief}
              onSendBrief={(text, urgency) => dispatchCommand("BRIEF_UPDATE", { text, urgency })}
            />
          )}

          {/* Connected Display Links */}
          <div className="glass-panel p-4 rounded-3xl border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 pb-1.5">
              Live Displays
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/display/audience?roomCode=${roomCode}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-center transition block"
              >
                <Tv className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                <span className="text-[11px] font-bold text-slate-200 block">Audience</span>
                <span className="text-[9px] text-slate-500 font-mono">Clean Output</span>
              </a>

              <a
                href={`/display/confidence?roomCode=${roomCode}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-center transition block"
              >
                <Sparkles className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <span className="text-[11px] font-bold text-slate-200 block">Confidence</span>
                <span className="text-[9px] text-slate-500 font-mono">Speaker HUD</span>
              </a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function PresentationControlPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <PresentationControlContent />
    </Suspense>
  );
}
