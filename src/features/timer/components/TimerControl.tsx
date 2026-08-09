"use client";

import { useState } from "react";
import { TimerState } from "@/core/types";
import { Play, Pause, RotateCcw, Clock } from "lucide-react";
import { useTimerTicker } from "../hooks/useTimerTicker";
import { formatStageTimer } from "../utils/timer-formatter";

interface TimerControlProps {
  timer: TimerState;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSetDuration: (durationInSeconds: number) => void;
}

export function TimerControl({ timer, onStart, onPause, onReset, onSetDuration }: TimerControlProps) {
  const [customMinutes, setCustomMinutes] = useState(10);
  const now = useTimerTicker(timer.status === "running");

  const { formattedTime, isOvertime, isWarning, isCritical, isFinished } = formatStageTimer(
    timer.status,
    timer.duration,
    timer.remaining,
    timer.startedAt,
    now
  );

  return (
    <div className="glass-panel p-5 rounded-3xl border border-slate-800">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
        <h4 className="text-xs font-bold text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
          <Clock className="w-3.5 h-3.5 text-purple-400" />
          <span>Stage Timer</span>
        </h4>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
          isOvertime
            ? "bg-rose-950 text-rose-400 border border-rose-800 animate-pulse"
            : timer.status === "running"
            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
            : timer.status === "paused"
            ? "bg-amber-950 text-amber-400 border border-amber-800"
            : "bg-slate-800 text-slate-400"
        }`}>
          {isOvertime ? "OVERTIME" : timer.status}
        </span>
      </div>

      <div className="text-center py-2">
        <div className={`font-mono text-4xl font-extrabold tracking-tight ${
          isOvertime || isCritical || isFinished
            ? "text-rose-400 animate-pulse"
            : isWarning
            ? "text-amber-400"
            : "text-white"
        }`}>
          {formattedTime}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {timer.status === "running" ? (
          <button
            onClick={onPause}
            className="py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/50 text-amber-300 font-semibold text-xs flex items-center justify-center space-x-1 transition"
          >
            <Pause className="w-3.5 h-3.5" />
            <span>Pause</span>
          </button>
        ) : (
          <button
            onClick={onStart}
            className="py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-semibold text-xs flex items-center justify-center space-x-1 transition"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Start</span>
          </button>
        )}

        <button
          onClick={onReset}
          className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center space-x-1 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>

        <div className="flex items-center space-x-1">
          <input
            type="number"
            min="1"
            max="180"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(Number(e.target.value))}
            className="w-full px-2 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-center text-white focus:outline-none focus:border-purple-500"
          />
          <button
            onClick={() => onSetDuration(customMinutes * 60)}
            className="px-2 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/50 text-purple-300 font-bold text-[10px] transition"
          >
            SET
          </button>
        </div>
      </div>
    </div>
  );
}
