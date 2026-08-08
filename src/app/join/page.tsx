"use client";

import { useState } from "react";
import Link from "next/link";
import { DeviceRole } from "@/core/types";
import { Radio, Tv, Monitor, ArrowRight } from "lucide-react";

export default function JoinPage() {
  const [roomCode, setRoomCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [role, setRole] = useState<DeviceRole>("control");
  const [status, setStatus] = useState<"form" | "waiting" | "connected">("form");

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode || !deviceName) return;
    setStatus("waiting");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white font-bold text-2xl mb-3 shadow-lg glow-purple">
            SP
          </div>
          <h1 className="text-2xl font-bold">Join Stage Room</h1>
          <p className="text-slate-400 text-sm mt-1">
            Guest Pairing & Role Authorization
          </p>
        </div>

        {status === "form" && (
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
        )}

        {status === "waiting" && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto" />
            <h3 className="font-bold text-lg text-white">Waiting for Host Approval</h3>
            <p className="text-slate-400 text-xs max-w-xs mx-auto">
              Device <span className="text-purple-300 font-semibold">{deviceName}</span> requested access to room <span className="font-mono text-purple-400">{roomCode}</span> as <span className="capitalize">{role}</span>.
            </p>
            <button
              onClick={() => setStatus("form")}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Cancel Request
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-800 text-center">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← Return to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
