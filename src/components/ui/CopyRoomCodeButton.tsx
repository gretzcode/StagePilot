"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyRoomCodeButtonProps {
  roomCode: string;
  className?: string;
}

export function CopyRoomCodeButton({ roomCode, className = "" }: CopyRoomCodeButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-purple-300 font-mono text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-sm ${className}`}
      title="Klik untuk menyalin Kode Room"
    >
      <span>ROOM: {roomCode}</span>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white flex-shrink-0" />
      )}
      {copied && <span className="text-[10px] text-emerald-400 font-sans font-semibold">Tersalin!</span>}
    </button>
  );
}
