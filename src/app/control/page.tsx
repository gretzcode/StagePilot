"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Users, CheckCircle, XCircle, Play, Square, Trash2, Tv, Monitor, ListVideo, Plus } from "lucide-react";
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
  const rawRole = searchParams.get("role")?.toLowerCase();
  const requestedRole = (rawRole || "host") as "host" | "operator" | "control" | "speaker";
  const isHost = requestedRole === "host";

  const [deviceId] = useState(() => getPersistentDeviceId(requestedRole, roomCode, searchParams.get("deviceId")));
  const [showUploader, setShowUploader] = useState(false);

  // Authenticate host session for Host role access
  useEffect(() => {
    if (isHost) {
      fetch("/api/auth/me", { credentials: "include" })
        .then((res) => {
          if (!res.ok) {
            router.push(`/login?redirect=/control?roomCode=${encodeURIComponent(roomCode)}`);
          }
        })
        .catch(() => {
          router.push(`/login?redirect=/control?roomCode=${encodeURIComponent(roomCode)}`);
        });
    }
  }, [isHost, roomCode, router]);

  const { state, roomError, roomName, approvalStatus, myDevice, dispatchCommand } = useStageRoomSession({
    roomCode,
    role: requestedRole,
    deviceId,
    deviceName: isHost
      ? "Host Primary Controller"
      : requestedRole === "speaker"
      ? "Speaker Controller"
      : "Operator Controller",
  });

  const canManageDevices = isHost;

  useMaterialQueuePreloader(state?.materials, deviceId, state?.presentation?.materialId);

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

  // 2. Pending Host Approval State for Non-Host Participant Role
  if (!isHost && approvalStatus === "pending") {
    return (
      <PendingApprovalState
        deviceName={myDevice?.name || (requestedRole === "speaker" ? "Speaker Device" : "Operator Device")}
        roomCode={roomCode}
        role={requestedRole === "speaker" ? "speaker" : "operator"}
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

  // Deduplicate host entries: exactly 1 host entry + all approved guest devices
  const nonHostApproved = allDevices.filter(
    (d) => (d.approvalStatus === "approved" || d.approvalStatus === "connected") && d.role !== "host" && !d.isHostDevice
  );
  const activeHostDevice = allDevices.find(
    (d) => (d.approvalStatus === "approved" || d.approvalStatus === "connected") && (d.role === "host" || d.isHostDevice)
  );
  const approvedDevices = activeHostDevice ? [activeHostDevice, ...nonHostApproved] : nonHostApproved;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
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
        {/* Left Column: Device Authorization (Strictly Host Only - Compact Sidebar) */}
        {isHost && (
          <aside className="col-span-12 lg:col-span-3 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-800/80 pb-4 lg:pb-0 pr-0 lg:pr-6 lg:overflow-y-auto lg:max-h-[calc(100vh-6rem)]">
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
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-xs text-white break-words flex-1 leading-snug">{device.name}</span>
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-purple-300 border border-slate-700 flex-shrink-0">
                        {device.role}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{device.id}</p>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprove(device.id);
                        }}
                        className="flex-1 min-h-[36px] py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-95 text-white text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-sm touch-manipulation cursor-pointer select-none"
                      >
                        <CheckCircle className="w-3.5 h-3.5 pointer-events-none" />
                        <span className="pointer-events-none">Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReject(device.id);
                        }}
                        className="min-h-[36px] min-w-[36px] px-3 py-2 rounded-xl bg-rose-950/80 border border-rose-800/80 hover:bg-rose-900 active:bg-rose-950 active:scale-95 text-rose-300 text-xs font-bold transition flex items-center justify-center touch-manipulation cursor-pointer select-none"
                        title="Reject Request"
                      >
                        <XCircle className="w-3.5 h-3.5 pointer-events-none" />
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
                      <div className="flex items-start space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 mt-1" />
                        <span className="font-bold text-xs text-white break-words leading-snug flex-1">{device.name}</span>
                      </div>
                      <div className="flex items-center space-x-2 mt-1 ml-3.5">
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                          {device.role}
                        </span>
                      </div>
                    </div>

                    {!device.isHostDevice && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(device.id);
                        }}
                        className="min-h-[36px] min-w-[36px] p-2 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 active:bg-rose-900 active:text-rose-200 active:scale-95 text-slate-400 transition cursor-pointer touch-manipulation flex items-center justify-center select-none"
                        title="Revoke Permission"
                      >
                        <Trash2 className="w-4 h-4 pointer-events-none" />
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

          {/* Active Screen Shares (Sources) */}
          {state?.screenShareSources && Object.keys(state.screenShareSources).length > 0 && (
            <div className="glass-panel p-4 sm:p-5 rounded-3xl border border-cyan-900/50 bg-cyan-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 flex items-center space-x-2">
                  <Monitor className="w-4 h-4 text-cyan-400" />
                  <span>Active Screen Shares ({Object.keys(state.screenShareSources).length})</span>
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-800 text-cyan-300 text-[10px] font-bold uppercase">
                  Available Sources
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.values(state.screenShareSources).map((source) => (
                  <div key={source.deviceId} className="p-3 rounded-2xl bg-slate-900/80 border border-cyan-800/40 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{source.speakerName}</p>
                      <p className="text-[10px] text-cyan-400">Screen Sharing Active</p>
                    </div>
                    {isHost && (
                      <button
                        onClick={() => dispatchCommand("SCREEN_SHARE_STOP", { targetDeviceId: source.deviceId })}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 text-[10px] font-bold cursor-pointer"
                        title="Stop Speaker Screen Share"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400">
                              {mat.type === "video"
                                ? (mat.totalPages > 1 ? `VIDEO PLAYLIST • ${mat.totalPages} VIDEOS` : "VIDEO")
                                : `${mat.type.toUpperCase()} • ${mat.totalPages} SLIDES`}
                            </span>

                            {mat.ownerRole && (
                              <span
                                className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${
                                  mat.ownerRole === "speaker"
                                    ? "bg-indigo-950/80 border-indigo-700/60 text-indigo-300"
                                    : mat.ownerRole === "host"
                                    ? "bg-purple-950/80 border-purple-700/60 text-purple-300"
                                    : "bg-emerald-950/80 border-emerald-700/60 text-emerald-300"
                                }`}
                              >
                                {mat.ownerRole === "speaker"
                                  ? `👤 Speaker: ${mat.ownerName || "Speaker"}`
                                  : mat.ownerRole === "host"
                                  ? "👑 Host"
                                  : `🎮 ${mat.ownerName || "Operator"}`}
                              </span>
                            )}
                          </div>

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
                          type="button"
                          onClick={() => {
                            if (!isLive) {
                              dispatchCommand("PRESENTATION_START", { materialId: mat.id, startPage: 1 });
                            }
                            router.push(`/control/presentation?roomCode=${encodeURIComponent(roomCode)}${isHost ? "&role=host" : "&role=control"}`);
                          }}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 active:scale-95 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 glow-purple shadow-md cursor-pointer touch-manipulation"
                        >
                          <Play className="w-3.5 h-3.5 fill-current pointer-events-none" />
                          <span className="pointer-events-none">{isLive ? "VIEW LIVE PRESENTATION" : "GO LIVE / PRESENT"}</span>
                        </button>
                        {isLive ? (
                          <button
                            type="button"
                            onClick={() => {
                              dispatchCommand("PRESENTATION_EXIT");
                            }}
                            className="min-h-[40px] px-3 rounded-xl bg-rose-950/80 border border-rose-800 hover:bg-rose-900 active:bg-rose-950 text-rose-300 text-xs font-bold transition cursor-pointer flex-shrink-0 touch-manipulation flex items-center justify-center space-x-1 shadow-md select-none"
                            title="Stop Presentation across all screens"
                          >
                            <Square className="w-3.5 h-3.5" />
                            <span>STOP</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              dispatchCommand("MATERIAL_REMOVE", { materialId: mat.id });
                              fetch("/api/material/delete", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ materialId: mat.id }),
                              }).catch(() => {});
                            }}
                            className="min-h-[40px] min-w-[40px] p-2.5 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-400 active:bg-rose-900 active:text-rose-200 active:scale-95 text-slate-400 transition cursor-pointer flex-shrink-0 touch-manipulation flex items-center justify-center select-none"
                            title="Delete Material Permanently from Database"
                          >
                            <Trash2 className="w-4 h-4 pointer-events-none" />
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
