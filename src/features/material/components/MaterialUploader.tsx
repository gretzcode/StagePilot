"use client";

import { useState } from "react";
import { defaultPresentationAdapter } from "../adapter";
import { Material } from "@/core/types";
import { validateUploadedFile, validateExternalUrl } from "../validator";
import { Upload, Link as LinkIcon, AlertCircle } from "lucide-react";

interface MaterialUploaderProps {
  roomCode?: string;
  onMaterialAdded: (material: Material) => void;
}

export function MaterialUploader({ roomCode = "DEFAULT", onMaterialAdded }: MaterialUploaderProps) {
  const [activeTab, setActiveTab] = useState<"url" | "file">("url");
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const validation = validateUploadedFile(file.name, file.type, file.size);
      if (!validation.valid || !validation.materialType) {
        throw new Error(validation.error || "Format file belum didukung.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("roomCode", roomCode);

      const res = await fetch("/api/material/upload", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json().catch(() => ({}))) as { success?: boolean; material?: Material; message?: string };

      if (res.ok && json.success && json.material) {
        onMaterialAdded(json.material);
        return;
      }

      const fallbackMat = await defaultPresentationAdapter.loadMaterial(file, file.name, validation.materialType);
      onMaterialAdded(fallbackMat);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah file.");
    } finally {
      setLoading(false);
    }
  };

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
    <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">Add Stage Material</h4>

        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("url")}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
              activeTab === "url" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            URL Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${
              activeTab === "file" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            File Upload
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800/50 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {activeTab === "url" ? (
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Presentation Title</label>
            <input
              type="text"
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="e.g. Keynote Presentation Deck"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">HTTPS / Canva / Google Slides Link</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://docs.google.com/presentation/d/... or https://canva.com/design/..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition glow-purple"
          >
            {loading ? "Processing Material..." : "Add Link Material"}
          </button>
        </form>
      ) : (
        <label className="border-2 border-dashed border-slate-800 hover:border-purple-500/60 bg-slate-900/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition">
          <Upload className="w-8 h-8 text-purple-400 mb-2" />
          <span className="text-sm font-semibold text-white">
            {loading ? "Processing Material..." : "Click or Drag File to Upload"}
          </span>
          <span className="text-xs text-slate-400 mt-1">Supports PDF, PPTX, PNG, JPG, WebP</span>
          <input
            type="file"
            accept=".pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp"
            disabled={loading}
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
}
