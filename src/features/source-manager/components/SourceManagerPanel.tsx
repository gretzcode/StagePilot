"use client";

import {
  Radio,
  Monitor,
  User,
  Square,
  Play,
} from "lucide-react";
import { StageSessionState, AvailableSource, SourceType } from "@/core/types";
import { getAvailableSources } from "../utils/available-sources";

interface SourceManagerPanelProps {
  state: StageSessionState | null;
  canControl: boolean;
  onTakeLive: (sourceType: SourceType, sourceId: string) => void;
  onTakeOffline: () => void;
  onViewPresentation?: () => void;
}

/**
 * Unified Source Manager Panel
 *
 * Automatically hidden if there are no active sources.
 * Merges Current Live Source and Available Sources into a single unified list.
 * "Take Live" acts as "Go Live / Present", navigating directly to the presentation view.
 */
export function SourceManagerPanel({
  state,
  canControl,
  onTakeLive,
  onTakeOffline,
  onViewPresentation,
}: SourceManagerPanelProps) {
  const sources = getAvailableSources(state);

  // If no dynamic sources are active, completely hide this panel
  if (sources.length === 0) {
    return null;
  }

  const renderOwnerBadge = (source: AvailableSource) => {
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-800/60 text-purple-300 text-[10px] font-bold">
        <User className="w-3 h-3 text-purple-400" />
        <span>Speaker: {source.ownerName || "Speaker"}</span>
      </span>
    );
  };

  return (
    <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-slate-800 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center text-cyan-400 shadow">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Source Manager</span>
              <span className="px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-800/80 text-cyan-300 text-[10px] font-mono font-bold">
                {sources.length} Active {sources.length === 1 ? "Screen" : "Screens"}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Layar pembicara realtime yang aktif di panggung.
            </p>
          </div>
        </div>
      </div>

      {/* Unified Sources List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 pt-1">
        {sources.map((source) => {
          const isLive = source.isLive;

          return (
            <div
              key={`${source.type}-${source.id}`}
              className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col justify-between min-h-[140px] ${
                isLive
                  ? "bg-emerald-950/30 border-emerald-500/80 ring-1 ring-emerald-500/40 shadow-xl"
                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 flex items-center space-x-1">
                      <Monitor className="w-3.5 h-3.5" />
                      <span>SCREEN SHARE</span>
                    </span>
                    {renderOwnerBadge(source)}
                  </div>

                  {isLive ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center space-x-1 animate-pulse flex-shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      <span>LIVE</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[9px] font-bold uppercase tracking-wider flex-shrink-0">
                      READY
                    </span>
                  )}
                </div>

                <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-2 mb-1">
                  {source.title}
                </h4>
                <p className="text-[10px] font-mono text-slate-400 truncate">
                  Device ID: {source.ownerDeviceId}
                </p>
              </div>

              {canControl && (
                <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center space-x-2">
                  {isLive ? (
                    <>
                      <button
                        type="button"
                        onClick={onViewPresentation}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 active:scale-95 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer touch-manipulation"
                      >
                        <Play className="w-3.5 h-3.5 fill-current pointer-events-none" />
                        <span className="pointer-events-none">VIEW LIVE PRESENTATION</span>
                      </button>
                      <button
                        type="button"
                        onClick={onTakeOffline}
                        className="min-h-[40px] px-3 rounded-xl bg-rose-950/80 border border-rose-800 hover:bg-rose-900 active:bg-rose-950 text-rose-300 text-xs font-bold transition cursor-pointer flex-shrink-0 touch-manipulation flex items-center justify-center space-x-1 shadow-md select-none"
                        title="Stop Live Screen Share"
                      >
                        <Square className="w-3.5 h-3.5" />
                        <span>STOP</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTakeLive(source.type, source.id)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 active:scale-95 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer touch-manipulation"
                    >
                      <Play className="w-3.5 h-3.5 fill-current pointer-events-none" />
                      <span className="pointer-events-none">GO LIVE / PRESENT</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
