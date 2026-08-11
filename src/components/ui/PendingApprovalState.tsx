"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

interface PendingApprovalStateProps {
  deviceName?: string;
  roomCode?: string;
  role?: string;
  onCancel?: () => void;
}

export function PendingApprovalState({ deviceName, roomCode, role, onCancel }: PendingApprovalStateProps) {
  return (
    <div suppressHydrationWarning className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div suppressHydrationWarning className="w-full max-w-md glass-panel p-8 rounded-3xl border border-slate-800 shadow-2xl relative">
        <div suppressHydrationWarning className="w-14 h-14 rounded-3xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400 mx-auto mb-4 shadow-xl">
          <div className="w-7 h-7 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Menunggu persetujuan Host</h1>
        <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed mb-6">
          Perangkat ini telah meminta akses ke room. Menunggu Host menyetujui perangkat ini.
        </p>

        <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 text-left space-y-2 mb-6 text-xs">
          {deviceName && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Nama Perangkat:</span>
              <span className="font-semibold text-white">{deviceName}</span>
            </div>
          )}
          {roomCode && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Kode Room:</span>
              <span className="font-mono font-bold text-purple-400">{roomCode}</span>
            </div>
          )}
          {role && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Role Diminta:</span>
              <span className="font-semibold text-indigo-300 capitalize">{role}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center space-x-2 text-xs text-slate-500 mb-4">
          <Clock className="w-3.5 h-3.5" />
          <span>Status: Menunggu Konfirmasi Host</span>
        </div>

        {onCancel ? (
          <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-300 underline">
            Batalkan Permintaan
          </button>
        ) : (
          <Link href="/join" className="text-xs text-slate-500 hover:text-slate-300 underline">
            Batalkan &amp; Kembali
          </Link>
        )}
      </div>
    </div>
  );
}
