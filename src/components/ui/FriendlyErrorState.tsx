"use client";

import Link from "next/link";
import { XCircle, ShieldCheck, WifiOff, AlertTriangle } from "lucide-react";

export type ErrorType =
  | "ROOM_NOT_FOUND"
  | "ROOM_ACCESS_DENIED"
  | "INVALID_ROOM_CODE"
  | "DEVICE_REJECTED"
  | "DEVICE_REVOKED"
  | "NETWORK_ERROR"
  | "WEBSOCKET_CONNECTION_FAILED";

interface FriendlyErrorStateProps {
  errorType: ErrorType | string;
  roomCode?: string;
  onRetry?: () => void;
}

export function FriendlyErrorState({ errorType, roomCode, onRetry }: FriendlyErrorStateProps) {
  let title = "Terjadi Kesalahan";
  let description = "Tidak dapat terhubung ke room StagePilot.";
  let actionText = "Kembali ke halaman Join";
  let actionHref = "/join";
  let Icon = AlertTriangle;
  let iconColorClass = "bg-amber-950/80 border-amber-800/60 text-amber-400";

  switch (errorType) {
    case "ROOM_NOT_FOUND":
      title = "Room tidak ditemukan";
      description = roomCode
        ? `Kode room "${roomCode}" yang kamu buka tidak valid atau room sudah tidak tersedia.`
        : "Kode room yang kamu buka tidak valid atau room sudah tidak tersedia.";
      actionText = "Kembali ke halaman Join";
      actionHref = "/join";
      Icon = XCircle;
      iconColorClass = "bg-rose-950/80 border-rose-800/60 text-rose-400";
      break;

    case "ROOM_ACCESS_DENIED":
      title = "Akses ke room ditolak";
      description = roomCode
        ? `Kamu tidak memiliki izin Host untuk mengelola room ${roomCode}.`
        : "Kamu tidak memiliki izin Host untuk mengelola room ini.";
      actionText = "Kembali ke Dashboard";
      actionHref = "/dashboard";
      Icon = ShieldCheck;
      iconColorClass = "bg-amber-950/80 border-amber-800/60 text-amber-400";
      break;

    case "INVALID_ROOM_CODE":
      title = "Kode room tidak valid";
      description = "Format kode room yang dimasukkan salah atau kurang lengkap.";
      actionText = "Coba masukkan lagi";
      actionHref = "/join";
      Icon = AlertTriangle;
      iconColorClass = "bg-amber-950/80 border-amber-800/60 text-amber-400";
      break;

    case "DEVICE_REJECTED":
      title = "Akses perangkat ditolak";
      description = "Host belum menyetujui perangkat ini untuk masuk ke room.";
      actionText = "Coba lagi";
      Icon = XCircle;
      iconColorClass = "bg-rose-950/80 border-rose-800/60 text-rose-400";
      break;

    case "DEVICE_REVOKED":
      title = "Akses perangkat dicabut";
      description = "Izin akses perangkat ini telah dicabut oleh Host room.";
      actionText = "Kembali ke halaman Join";
      actionHref = "/join";
      Icon = ShieldCheck;
      iconColorClass = "bg-rose-950/80 border-rose-800/60 text-rose-400";
      break;

    case "NETWORK_ERROR":
    case "WEBSOCKET_CONNECTION_FAILED":
      title = "Koneksi terputus";
      description = "Tidak dapat terhubung ke server StagePilot. Periksa jaringan internet Anda.";
      actionText = "Coba sambungkan ulang";
      Icon = WifiOff;
      iconColorClass = "bg-slate-900 border-slate-800 text-slate-400";
      break;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div className={`w-16 h-16 rounded-3xl border flex items-center justify-center mb-4 shadow-xl ${iconColorClass}`}>
        <Icon className="w-8 h-8" />
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-slate-400 text-sm max-w-md mt-2 mb-6 leading-relaxed">{description}</p>

      {onRetry ? (
        <button
          onClick={onRetry}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition glow-purple"
        >
          {actionText}
        </button>
      ) : (
        <Link
          href={actionHref}
          className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition glow-purple"
        >
          {actionText}
        </Link>
      )}
    </div>
  );
}
