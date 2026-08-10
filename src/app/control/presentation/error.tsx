"use client";

import { useEffect } from "react";

export default function PresentationError() {
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const roomCode = searchParams.get("roomCode") || "";
      const role = searchParams.get("role") || "host";
      if (roomCode) {
        window.location.href = `/control?roomCode=${encodeURIComponent(roomCode)}&role=${role}`;
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      window.location.href = "/dashboard";
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center font-sans">
      <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center mb-3 animate-pulse">
        <span className="text-purple-400 font-black text-xs">SP</span>
      </div>
      <p className="text-xs font-semibold text-slate-400 tracking-wider">Redirecting to Control Room…</p>
    </div>
  );
}
