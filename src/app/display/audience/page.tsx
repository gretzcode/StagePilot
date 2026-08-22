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
import { useMaterialQueuePreloader, useMaterialPrecacheListener } from "@/features/material/hooks/useMaterialQueuePreloader";
import { useScreenShareSubscriber, ScreenShareLiveViewer } from "@/features/screen-share";

function AudienceDisplayContent() {
  const searchParams = useSearchParams();
  const rawRoomCode = searchParams.get("roomCode");
  const roomCode = rawRoomCode ? rawRoomCode.trim().toUpperCase() : "";
  const grant = searchParams.get("grant");
  const [deviceId] = useState(() => getPersistentDeviceId("audience", roomCode, searchParams.get("deviceId")));
  useAutoHideCursor(2500);

  const { state, roomError, approvalStatus, roomName, sendWebRtcSignal, dispatchCommand } = useStageRoomSession({
    roomCode,
    role: "audience",
    deviceId,
    deviceName: "Audience Display",
    displayGrant: grant || undefined,
  });

  useMaterialQueuePreloader(state?.materials, deviceId, state?.presentation?.materialId);
  useMaterialPrecacheListener(state, dispatchCommand, deviceId, "Audience Display", "audience");

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

  return (
    <div
      onClick={toggleFullscreen}
      onDoubleClick={toggleFullscreen}
      className="w-screen h-screen bg-black overflow-hidden relative select-none cursor-none flex flex-col justify-center items-center"
    >
      {isPresenting ? (
        isLiveScreenShare ? (
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
