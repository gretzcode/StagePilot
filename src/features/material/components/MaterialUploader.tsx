"use client";

import { useState, useRef } from "react";
import { defaultPresentationAdapter } from "../adapter";
import { Material } from "@/core/types";
import { validateExternalUrl } from "../validator";
import { Link as LinkIcon, AlertCircle, Upload } from "lucide-react";

interface MaterialUploaderProps {
  roomCode?: string;
  onMaterialAdded: (material: Material) => void;
}

export function MaterialUploader({ roomCode = "DEFAULT", onMaterialAdded }: MaterialUploaderProps) {
  const [activeTab, setActiveTab] = useState<"link" | "file">("link");
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setError(null);
    setLoading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("roomCode", roomCode);

      const xhr = new XMLHttpRequest();

      // Track upload progress
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      // Handle completion
      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            try {
              const json = JSON.parse(xhr.responseText) as { success?: boolean; material?: Material };
              if (json.success && json.material) {
                onMaterialAdded(json.material);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
                resolve();
              } else {
                reject(new Error("Upload gagal atau tidak ada response material"));
              }
            } catch {
              reject(new Error("Respons server tidak valid"));
            }
          } else {
            try {
              const json = JSON.parse(xhr.responseText) as { error?: string; message?: string };
              reject(new Error(json.message || json.error || "Upload gagal"));
            } catch {
              reject(new Error(`Upload gagal dengan status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Koneksi terputus saat upload"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload dibatalkan"));
        });

        xhr.open("POST", "/api/material/upload");
        xhr.send(formData);
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah file presentasi.");
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">Add Stage Material</h4>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-950/80 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
              activeTab === "link" ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${
              activeTab === "file" ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            <Upload className="w-4 h-4" />
            File Upload
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800/50 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {activeTab === "link" ? (
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
            <label className="block text-xs font-medium text-slate-400 mb-1">HTTPS / Canva / PDF / Video / Image Link</label>
            <div className="relative">
              <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="url"
                required
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/file.pdf / youtube.com/watch?v=... / canva.com/design/..."
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
        ) : (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-5 transition ${
              dragActive
                ? "bg-purple-950/80 border-purple-500 shadow-lg shadow-purple-500/20"
                : "bg-slate-950/50 border-slate-700 hover:border-slate-600"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileInputChange}
              disabled={loading}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.mov,.webm,.mkv,.avi,.mpeg,.mpg"
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-3 py-6">
              <Upload className="w-8 h-8 text-purple-400" />
              <div className="text-center">
                <p className="text-xs font-bold text-slate-300 mb-1">Drag & drop file media</p>
                <p className="text-[11px] text-slate-500">PDF, gambar, atau video via Google Drive storage</p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition"
              >
                {loading ? "Uploading..." : "Pilih File"}
              </button>
            </div>

            {uploadProgress !== null && (
              <div className="mt-4 space-y-2">
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 text-center">{uploadProgress}% selesai</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
