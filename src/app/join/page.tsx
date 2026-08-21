"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ParticipantRole, StageSessionState } from "@/core/types";
import { Radio, Mic, ArrowRight, AlertCircle, RefreshCw, CheckCircle2, Search } from "lucide-react";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";
import { ROUTES, API_ROUTES } from "@/lib/routes";

interface ActiveRoomSummary {
  roomCode: string;
  title: string;
  createdAt: number;
  status: string;
}

function getAutoDetectedDefaultDeviceName(role: ParticipantRole): string {
  if (typeof window === "undefined") {
    return role === "speaker" ? "Speaker Device" : "Operator Controller";
  }

  const ua = navigator.userAgent || "";
  let os = "Device";
  let browser = "";

  // Detect OS / Hardware
  if (/iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    os = "iPad";
  } else if (/iPhone/i.test(ua)) {
    os = "iPhone";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = "MacBook";
  } else if (/Windows/i.test(ua)) {
    os = "Windows PC";
  } else if (/Android/i.test(ua)) {
    const isTablet = Math.min(window.screen.width, window.screen.height) >= 600;
    os = isTablet ? "Android Tablet" : "Android Phone";
  } else if (/Linux/i.test(ua)) {
    os = "Linux PC";
  } else if (/CrOS/i.test(ua)) {
    os = "Chromebook";
  }

  // Detect Browser
  if (/Edg\//i.test(ua)) {
    browser = "Edge";
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = "Safari";
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox";
  }

  const browserPart = browser ? ` (${browser})` : "";
  const roleLabel = role === "speaker" ? "Speaker" : "Operator";

  return `${os} ${roleLabel}${browserPart}`.trim();
}

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRoomCode = searchParams.get("roomCode")?.trim().toUpperCase() || "";
  const rawRole = searchParams.get("role")?.toLowerCase();
  const initialRole: ParticipantRole = rawRole === "speaker" ? "speaker" : "operator";

  const [activeRooms, setActiveRooms] = useState<ActiveRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [searchQuery, setSearchQuery] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [savedSpeakerName, setSavedSpeakerName] = useState("");
  const [role, setRole] = useState<ParticipantRole>(initialRole);
  const [status, setStatus] = useState<"form" | "waiting" | "rejected">("form");
  const [error, setError] = useState<string | null>(null);
  const [generatedDeviceId, setGeneratedDeviceId] = useState("");
  const [effectiveDeviceName, setEffectiveDeviceName] = useState("");

  // Load previously saved speaker name for quick resume on device change
  useEffect(() => {
    try {
      const lastSpeaker = localStorage.getItem("stagepilot_last_speaker_name");
      if (lastSpeaker && lastSpeaker.trim()) {
        setSavedSpeakerName(lastSpeaker.trim());
        if (role === "speaker" && !deviceName) {
          setDeviceName(lastSpeaker.trim());
        }
      }
    } catch {
      // Ignore storage error
    }
  }, [role]);

  const fetchActiveRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await fetch(API_ROUTES.room.active);
      if (res.ok) {
        const data = (await res.json()) as { success?: boolean; rooms?: ActiveRoomSummary[] };
        if (data.success && Array.isArray(data.rooms)) {
          setActiveRooms(data.rooms);
          // If only 1 room is available and roomCode is not set yet, auto-select it
          if (data.rooms.length === 1 && !roomCode && !initialRoomCode) {
            setRoomCode(data.rooms[0].roomCode);
          }
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchActiveRooms();
    const interval = setInterval(fetchActiveRooms, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (status !== "waiting" || !roomCode || !generatedDeviceId) return;

    const devNameToUse = effectiveDeviceName || getAutoDetectedDefaultDeviceName(role);

    const checkApproval = async () => {
      try {
        const res = await fetch(
          API_ROUTES.ws({
            roomCode,
            deviceId: generatedDeviceId,
            role,
            deviceName: devNameToUse,
          })
        );
        if (res.ok && isMounted) {
          const data = (await res.json()) as { type?: string; state?: StageSessionState };
          if (data.type === "SYNC_STATE" && data.state) {
            const myDev = data.state.devices[generatedDeviceId];
            if (myDev) {
              if (myDev.approvalStatus === "approved") {
                try {
                  localStorage.setItem(`stagepilot_dev_id_${role}_${roomCode.toUpperCase()}`, generatedDeviceId);
                } catch {
                  // Ignore storage errors
                }

                if (role === "speaker") {
                  router.push(ROUTES.presentation(roomCode, "speaker"));
                } else {
                  router.push(ROUTES.control(roomCode, "operator"));
                }
              } else if (myDev.approvalStatus === "rejected" || myDev.approvalStatus === "revoked") {
                setStatus("rejected");
              }
            }
          }
        }
      } catch {
        // Ignore
      }
    };

    const interval = setInterval(checkApproval, 1000);
    checkApproval();

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [status, roomCode, generatedDeviceId, role, effectiveDeviceName, router]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError("Silakan pilih salah satu room aktif terlebih dahulu.");
      return;
    }

    const finalDeviceName = deviceName.trim() || getAutoDetectedDefaultDeviceName(role);
    setEffectiveDeviceName(finalDeviceName);

    if (role === "speaker" && finalDeviceName) {
      try {
        localStorage.setItem("stagepilot_last_speaker_name", finalDeviceName);
      } catch {
        // Ignore storage errors
      }
    }

    try {
      // 1. Validate room code with backend
      const res = await fetch(API_ROUTES.room.validate, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: normalizedCode }),
      });
      const data = (await res.json()) as { valid?: boolean; reason?: string; error?: string };
      if (!res.ok || !data.valid) {
        if (data.reason === "ROOM_NOT_FOUND" || data.error === "ROOM_NOT_FOUND") {
          throw new Error("ROOM_NOT_FOUND");
        }
        throw new Error(data.reason || "Room tidak ditemukan atau sudah ditutup.");
      }

      const devId = `dev-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        localStorage.setItem(`stagepilot_dev_id_${role}_${normalizedCode}`, devId);
      } catch {
        // Ignore storage errors
      }
      setGeneratedDeviceId(devId);
      setRoomCode(normalizedCode);

      // Register device as pending in backend
      await fetch(
        `/api/ws?roomCode=${encodeURIComponent(normalizedCode)}&deviceId=${encodeURIComponent(
          devId
        )}&role=${role}&deviceName=${encodeURIComponent(finalDeviceName)}`
      );

      // ALL GUEST ROLES enter PENDING APPROVAL state
      setStatus("waiting");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal terhubung ke room";
      if (msg === "ROOM_NOT_FOUND") {
        setError("Room tidak ditemukan atau sudah berakhir. Silakan pilih room aktif lainnya.");
      } else {
        setError(msg);
      }
      setStatus("form");
    }
  };

  if (status === "waiting") {
    return (
      <PendingApprovalState
        deviceName={effectiveDeviceName || getAutoDetectedDefaultDeviceName(role)}
        roomCode={roomCode}
        role={role}
        onCancel={() => setStatus("form")}
      />
    );
  }

  if (status === "rejected") {
    return (
      <FriendlyErrorState
        errorType="DEVICE_REJECTED"
        roomCode={roomCode}
        onRetry={() => setStatus("form")}
      />
    );
  }

  const filteredRooms = activeRooms.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedRoomObj = activeRooms.find((r) => r.roomCode === roomCode);
  const autoNameHint = getAutoDetectedDefaultDeviceName(role);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-3 sm:p-6 md:p-8">
      <div className="w-full max-w-lg glass-panel p-6 sm:p-8 md:p-10 rounded-3xl border border-slate-800 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white font-bold text-2xl mb-3 shadow-lg glow-purple">
            SP
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Join Stage Room</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Pilih room aktif &amp; sambungkan perangkat Anda
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-5">
          {/* Room Selection Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                1. Pilih Stage Room
              </label>
              <button
                type="button"
                onClick={fetchActiveRooms}
                disabled={loadingRooms}
                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center space-x-1 cursor-pointer"
                title="Segarkan daftar room"
              >
                <RefreshCw className={`w-3 h-3 ${loadingRooms ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="space-y-2">
              {activeRooms.length >= 3 && (
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari berdasarkan judul room..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
                  />
                </div>
              )}

              {loadingRooms && activeRooms.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-center space-x-2 text-slate-400 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Memuat daftar room...</span>
                </div>
              ) : filteredRooms.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {filteredRooms.map((room) => {
                    const isSelected = roomCode === room.roomCode;
                    return (
                      <div
                        key={room.roomCode}
                        onClick={() => setRoomCode(room.roomCode)}
                        className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-purple-600/20 border-purple-500 ring-2 ring-purple-500/30"
                            : "bg-slate-900 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div
                            className={`w-3 h-3 rounded-full flex-shrink-0 ${
                              isSelected ? "bg-purple-400 animate-pulse" : "bg-emerald-400"
                            }`}
                          />
                          <div className="truncate">
                            <h3 className="text-xs sm:text-sm font-semibold truncate text-slate-200">
                              {room.title}
                            </h3>
                            <span className="text-[10px] text-slate-400 font-mono tracking-wider">
                              CODE: {room.roomCode}
                            </span>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0 ml-2" />}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-slate-400 text-xs">
                  <p className="mb-2">Tidak ada stage room aktif saat ini.</p>
                  <p className="text-[11px] text-slate-500">Minta Host untuk membuka room dari Dashboard terlebih dahulu.</p>
                </div>
              )}
            </div>
          </div>

          {/* Requested Participant Role */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              2. Peran Partisipan (Role)
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRole("operator")}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center transition cursor-pointer text-center space-y-1.5 ${
                  role === "operator"
                    ? "bg-purple-600/20 border-purple-500 text-purple-300 ring-2 ring-purple-500/30"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                <div className="p-2.5 rounded-xl bg-purple-950/80 text-purple-400">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Operator</span>
                  <span className="text-[10px] text-slate-400 block">Control Room / Kru</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole("speaker")}
                className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center transition cursor-pointer text-center space-y-1.5 ${
                  role === "speaker"
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                <div className="p-2.5 rounded-xl bg-indigo-950/80 text-indigo-400">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Speaker</span>
                  <span className="text-[10px] text-slate-400 block">Presenter / Keynote</span>
                </div>
              </button>
            </div>
          </div>

          {/* Device / Speaker Identifier */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {role === "speaker" ? "3. Nama Pembicara (Speaker Name)" : "3. Nama Operator / Perangkat"}
              </label>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                role === "speaker"
                  ? "bg-indigo-950/80 text-indigo-400 border border-indigo-800/60"
                  : "text-slate-500"
              }`}>
                {role === "speaker" ? "Penting untuk Materi" : "Opsional"}
              </span>
            </div>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={role === "speaker" ? "Contoh: Budi Santoso / Keynote Speaker" : autoNameHint}
              className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
            />
            {role === "speaker" ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Materi presentasi Anda akan dihubungkan ke nama ini, sehingga tetap aman dan tersimpan jika Anda berpindah perangkat.
                </p>
                {savedSpeakerName && savedSpeakerName !== deviceName && (
                  <button
                    type="button"
                    onClick={() => setDeviceName(savedSpeakerName)}
                    className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-800/40 text-[11px] text-indigo-300 hover:bg-indigo-900/80 transition cursor-pointer"
                  >
                    <span>Lanjutkan sebagai:</span>
                    <strong className="font-semibold text-indigo-200">{savedSpeakerName}</strong>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 mt-1.5">
                Nama untuk mengidentifikasi perangkat Anda di Control Room.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!roomCode}
            className="w-full py-3.5 px-4 rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-sm transition flex items-center justify-center space-x-2 glow-purple mt-4 cursor-pointer shadow-lg"
          >
            <span>
              {roomCode
                ? `Sambungkan ke ${selectedRoomObj ? selectedRoomObj.title : "Room"}`
                : "Pilih Room Terlebih Dahulu"}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
        </div>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}

