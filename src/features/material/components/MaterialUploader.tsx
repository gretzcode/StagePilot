"use client";

import { useState, useRef, useEffect } from "react";
import { Material } from "@/core/types";
import { validateExternalUrl } from "../validator";
import { Link as LinkIcon, AlertCircle, Upload, Loader2, FileText, Plus } from "lucide-react";

interface MaterialUploaderProps {
  roomCode?: string;
  deviceId?: string;
  onMaterialAdded: (material: Material) => void;
}

interface UploadProgressData {
  percentage: number;
  uploadedBytes: number;
  totalBytes: number;
  uploadedMB: string;
  totalMB: string;
  speedMBps: string;
  remainingSeconds: string;
}

interface ProcessingStage {
  currentStep: number;
  totalSteps: number;
  title: string;
  description: string;
}

export function MaterialUploader({ roomCode = "DEFAULT", deviceId, onMaterialAdded }: MaterialUploaderProps) {
  const [activeTab, setActiveTab] = useState<"link" | "file">("link");
  const [urlInput, setUrlInput] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressData | null>(null);
  const [processingStage, setProcessingStage] = useState<ProcessingStage | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadStartTimeRef = useRef<number | null>(null);
  const lastProgressRef = useRef<{ loaded: number; time: number } | null>(null);
  const stageTimerRef = useRef<NodeJS.Timeout[]>([]);

  const [isDiscoveringTitle, setIsDiscoveringTitle] = useState(false);

  const clearStageTimers = () => {
    stageTimerRef.current.forEach((t) => clearTimeout(t));
    stageTimerRef.current = [];
  };

  useEffect(() => {
    return () => {
      clearStageTimers();
    };
  }, []);

  const autoFetchTitle = async (rawUrl: string) => {
    if (!rawUrl || urlTitle.trim()) return;
    const trimmed = rawUrl.trim();

    try {
      if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
        setIsDiscoveringTitle(true);
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(trimmed)}&format=json`);
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { title?: string } | null;
          if (data?.title && !urlTitle.trim()) {
            setUrlTitle(data.title.trim());
          }
        }
      } else if (trimmed.includes("vimeo.com")) {
        setIsDiscoveringTitle(true);
        const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { title?: string } | null;
          if (data?.title && !urlTitle.trim()) {
            setUrlTitle(data.title.trim());
          }
        }
      }
    } catch {
      // Non-fatal
    } finally {
      setIsDiscoveringTitle(false);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput) return;

    setError(null);
    setLoading(true);
    clearStageTimers();

    try {
      const title = urlTitle.trim();

      const validation = validateExternalUrl(urlInput);
      if (!validation.valid || !validation.materialType) {
        throw new Error(validation.error || "Link materi tidak valid. Gunakan URL HTTPS yang lengkap.");
      }

      const isPdfOrDrive =
        validation.materialType === "pdf" ||
        urlInput.includes("drive.google.com") ||
        urlInput.toLowerCase().endsWith(".pdf") ||
        urlInput.toLowerCase().includes(".pdf?");

      const isCanva = validation.materialType === "canva";
      const isVideo = validation.materialType === "video";

      if (isPdfOrDrive) {
        setProcessingStage({
          currentStep: 1,
          totalSteps: 4,
          title: "Memvalidasi Tautan",
          description: "Memeriksa tautan & metadata berkas...",
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage({
              currentStep: 2,
              totalSteps: 4,
              title: "Mengunduh PDF",
              description: "Mengunduh dokumen dari Google Drive...",
            });
          }, 800)
        );

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage({
              currentStep: 3,
              totalSteps: 4,
              title: "Menyimpan ke Drive",
              description: `Menyimpan ke folder room ${roomCode.toUpperCase()} di Google Drive...`,
            });
          }, 2400)
        );

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage({
              currentStep: 4,
              totalSteps: 4,
              title: "Menyiapkan Dokumen",
              description: "Menghitung total halaman & mendaftarkan ke antrean...",
            });
          }, 4200)
        );
      } else if (isCanva) {
        setProcessingStage({
          currentStep: 1,
          totalSteps: 3,
          title: "Memeriksa Canva",
          description: "Memvalidasi tautan desain Canva...",
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage({
              currentStep: 2,
              totalSteps: 3,
              title: "Mengekspor Slide",
              description: "Mengimpor slide Canva ke panggung...",
            });
          }, 1200)
        );
      } else if (isVideo) {
        setProcessingStage({
          currentStep: 1,
          totalSteps: 2,
          title: "Memeriksa Video",
          description: "Mengambil informasi & durasi video...",
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage({
              currentStep: 2,
              totalSteps: 2,
              title: "Sinkronisasi Media",
              description: "Menyiapkan pemutar video untuk sesi panggung...",
            });
          }, 1000)
        );
      } else {
        setProcessingStage({
          currentStep: 1,
          totalSteps: 2,
          title: "Memproses Tautan",
          description: "Menganalisis tautan presentasi...",
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage({
              currentStep: 2,
              totalSteps: 2,
              title: "Menyiapkan Antrean",
              description: "Mendaftarkan materi ke antrean panggung...",
            });
          }, 1000)
        );
      }

      // If Canva link, try authenticated Canva Connect import first
      if (validation.materialType === "canva") {
        try {
          const canvaRes = await fetch("/api/integrations/canva/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: urlInput.trim(), roomCode }),
          });
          const canvaJson = (await canvaRes.json().catch(() => ({}))) as {
            success?: boolean;
            material?: Material;
            message?: string;
          };

          if (canvaRes.ok && canvaJson.success && canvaJson.material) {
            clearStageTimers();
            onMaterialAdded(canvaJson.material);
            setUrlInput("");
            setUrlTitle("");
            return;
          }
        } catch {
          // Fallback to standard URL handler
        }
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

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        material?: Material;
        message?: string;
        error?: string;
      };

      clearStageTimers();

      if (res.ok && json.success && json.material) {
        onMaterialAdded(json.material);
        setUrlInput("");
        setUrlTitle("");
        return;
      }

      throw new Error(json.message || json.error || "Gagal memproses link presentasi.");
    } catch (err: unknown) {
      clearStageTimers();
      const errMsg = err instanceof Error ? err.message : "Gagal memproses link presentasi.";
      setError(errMsg);
    } finally {
      clearStageTimers();
      setLoading(false);
      setProcessingStage(null);
    }
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setError(null);
    setLoading(true);
    setUploadProgress(null);
    clearStageTimers();
    uploadStartTimeRef.current = Date.now();
    lastProgressRef.current = null;

    setProcessingStage({
      currentStep: 1,
      totalSteps: 3,
      title: "Mengunggah Berkas",
      description: `Mengunggah ${file.name}...`,
    });

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("roomCode", roomCode);
      if (deviceId) {
        formData.append("deviceId", deviceId);
      }

      const xhr = new XMLHttpRequest();

      // Track upload progress with speed and data info
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const now = Date.now();
          const elapsedSeconds = (now - (uploadStartTimeRef.current || now)) / 1000;

          // Calculate speed
          let speedMBps = "0 MB/s";
          if (lastProgressRef.current && elapsedSeconds > 0) {
            const bytesSinceLastUpdate = e.loaded - lastProgressRef.current.loaded;
            const timeSinceLastUpdate = (now - lastProgressRef.current.time) / 1000;
            if (timeSinceLastUpdate > 0) {
              const speedBytes = bytesSinceLastUpdate / timeSinceLastUpdate;
              speedMBps = (speedBytes / (1024 * 1024)).toFixed(2) + " MB/s";
            }
          }

          // Calculate remaining time
          let remainingSeconds = "0s";
          if (lastProgressRef.current && elapsedSeconds > 0.5) {
            const bytesRemaining = e.total - e.loaded;
            const avgSpeedBytes = e.loaded / elapsedSeconds;
            if (avgSpeedBytes > 0) {
              const secondsRemaining = Math.ceil(bytesRemaining / avgSpeedBytes);
              if (secondsRemaining > 60) {
                const minutes = Math.floor(secondsRemaining / 60);
                const secs = secondsRemaining % 60;
                remainingSeconds = `${minutes}m ${secs}s`;
              } else {
                remainingSeconds = `${secondsRemaining}s`;
              }
            }
          }

          const uploadedMB = (e.loaded / (1024 * 1024)).toFixed(2);
          const totalMB = (e.total / (1024 * 1024)).toFixed(2);
          const percentage = Math.round((e.loaded / e.total) * 100);

          lastProgressRef.current = { loaded: e.loaded, time: now };

          setUploadProgress({
            percentage,
            uploadedBytes: e.loaded,
            totalBytes: e.total,
            uploadedMB,
            totalMB,
            speedMBps,
            remainingSeconds,
          });

          if (percentage >= 100) {
            setProcessingStage({
              currentStep: 2,
              totalSteps: 3,
              title: "Menyimpan ke Google Drive",
              description: `Menyimpan ${file.name} ke Google Drive...`,
            });

            stageTimerRef.current.push(
              setTimeout(() => {
                setProcessingStage({
                  currentStep: 3,
                  totalSteps: 3,
                  title: "Menyiapkan Dokumen",
                  description: "Menghitung total halaman & mendaftarkan ke antrean...",
                });
              }, 1800)
            );
          }
        }
      });

      // Handle completion
      await new Promise<void>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            try {
              const json = JSON.parse(xhr.responseText) as {
                success?: boolean;
                material?: Material;
                message?: string;
              };
              if (json.success && json.material) {
                onMaterialAdded(json.material);
                resolve();
              } else {
                reject(new Error(json.message || "Gagal memproses materi"));
              }
            } catch {
              reject(new Error("Format respons tidak valid"));
            }
          } else {
            try {
              const json = JSON.parse(xhr.responseText) as { message?: string; error?: string };
              reject(new Error(json.message || json.error || `Server mengembalikan status ${xhr.status}`));
            } catch {
              reject(new Error(`Server mengembalikan status ${xhr.status}`));
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
      clearStageTimers();
      setLoading(false);
      setUploadProgress(null);
      setProcessingStage(null);
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
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between mb-3.5 pb-2.5 border-b border-slate-800/80">
          <h4 className="text-xs font-semibold text-slate-200">Add Stage Material</h4>
        </div>

        <div className="mb-3.5 grid grid-cols-2 rounded-xl bg-slate-950/70 p-1 border border-slate-800/80">
          <button
            type="button"
            onClick={() => setActiveTab("link")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "link" ? "bg-purple-600 text-white shadow glow-purple" : "text-slate-400 hover:text-white"
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            Link
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            disabled={loading}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "file" ? "bg-purple-600 text-white shadow glow-purple" : "text-slate-400 hover:text-white"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            File Upload
          </button>
        </div>

        {error && (
          <div className="mb-3.5 p-3 rounded-xl bg-rose-950/50 border border-rose-900/50 text-rose-300 text-xs flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Gagal menambahkan materi</p>
              <p className="text-rose-300/80 text-[11px] mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {activeTab === "link" ? (
          <form onSubmit={handleUrlSubmit} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-medium text-slate-400">Judul Presentasi (Opsional)</label>
                {isDiscoveringTitle && (
                  <span className="text-[10px] text-indigo-400 animate-pulse font-medium flex items-center space-x-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>Mendeteksi judul...</span>
                  </span>
                )}
              </div>
              <input
                type="text"
                disabled={loading}
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
                placeholder="Otomatis diambil dari metadata atau isi nama kustom"
                className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Tautan Google Drive / Canva / PDF / YouTube / Vimeo
              </label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="url"
                  required
                  disabled={loading}
                  value={urlInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUrlInput(val);
                    if (val.includes("youtube.com") || val.includes("youtu.be") || val.includes("vimeo.com")) {
                      autoFetchTitle(val);
                    }
                  }}
                  onBlur={(e) => autoFetchTitle(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... / canva.com/design/... / file.pdf"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 font-mono transition disabled:opacity-50"
                />
              </div>
            </div>

            {/* ─── MINIMALIST DYNAMIC STATUS (Linear/Vercel Style - StagePilot Purple Theme) ─── */}
            {loading && processingStage && (
              <div className="pt-2 pb-1 space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400 flex-shrink-0" />
                    <span className="text-slate-200 text-[11px] font-medium truncate">
                      {processingStage.description}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-800/60 flex-shrink-0">
                    {processingStage.currentStep}/{processingStage.totalSteps}
                  </span>
                </div>
                {/* Hairline Progress Indicator */}
                <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(processingStage.currentStep / processingStage.totalSteps) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !urlInput.trim()}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:opacity-60 text-white font-bold text-xs transition shadow glow-purple cursor-pointer mt-1 flex items-center justify-center space-x-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-300" />
                  <span>Memproses Materi...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambahkan ke Antrean</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`rounded-xl border border-dashed p-4 transition ${
              dragActive
                ? "bg-purple-950/40 border-purple-500/80"
                : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
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

            <div className="flex flex-col items-center justify-center space-y-2.5 py-4">
              <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/60 flex items-center justify-center text-purple-400">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-200">Drag & drop file presentasi di sini</p>
                <p className="text-[11px] text-slate-400 mt-0.5">PDF, Gambar, atau Video (tersimpan ke Google Drive)</p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 shadow glow-purple"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Pilih Berkas Komputer</span>
              </button>
            </div>

            {/* ─── FILE UPLOAD DYNAMIC STATUS ─────────────────────────────────── */}
            {uploadProgress !== null && (
              <div className="mt-3 p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-300 font-medium flex items-center space-x-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>{uploadProgress.percentage < 100 ? "Mengunggah berkas..." : "Menyimpan ke Google Drive..."}</span>
                  </span>
                  <span className="font-mono text-purple-300 text-[11px] font-bold">{uploadProgress.percentage}%</span>
                </div>

                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5">
                  <span>{uploadProgress.uploadedMB} / {uploadProgress.totalMB} MB</span>
                  <span>{uploadProgress.speedMBps}</span>
                  <span>sisa {uploadProgress.remainingSeconds}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
