"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { SlideViewer } from "@/features/material/components/SlideViewer";
import { Tv } from "lucide-react";
import { useStageRoomSession } from "@/core/realtime/useStageRoomSession";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";
import { getPersistentDeviceId } from "@/core/utils/device-id";
import { useAutoHideCursor } from "@/core/hooks/useAutoHideCursor";

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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "f" || e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 1. Error state (ROOM_NOT_FOUND, ROOM_ACCESS_DENIED, etc.)
  if (roomError) {
    return <FriendlyErrorState errorType={roomError} roomCode={roomCode} />;
  }

  // 2. Pending Host Approval State (P0-1)
  if (approvalStatus === "pending") {
    return (
      <PendingApprovalState
        deviceName="Audience Display"
        roomCode={roomCode}
        role="audience"
      />
    );
  }

  // 3. Rejected or Revoked Device State
  if (approvalStatus === "rejected" || approvalStatus === "revoked") {
    return <FriendlyErrorState errorType={approvalStatus === "revoked" ? "DEVICE_REVOKED" : "DEVICE_REJECTED"} roomCode={roomCode} />;
  }

  // 4. Approved State Output
  const activeMaterial = state?.materials.find((m) => m.id === state?.presentation.materialId) || null;
  const isPresenting = Boolean(state?.presentation.isPresenting && activeMaterial);

  return (
    <div
      onDoubleClick={toggleFullscreen}
      className="w-screen h-screen bg-black overflow-hidden relative select-none cursor-none flex flex-col justify-center items-center"
    >
      {isPresenting ? (
        <SlideViewer
          material={activeMaterial}
          slide={state?.presentation.currentSlideMetadata || null}
          currentSlide={state?.presentation.currentSlide || 1}
          blanked={state?.presentation.blanked}
          role="audience"
          deviceId={deviceId}
        />
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
