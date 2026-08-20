"use client";

import { useState } from "react";
import {
  Radio,
  Monitor,
  FileText,
  Video,
  Layers,
  Crown,
  User,
  Gamepad2,
  Square,
  Play,
  CheckCircle2,
  Tv,
} from "lucide-react";
import { StageSessionState, AvailableSource, SourceType } from "@/core/types";
import { getAvailableSources } from "../utils/available-sources";

interface SourceManagerPanelProps {
  state: StageSessionState | null;
  canControl: boolean;
  onTakeLive: (sourceType: SourceType, sourceId: string) => void;
  onTakeOffline: () => void;
}

export function SourceManagerPanel({
  state,
  canControl,
  onTakeLive,
  onTakeOffline,
}: SourceManagerPanelProps) {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const sources = getAvailableSources(state);
  const liveSource = state?.liveSource;

  const renderOwnerBadge = (source: AvailableSource) => {
    if (source.ownerRole === "host" || (!source.ownerDeviceId && !source.ownerRole)) {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-800/60 text-amber-300 text-[10px] font-bold">
          <Crown className="w-3 h-3 text-amber-400" />
          <span>Host</span>
        </span>
      );
    }
    if (source.ownerRole === "operator") {
      return (
        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-950/80 border border-indigo-800/60 text-indigo-300 text-[10px] font-bold">
          <Gamepad2 className="w-3 h-3 text-indigo-400" />
          <span>Operator: {source.ownerName || "Staff"}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-800/60 text-purple-300 text-[10px] font-bold">
        <User className="w-3 h-3 text-purple-400" />
        <span>Speaker: {source.ownerName || "Speaker"}</span>
      </span>
    );
  };

  const renderSourceIcon = (source: AvailableSource) => {
    if (source.type === "screen_share") {
      return <Monitor className="w-4 h-4 text-cyan-400 flex-shrink-0" />;
    }
    if (source.mediaType === "video") {
      return <Video className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />;
  };

  return (
    <div className="glass-panel p-4 sm:p-6 rounded-3xl border border-slate-800 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <span>Source Manager</span>
              <span className="px-2 py-0.5 rounded-md bg-purple-950 border border-purple-800/80 text-purple-300 text-[10px] font-mono font-bold">
                {sources.length} Sources
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Pilih sumber presentasi yang tersedia dan aktifkan sebagai tayangan LIVE panggung.
            </p>
          </div>
        </div>
      </div>

      {/* 1. LIVE SOURCE BANNER */}
      <div className="space-y-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Current Live Source
        </span>

        {liveSource ? (
          <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-600/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
                {liveSource.type === "screen_share" ? (
                  <Monitor className="w-5 h-5" />
                ) : (
                  <Layers className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="px-2 py-0.5 rounded bg-emerald-900 text-emerald-300 font-mono text-[9px] font-bold uppercase tracking-wider flex items-center space-x-1 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>LIVE ON STAGE</span>
                  </span>
                  <span className="text-xs font-bold text-white truncate">{liveSource.title}</span>
                </div>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-[10px] text-emerald-400/80">
                    {liveSource.type === "screen_share" ? "Layar Realtime" : "Materi Presentasi"}
                  </span>
                  {liveSource.ownerName && (
                    <span className="text-[10px] text-slate-400">• {liveSource.ownerName}</span>
                  )}
                </div>
              </div>
            </div>

            {canControl && (
              <button
                onClick={onTakeOffline}
                className="px-3.5 py-2 rounded-xl bg-rose-950/80 border border-rose-800 hover:bg-rose-900 text-rose-300 font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer flex-shrink-0 touch-manipulation"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Take Offline</span>
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-center flex items-center justify-center space-x-2 text-slate-500 text-xs">
            <Tv className="w-4 h-4" />
            <span>Panggung sedang kosong (Standby). Pilih sumber di bawah dan klik &quot;Take Live&quot;.</span>
          </div>
        )}
      </div>

      {/* 2. AVAILABLE SOURCES LIST */}
      <div className="space-y-3">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          Available Sources ({sources.length})
        </span>

        {sources.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40 text-slate-500 text-xs">
            Belum ada sumber yang tersedia. Tambahkan materi atau minta pembicara membagikan layar.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sources.map((source) => {
              const isSelected = selectedSourceId === source.id;
              const isLive = source.isLive;

              return (
                <div
                  key={`${source.type}-${source.id}`}
                  onClick={() => setSelectedSourceId(source.id)}
                  className={`p-3.5 rounded-2xl border transition flex flex-col justify-between space-y-3 cursor-pointer ${
                    isLive
                      ? "bg-emerald-950/20 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30"
                      : isSelected
                      ? "bg-purple-950/30 border-purple-500/60 shadow-md ring-1 ring-purple-500/40"
                      : "bg-slate-900/70 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  {/* Top: Icon + Title + Status */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        {renderSourceIcon(source)}
                        <span className="text-xs font-bold text-white truncate" title={source.title}>
                          {source.title}
                        </span>
                      </div>
                      {isLive ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-[9px] font-bold uppercase flex-shrink-0 animate-pulse">
                          LIVE
                        </span>
                      ) : isSelected ? (
                        <span className="px-2 py-0.5 rounded bg-purple-950 border border-purple-700 text-purple-300 font-mono text-[9px] font-bold uppercase flex-shrink-0">
                          SELECTED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[9px] font-bold uppercase flex-shrink-0">
                          READY
                        </span>
                      )}
                    </div>

                    {/* Owner Badge */}
                    <div>{renderOwnerBadge(source)}</div>
                  </div>

                  {/* Bottom: Action Buttons */}
                  {canControl && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800/60">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSourceId(source.id);
                        }}
                        className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition flex items-center justify-center space-x-1 cursor-pointer ${
                          isSelected
                            ? "bg-purple-900/60 text-purple-200 border border-purple-700"
                            : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{isSelected ? "Selected" : "Select"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTakeLive(source.type, source.id);
                        }}
                        disabled={isLive}
                        className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition flex items-center justify-center space-x-1 cursor-pointer ${
                          isLive
                            ? "bg-emerald-950 text-emerald-400/50 border border-emerald-900 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow glow-emerald"
                        }`}
                      >
                        <Play className="w-3 h-3" />
                        <span>{isLive ? "Is Live" : "TAKE LIVE"}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
