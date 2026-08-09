"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DeviceRole, StageSessionState } from "@/core/types";
import { Radio, Tv, Monitor, ArrowRight, AlertCircle } from "lucide-react";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";

export default function JoinPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [role, setRole] = useState<DeviceRole>("control");
  const [status, setStatus] = useState<"form" | "waiting" | "rejected">("form");
  const [error, setError] = useState<string | null>(null);
  const [generatedDeviceId, setGeneratedDeviceId] = useState("");

  useEffect(() => {
    let isMounted = true;
    if (status !== "waiting" || !roomCode || !generatedDeviceId) return;

    const checkApproval = async () => {
      try {
        const res = await fetch(
          `/api/ws?roomCode=${encodeURIComponent(roomCode)}&deviceId=${encodeURIComponent(
            generatedDeviceId
          )}&role=${role}&deviceName=${encodeURIComponent(deviceName)}`
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
  }, [status, roomCode, generatedDeviceId, role, deviceName, router]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode || !deviceName.trim()) return;

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
        throw new Error(data.reason || "Kode room tidak valid");
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
        )}&role=${role}&deviceName=${encodeURIComponent(deviceName.trim())}`
      );

      // ALL GUEST ROLES enter PENDING APPROVAL state
      setStatus("waiting");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal terhubung ke room";
      if (msg === "ROOM_NOT_FOUND") {
        setError("Room tidak ditemukan. Periksa kembali kode room.");
      } else {
        setError(msg);
      }
      setStatus("form");
    }
  };

  if (status === "waiting") {
    return (
      <PendingApprovalState
        deviceName={deviceName}
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

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white font-bold text-2xl mb-3 shadow-lg glow-purple">
            SP
          </div>
          <h1 className="text-2xl font-bold">Join Stage Room</h1>
          <p className="text-slate-400 text-sm mt-1">
            Guest Pairing &amp; Role Authorization
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Room Code
            </label>
            <input
              type="text"
              maxLength={6}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="e.g. A7K9P2"
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-center font-mono text-2xl font-bold tracking-widest text-purple-400 focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Device / Operator Name
            </label>
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. Backstage iPad / Stage Left"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-purple-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Requested Device Role
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setRole("control")}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition ${
                  role === "control"
                    ? "bg-purple-600/20 border-purple-500 text-purple-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Radio className="w-5 h-5 mb-1" />
                <span className="text-xs font-semibold">Control</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("audience")}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition ${
                  role === "audience"
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Tv className="w-5 h-5 mb-1" />
                <span className="text-xs font-semibold">Audience</span>
              </button>

              <button
                type="button"
                onClick={() => setRole("confidence")}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition ${
                  role === "confidence"
                    ? "bg-blue-600/20 border-blue-500 text-blue-300"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                <Monitor className="w-5 h-5 mb-1" />
                <span className="text-xs font-semibold">Confidence</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm transition flex items-center justify-center space-x-2 glow-purple mt-6"
          >
            <span>Submit Join Request</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
