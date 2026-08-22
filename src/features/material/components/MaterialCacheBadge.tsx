"use client";

import { useState } from "react";
import { Zap, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronUp, Monitor, Tv, Laptop, Smartphone } from "lucide-react";
import { Material, StageSessionState, DeviceMaterialCacheEntry } from "@/core/types";

interface MaterialCacheBadgeProps {
  material: Material;
  state: StageSessionState | null;
  onPrecache: (materialId: string) => void;
  disabled?: boolean;
}

export function MaterialCacheBadge({
  material,
  state,
  onPrecache,
  disabled = false,
}: MaterialCacheBadgeProps) {
  const [showDetails, setShowDetails] = useState(false);

  const activeDevices = Object.values(state?.devices || {}).filter(
    (d) => d.status === "online" && d.approvalStatus === "approved"
  );

  const cacheStatuses: Record<string, DeviceMaterialCacheEntry> =
    state?.materialCacheStatus?.[material.id] || material.cacheStatus || {};

  const cachedEntries = Object.values(cacheStatuses);
  const totalApproved = Math.max(activeDevices.length, 1);
  const cachedCount = activeDevices.filter(
    (d) => cacheStatuses[d.id]?.status === "cached"
  ).length;

  const isCaching = cachedEntries.some((e) => e.status === "caching");
  const isFullyCached = totalApproved > 0 && cachedCount >= totalApproved;

  const getDeviceIcon = (role?: string) => {
    switch (role) {
      case "audience":
        return <Tv className="w-3 h-3 text-cyan-400" />;
      case "confidence":
        return <Monitor className="w-3 h-3 text-purple-400" />;
      case "speaker":
        return <Smartphone className="w-3 h-3 text-emerald-400" />;
      default:
        return <Laptop className="w-3 h-3 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center space-x-1.5">
        {/* Main Pre-Cache Action Button */}
        <button
          type="button"
          disabled={disabled || isCaching}
          onClick={(e) => {
            e.stopPropagation();
            onPrecache(material.id);
          }}
          className={`py-1 px-2 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer border ${
            isFullyCached
              ? "bg-emerald-950/80 border-emerald-700/80 text-emerald-300 hover:bg-emerald-900"
              : isCaching
              ? "bg-amber-950/80 border-amber-700/80 text-amber-300 animate-pulse cursor-wait"
              : "bg-cyan-950/80 border-cyan-800/80 text-cyan-300 hover:bg-cyan-900 active:scale-[0.98]"
          }`}
          title="Pre-cache seluruh materi ini ke memori lokal semua perangkat aktif"
        >
          {isCaching ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
              <span>Memproses Cache...</span>
            </>
          ) : isFullyCached ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Cached ({cachedCount}/{totalApproved})</span>
            </>
          ) : (
            <>
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>{cachedCount > 0 ? `Cache (${cachedCount}/${totalApproved})` : "Cache ke Semua Device"}</span>
            </>
          )}
        </button>

        {/* Toggle Details Dropdown */}
        {activeDevices.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetails((prev) => !prev);
            }}
            className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] transition cursor-pointer flex items-center space-x-0.5"
            title="Lihat status cache per perangkat"
          >
            <span className="font-mono text-[9px]">{cachedCount}/{totalApproved}</span>
            {showDetails ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>

      {/* Expandable Device Status Popover */}
      {showDetails && (
        <div className="p-2 rounded-xl bg-slate-950/90 border border-slate-800 text-[10px] space-y-1.5 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">
            Status Cache Perangkat ({activeDevices.length} Aktif)
          </div>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
            {activeDevices.map((dev) => {
              const entry = cacheStatuses[dev.id];
              const status = entry?.status || "idle";
              const progress = entry?.progress || 0;

              return (
                <div
                  key={dev.id}
                  className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/80 border border-slate-800/60"
                >
                  <div className="flex items-center space-x-1.5 min-w-0 flex-1 mr-2">
                    {getDeviceIcon(dev.role)}
                    <span className="font-medium text-slate-200 truncate">
                      {dev.name || dev.role || "Device"}
                    </span>
                  </div>

                  <div className="shrink-0">
                    {status === "cached" ? (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-[9px] font-bold flex items-center space-x-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>Ready (100%)</span>
                      </span>
                    ) : status === "caching" ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950 border border-amber-700/60 text-amber-300 text-[9px] font-bold flex items-center space-x-0.5">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        <span>{progress}%</span>
                      </span>
                    ) : status === "error" ? (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-700/60 text-rose-300 text-[9px] font-bold flex items-center space-x-0.5" title={entry?.error}>
                        <AlertCircle className="w-2.5 h-2.5" />
                        <span>Gagal</span>
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[9px]">
                        Belum di-cache
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}