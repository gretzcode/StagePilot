"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StageSessionState } from "@/core/types";
import { SlideViewer } from "@/features/material/components/SlideViewer";
import { Maximize2 } from "lucide-react";

function AudienceDisplayContent() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("roomCode") || "A7K9P2";
  const deviceId = searchParams.get("deviceId") || `dev-aud-${Date.now().toString(36)}`;

  const [state, setState] = useState<StageSessionState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${wsProtocol}//${window.location.host}/api/ws?roomCode=${encodeURIComponent(
      roomCode
    )}&deviceId=${encodeURIComponent(deviceId)}&role=audience`;

    const socket = new WebSocket(socketUrl);

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "SYNC_STATE") {
          setState(msg.state);
        }
      } catch (err) {
        console.error("Failed to parse Audience WebSocket message:", err);
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

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative select-none cursor-none">
      {/* Primary Clean Audience Stage Output */}
      <SlideViewer
        material={activeMaterial}
        slide={state?.presentation.currentSlide || null}
        currentPage={state?.presentation.currentPage || 1}
        blanked={state?.presentation.blanked}
        role="audience"
      />

      {/* Subtle Fullscreen Trigger (Fades out when in fullscreen) */}
      {!isFullscreen && (
        <button
          onClick={toggleFullscreen}
          className="absolute bottom-4 right-4 p-3 rounded-full bg-slate-900/40 hover:bg-slate-900/80 border border-slate-700/40 text-white/50 hover:text-white transition opacity-40 hover:opacity-100 cursor-pointer"
          title="Toggle Fullscreen Output"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function AudienceDisplayPage() {
  return (
    <Suspense fallback={<div className="w-screen h-screen bg-black" />}>
      <AudienceDisplayContent />
    </Suspense>
  );
}
