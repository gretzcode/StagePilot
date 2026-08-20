"use client";

import "@/lib/polyfills";
import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SlideViewer } from "@/features/material/components/SlideViewer";
import { Tv, Monitor } from "lucide-react";
import { useStageRoomSession } from "@/core/realtime/useStageRoomSession";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";
import { getPersistentDeviceId } from "@/core/utils/device-id";
import { useAutoHideCursor } from "@/core/hooks/useAutoHideCursor";
import { useMaterialQueuePreloader } from "@/features/material/hooks/useMaterialQueuePreloader";

function AudienceDisplayContent() {
  const searchParams = useSearchParams();
  const rawRoomCode = searchParams.get("roomCode");
  const roomCode = rawRoomCode ? rawRoomCode.trim().toUpperCase() : "";
  const [deviceId] = useState(() => getPersistentDeviceId("audience", roomCode, searchParams.get("deviceId")));
  useAutoHideCursor(2500);

  const { state, roomError, approvalStatus, roomName } = useStageRoomSession({
    roomCode,
    role: "audience",
    deviceId,
    deviceName: "Audience Display",
  });

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

  // 1. Room/Network Error State
  if (roomError) {
    return <FriendlyErrorState errorType={roomError} roomCode={roomCode} />;
  }

  // 2. Pending Approval State
  if (approvalStatus === "pending") {
    return <PendingApprovalState roomCode={roomCode} role="audience" />;
  }

  // 3. Rejected or Revoked Access State
  if (approvalStatus === "rejected" || approvalStatus === "revoked") {
    return <FriendlyErrorState errorType={approvalStatus === "revoked" ? "DEVICE_REVOKED" : "DEVICE_REJECTED"} roomCode={roomCode} />;
  }

  // 4. Approved State Output
  const liveSource = state?.liveSource;
  const activeMaterial = state?.materials.find((m) => m.id === state?.presentation.materialId) || null;
  const isLiveScreenShare = Boolean(liveSource?.type === "screen_share" && state?.screenShareSources?.[liveSource.id]?.status === "active");
  const isLiveMaterial = Boolean((liveSource?.type === "material" || (!liveSource && state?.presentation.isPresenting)) && activeMaterial);
  const isPresenting = Boolean(state?.presentation.isPresenting && (isLiveMaterial || isLiveScreenShare));
  const activeScreenShare = isLiveScreenShare && liveSource ? state?.screenShareSources?.[liveSource.id] : null;

  return (
    <div
      onClick={toggleFullscreen}
      onDoubleClick={toggleFullscreen}
      className="w-screen h-screen bg-black overflow-hidden relative select-none cursor-none flex flex-col justify-center items-center"
    >
      {isPresenting ? (
        isLiveScreenShare ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 bg-slate-950 relative">
            <div className="w-20 h-20 rounded-3xl bg-cyan-950/90 border border-cyan-700/60 flex items-center justify-center text-cyan-400 shadow-2xl mb-4 animate-pulse">
              <Monitor className="w-10 h-10" />
            </div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950 border border-cyan-700 text-cyan-300 text-xs font-mono font-bold uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span>LIVE SCREEN SHARE</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">{activeScreenShare?.speakerName || "Speaker"}&apos;s Screen</h2>
            <p className="text-xs text-slate-400 max-w-md mt-1">Tayangan langsung layar pembicara sedang aktif pada panggung utama.</p>
          </div>
        ) : (
          <SlideViewer
            material={activeMaterial}
            slide={state?.presentation.currentSlideMetadata || null}
            currentSlide={state?.presentation.currentSlide || 1}
            blanked={state?.presentation.blanked}
            role="audience"
            deviceId={deviceId}
            mediaState={state?.presentation.mediaState}
            zoom={state?.presentation.zoom}
          />
        )
      ) : (
        /* Waiting for presentation UI */
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 rounded-3xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center text-indigo-400 mx-auto shadow-2xl">
            <Tv className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Menunggu presentasi dimulai</h1>
          {roomName && <p className="text-purple-300 font-semibold text-lg">{roomName}</p>}
          <div className="inline-flex items-center space-x-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-full text-xs font-mono">
            <span className="text-slate-400">ROOM CODE:</span>
            <span className="text-purple-400 font-bold tracking-widest">{roomCode}</span>
          </div>
        </div>
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
