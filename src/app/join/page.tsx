"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DeviceRole, StageSessionState } from "@/core/types";
import { Radio, Tv, Monitor, ArrowRight, AlertCircle, RefreshCw, CheckCircle2, Search } from "lucide-react";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";

interface ActiveRoomSummary {
  roomCode: string;
  title: string;
  createdAt: number;
  status: string;
}

function getAutoDetectedDefaultDeviceName(role: DeviceRole): string {
  if (typeof window === "undefined") {
    return role === "control" ? "Operator Controller" : role === "audience" ? "Audience Display" : "Confidence Monitor";
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
  const roleLabel =
    role === "control"
      ? "Operator"
      : role === "audience"
      ? "Audience Display"
      : "Confidence Monitor";

  return `${os} ${roleLabel}${browserPart}`.trim();
}

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRoomCode = searchParams.get("roomCode")?.trim().toUpperCase() || "";
  const initialRole = (searchParams.get("role") as DeviceRole) || "control";

  const [activeRooms, setActiveRooms] = useState<ActiveRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [searchQuery, setSearchQuery] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [role, setRole] = useState<DeviceRole>(initialRole);
  const [status, setStatus] = useState<"form" | "waiting" | "rejected">("form");
  const [error, setError] = useState<string | null>(null);
  const [generatedDeviceId, setGeneratedDeviceId] = useState("");
  const [effectiveDeviceName, setEffectiveDeviceName] = useState("");

  const fetchActiveRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await fetch("/api/room/active");
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
          `/api/ws?roomCode=${encodeURIComponent(roomCode)}&deviceId=${encodeURIComponent(
            generatedDeviceId
          )}&role=${role}&deviceName=${encodeURIComponent(devNameToUse)}`
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

                if (role === "audience") {
                  router.push(`/display/audience?roomCode=${encodeURIComponent(roomCode)}`);
                } else if (role === "confidence") {
                  router.push(`/display/confidence?roomCode=${encodeURIComponent(roomCode)}`);
                } else {
                  router.push(`/control?roomCode=${encodeURIComponent(roomCode)}&role=control`);
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

    try {
      // 1. Validate room code with backend
      const res = await fetch("/api/room/validate", {
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
                    placeholder="Cari nama room..."
                    className="w-full pl-8.5 pr-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}

              {loadingRooms && activeRooms.length === 0 ? (
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Mencari room aktif...</span>
                </div>
              ) : filteredRooms.length > 0 ? (
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {filteredRooms.map((room) => {
                    const isSelected = roomCode === room.roomCode;
                    return (
                      <div
                        key={room.roomCode}
                        onClick={() => setRoomCode(room.roomCode)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? "bg-purple-600/15 border-purple-500 ring-2 ring-purple-500/30 text-white shadow-md"
                            : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>Live Room</span>
                            </span>
                          </div>
                          <h3 className="font-bold text-xs sm:text-sm truncate text-white">
                            {room.title}
                          </h3>
                        </div>

                        <div className="flex-shrink-0">
                          {isSelected ? (
                            <CheckCircle2 className="w-5 h-5 text-purple-400 fill-purple-500/20" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-slate-700" />
                          )}
                        </div>
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

          {/* Requested Device Role */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              2. Peran Perangkat (Role)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setRole("control")}
                className={`p-3 rounded-2xl border flex sm:flex-col items-center justify-start sm:justify-center transition cursor-pointer text-left sm:text-center space-x-3 sm:space-x-0 ${
                  role === "control"
                    ? "bg-purple-600/20 border-purple-500 text-purple-300 ring-2 ring-purple-500/30"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                <div className="p-2 rounded-xl bg-purple-950/80 text-purple-400 sm:mb-1.5 flex-shrink-0">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Control Room</span>
                  <span className="text-[10px] text-slate-400 block sm:hidden">Operator / Kru</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole("audience")}
                className={`p-3 rounded-2xl border flex sm:flex-col items-center justify-start sm:justify-center transition cursor-pointer text-left sm:text-center space-x-3 sm:space-x-0 ${
                  role === "audience"
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                <div className="p-2 rounded-xl bg-indigo-950/80 text-indigo-400 sm:mb-1.5 flex-shrink-0">
                  <Tv className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Audience</span>
                  <span className="text-[10px] text-slate-400 block sm:hidden">Proyektor / LED</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRole("confidence")}
                className={`p-3 rounded-2xl border flex sm:flex-col items-center justify-start sm:justify-center transition cursor-pointer text-left sm:text-center space-x-3 sm:space-x-0 ${
                  role === "confidence"
                    ? "bg-blue-600/20 border-blue-500 text-blue-300 ring-2 ring-blue-500/30"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                }`}
              >
                <div className="p-2 rounded-xl bg-blue-950/80 text-blue-400 sm:mb-1.5 flex-shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">Confidence</span>
                  <span className="text-[10px] text-slate-400 block sm:hidden">Monitor Panggung</span>
                </div>
              </button>
            </div>
          </div>

          {/* Device Identifier */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                3. Nama Perangkat / Operator
              </label>
              <span className="text-[11px] text-slate-500">Opsional</span>
            </div>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={autoNameHint}
              className="w-full px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-purple-500 transition"
            />
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

