"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Users, CheckCircle, XCircle, Play, Trash2, Tv, Monitor, ListVideo, Plus } from "lucide-react";
import { useStageRoomSession } from "@/core/realtime/useStageRoomSession";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";
import { getPersistentDeviceId } from "@/core/utils/device-id";
import { TimerControl } from "@/features/timer/components/TimerControl";
import { BriefControl } from "@/features/brief/components/BriefControl";
import { CopyRoomCodeButton } from "@/components/ui/CopyRoomCodeButton";
import { MaterialUploader } from "@/features/material/components/MaterialUploader";
import { Material } from "@/core/types";
import { useMaterialQueuePreloader } from "@/features/material/hooks/useMaterialQueuePreloader";

function ControlRoomContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRoomCode = searchParams.get("roomCode");
  const roomCode = rawRoomCode ? rawRoomCode.trim().toUpperCase() : "";
  const requestedRole = (searchParams.get("role") || "host") as "host" | "control";
  const isHost = requestedRole === "host";

  const [deviceId] = useState(() => getPersistentDeviceId(requestedRole, roomCode, searchParams.get("deviceId")));
  const [showUploader, setShowUploader] = useState(false);

  const { state, roomError, roomName, approvalStatus, dispatchCommand } = useStageRoomSession({
    roomCode,
    role: requestedRole,
    deviceId,
    deviceName: isHost ? "Host Primary Controller" : "Brief Controller",
  });

  useMaterialQueuePreloader(state?.materials, deviceId);

  const handleMaterialAdd = (newMaterial: Material) => {
    setShowUploader(false);
    dispatchCommand("MATERIAL_ADD", { material: newMaterial });
  };

  const handleApprove = useCallback(
    (targetDeviceId: string) => {
      dispatchCommand("DEVICE_APPROVE", { targetDeviceId });
    },
    [dispatchCommand]
  );

  const handleReject = useCallback(
    (targetDeviceId: string) => {
      dispatchCommand("DEVICE_REJECT", { targetDeviceId });
    },
    [dispatchCommand]
  );

  const handleRemove = useCallback(
    (targetDeviceId: string) => {
      dispatchCommand("DEVICE_REMOVE", { targetDeviceId });
    },
    [dispatchCommand]
  );

  // 1. Technical & Room Access Errors
  if (roomError) {
    return <FriendlyErrorState errorType={roomError} roomCode={roomCode} />;
  }

  // 2. Pending Host Approval State for Non-Host Control Role
  if (!isHost && approvalStatus === "pending") {
    return (
      <PendingApprovalState
        deviceName="Brief Controller"
        roomCode={roomCode}
        role="control"
      />
    );
  }

  // 3. Rejected or Revoked Access State
  if (!isHost && (approvalStatus === "rejected" || approvalStatus === "revoked")) {
    return (
      <FriendlyErrorState
        errorType={approvalStatus === "revoked" ? "DEVICE_REVOKED" : "DEVICE_REJECTED"}
        roomCode={roomCode}
      />
    );
  }

  const allDevices = state ? Object.values(state.devices) : [];
  const pendingDevices = allDevices.filter((d) => d.approvalStatus === "pending");
  const approvedDevices = allDevices.filter((d) => d.approvalStatus === "approved" || d.approvalStatus === "connected");

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none">
      {/* Top Header Bar — Ultra-Clean Single Row */}
      <header className="h-14 px-3 sm:px-6 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center font-black text-white glow-purple text-xs flex-shrink-0">
            SP
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-3 min-w-0">
            <CopyRoomCodeButton roomCode={roomCode} />
            {roomName && <span className="text-[11px] text-purple-300 font-semibold truncate hidden md:inline">({roomName})</span>}
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-3 flex-shrink-0">
          {isHost && (
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition"
            >
              Dashboard
            </Link>
          )}
        </div>
      </header>

      {/* Main Workspace Body - Responsive Edge-to-Edge Layout */}
      <div className="flex-1 w-full px-3 sm:px-6 py-4 sm:py-6 flex flex-col lg:grid lg:grid-cols-12 gap-4 sm:gap-6 overflow-y-auto lg:overflow-hidden">
        {/* Left Column: Device Authorization (Host Only - Compact Sidebar) */}
        {isHost && (
          <aside className="col-span-12 lg:col-span-3 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-800/80 pb-4 lg:pb-0 pr-0 lg:pr-6 overflow-y-auto max-h-[300px] lg:max-h-[calc(100vh-6rem)]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-purple-400" />
                <span>Device Authorization</span>
              </h2>
              <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-2 py-0.5 rounded-md font-bold">
                {pendingDevices.length} Pending
              </span>
            </div>

            {/* Pending Devices Section */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase text-amber-400 block">
                Pending Requests ({pendingDevices.length})
              </span>

              {pendingDevices.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40 text-slate-500 text-[11px]">
                  No pending requests.
                </div>
              ) : (
                pendingDevices.map((device) => (
                  <div
                    key={device.id}
                    className="p-3 rounded-2xl bg-slate-900 border border-amber-500/40 shadow-md space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white truncate max-w-[120px]">{device.name}</span>
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-purple-300 border border-slate-700">
                        {device.role}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{device.id}</p>

                    <div className="flex items-center space-x-1.5 pt-1">
                      <button
                        onClick={() => handleApprove(device.id)}
                        className="flex-1 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition flex items-center justify-center space-x-1 shadow-sm"
                      >
                        <CheckCircle className="w-3 h-3" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => handleReject(device.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-950 border border-rose-800 hover:bg-rose-900 text-rose-300 text-[10px] font-bold transition flex items-center justify-center"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Approved Devices Section */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <span className="text-[10px] font-mono font-bold uppercase text-purple-400 flex items-center justify-between">
                <span>Approved Devices ({approvedDevices.length})</span>
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>

              {approvedDevices.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40 text-slate-500 text-[11px]">
                  No active devices.
                </div>
              ) : (
                approvedDevices.map((device) => (
                  <div
                    key={device.id}
                    className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                        <span className="font-bold text-xs text-white truncate">{device.name}</span>
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                          {device.role}
                        </span>
                      </div>
                    </div>

                    {!device.isHostDevice && (
                      <button
                        onClick={() => handleRemove(device.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition"
                        title="Revoke Permission"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </aside>
        )}

        {/* Right Area: Brief & Stage Control Center (Full-Width for Non-Host, Grid for Host) */}
        <main className={`${isHost ? "col-span-12 lg:col-span-9" : "col-span-12"} space-y-6 overflow-y-auto max-h-[calc(100vh-6rem)] pr-1`}>

          {/* Grid: Timer & Brief Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Stage Timer Widget */}
            {state && (
              <TimerControl
                timer={state.timer}
                onStart={() => dispatchCommand("TIMER_START")}
                onPause={() => dispatchCommand("TIMER_PAUSE")}
                onReset={() => dispatchCommand("TIMER_RESET")}
                onSetDuration={(duration) => dispatchCommand("TIMER_SET", { duration })}
              />
            )}

            {/* Speaker Brief / Show Caller Cue Widget */}
            {state && (
              <BriefControl
                brief={state.brief}
                onSendBrief={(text, urgency) => dispatchCommand("BRIEF_UPDATE", { text, urgency })}
                onResetBrief={() => dispatchCommand("BRIEF_CLEAR", {})}
              />
            )}
          </div>

          {/* Stage Materials Playlist Queue Section */}
          <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <ListVideo className="w-4 h-4 text-purple-400" />
                  <span>Stage Materials Queue ({state?.materials.length || 0})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tambahkan materi presentasi (Google Slides, Canva, PDF, Video) dan aktifkan penayangan saat giliran pembicara.
                </p>
              </div>

              <button
                onClick={() => setShowUploader(!showUploader)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 shadow glow-purple cursor-pointer flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{showUploader ? "Tutup Form" : "Add Material to Queue"}</span>
              </button>
            </div>

            {showUploader && (
              <div className="pt-2">
                <MaterialUploader
                  roomCode={roomCode}
                  deviceId={deviceId}
                  onMaterialAdded={handleMaterialAdd}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pt-1">
              {state?.materials && state.materials.length > 0 ? (
                state.materials.map((mat) => {
                  const isLive = state.presentation.isPresenting && state.presentation.materialId === mat.id;

                  return (
                    <div
                      key={mat.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col justify-between min-h-[140px] ${
                        isLive
                          ? "bg-purple-950/40 border-purple-500/80 ring-1 ring-purple-500/40 shadow-xl"
                          : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400">
                            {mat.type.toUpperCase()} • {mat.totalPages} SLIDES
                          </span>

                          {isLive ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center space-x-1 animate-pulse flex-shrink-0">
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>LIVE</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[9px] font-bold uppercase tracking-wider flex-shrink-0">
                              READY
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-2 mb-1">{mat.name}</h4>
                        {mat.url && <p className="text-[10px] font-mono text-slate-400 truncate">{mat.url}</p>}
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center space-x-2">
                        <button
                          onClick={() => {
                            dispatchCommand("PRESENTATION_START", { materialId: mat.id, startPage: 1 });
                            router.push(`/control/presentation?roomCode=${encodeURIComponent(roomCode)}${isHost ? "&role=host" : "&role=control"}`);
                          }}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 glow-purple shadow-md cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{isLive ? "VIEW LIVE PRESENTATION" : "GO LIVE / PRESENT"}</span>
                        </button>
                        {!isLive && (
                          <button
                            onClick={() => {
                              dispatchCommand("MATERIAL_REMOVE", { materialId: mat.id });
                              fetch("/api/material/delete", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ materialId: mat.id }),
                              }).catch(() => {});
                            }}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition cursor-pointer flex-shrink-0"
                            title="Delete Material Permanently from Database"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-full p-6 sm:p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                  Belum ada materi di antrean. Klik tombol <strong>&quot;Add Material to Queue&quot;</strong> di atas untuk memasukkan link atau file presentasi.
                </div>
              )}
            </div>
          </div>

          {/* Live Displays Quick Access Panel */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Tv className="w-4 h-4 text-purple-400" />
              <span>Live Stage Display Windows</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Audience Display Link */}
              <a
                href={`/display/audience?roomCode=${roomCode}`}
                target="_blank"
                rel="noreferrer"
                className="p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition flex items-center justify-between group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition">
                    <Tv className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Audience Stage Output</h4>
                    <p className="text-[11px] text-slate-400">Clean full-screen presentation display</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-purple-400 font-bold group-hover:translate-x-0.5 transition">↗</span>
              </a>

              {/* Confidence Display Link */}
              <a
                href={`/display/confidence?roomCode=${roomCode}`}
                target="_blank"
                rel="noreferrer"
                className="p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-purple-500/50 transition flex items-center justify-between group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-800/60 flex items-center justify-center text-purple-400 group-hover:scale-105 transition">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Confidence Display HUD</h4>
                    <p className="text-[11px] text-slate-400">Speaker timer, next slide &amp; show caller brief cues</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-purple-400 font-bold group-hover:translate-x-0.5 transition">↗</span>
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ControlRoomPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>}>
      <ControlRoomContent />
    </Suspense>
  );
}
