"use client";

import { useState } from "react";
import { defaultPresentationAdapter } from "../adapter";
import { Material, MaterialType } from "@/core/types";
import { Upload, Link as LinkIcon, AlertCircle } from "lucide-react";

interface MaterialUploaderProps {
  onMaterialAdded: (material: Material) => void;
}

export function MaterialUploader({ onMaterialAdded }: MaterialUploaderProps) {
  const [activeTab, setActiveTab] = useState<"file" | "url">("file");
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
      let type: MaterialType = "image";
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "pdf") type = "pdf";
      else if (ext === "pptx" || ext === "ppt") type = "pptx";
      else if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) type = "image";

      const material = await defaultPresentationAdapter.loadMaterial(file, file.name, type);
      onMaterialAdded(material);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load material file");
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
      const material = await defaultPresentationAdapter.loadMaterial(urlInput.trim(), title, "url");
      onMaterialAdded(material);
      setUrlInput("");
      setUrlTitle("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid URL or embedding restricted");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel p-6 rounded-3xl border border-slate-800">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800/80 pb-3">
        <h3 className="font-bold text-base text-white">Add Stage Material</h3>
        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab("file")}
            className={`px-3 py-1 rounded-lg transition font-medium ${
              activeTab === "file" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            File Upload
          </button>
          <button
            onClick={() => setActiveTab("url")}
            className={`px-3 py-1 rounded-lg transition font-medium ${
              activeTab === "url" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            HTTPS URL
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800/50 text-rose-300 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {activeTab === "file" ? (
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
      ) : (
        <form onSubmit={handleUrlSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Presentation Title</label>
            <input
              type="text"
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="e.g. Keynote Web Dashboard"
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">HTTPS Web Address</label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/deck"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition glow-purple"
          >
            {loading ? "Validating URL..." : "Add URL Material"}
          </button>
        </form>
      )}
    </div>
  );
}
