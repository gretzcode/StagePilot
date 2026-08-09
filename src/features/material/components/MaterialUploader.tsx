"use client";

import { useState } from "react";
import { defaultPresentationAdapter } from "../adapter";
import { Material } from "@/core/types";
import { validateExternalUrl } from "../validator";
import { Link as LinkIcon, AlertCircle } from "lucide-react";

interface MaterialUploaderProps {
  roomCode?: string;
  onMaterialAdded: (material: Material) => void;
}

export function MaterialUploader({ roomCode = "DEFAULT", onMaterialAdded }: MaterialUploaderProps) {
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;

    setError(null);
    setLoading(true);

    try {
      const title = urlTitle.trim() || "Web Presentation";

      const validation = validateExternalUrl(urlInput);
      if (!validation.valid || !validation.materialType) {
        throw new Error(validation.error || "Link materi tidak valid. Gunakan URL HTTPS yang lengkap.");
      }

      const res = await fetch("/api/material/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlInput.trim(),
          title,
          roomCode,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { success?: boolean; material?: Material; message?: string };

      if (res.ok && json.success && json.material) {
        onMaterialAdded(json.material);
        setUrlInput("");
        setUrlTitle("");
        return;
      }

      const fallbackMat = await defaultPresentationAdapter.loadMaterial(urlInput.trim(), title, validation.materialType);
      onMaterialAdded(fallbackMat);
      setUrlInput("");
      setUrlTitle("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memproses link presentasi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">Add Stage Material (Link URL)</h4>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800/50 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleUrlSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Presentation Title</label>
          <input
            type="text"
            value={urlTitle}
            onChange={(e) => setUrlTitle(e.target.value)}
            placeholder="e.g. Keynote Presentation Deck"
            className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 transition"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">HTTPS / Canva / Google Slides Link</label>
          <div className="relative">
            <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="url"
              required
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://docs.google.com/presentation/d/..."
              className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 font-mono transition"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition glow-purple shadow-md cursor-pointer mt-2"
        >
          {loading ? "Processing Material..." : "Add Link Material"}
        </button>
      </form>
    </div>
  );
}
