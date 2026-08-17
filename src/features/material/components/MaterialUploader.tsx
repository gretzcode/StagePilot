"use client";

import { useState, useRef, useEffect } from "react";
import { defaultPresentationAdapter } from "../adapter";
import { Material } from "@/core/types";
import { validateExternalUrl } from "../validator";
import { Link as LinkIcon, AlertCircle, Upload, CheckCircle2, Loader2, Sparkles, Cloud, FileText } from "lucide-react";

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
  stepsList: string[];
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
        const steps = [
          "Memvalidasi tautan & nama dokumen",
          "Mengunduh file PDF dari server sumber",
          "Mengamankan berkas ke Google Drive",
          "Menghitung halaman & menyiapkan antrean",
        ];

        setProcessingStage({
          currentStep: 1,
          totalSteps: 4,
          title: "Memvalidasi Tautan",
          description: "Memeriksa ketersediaan dokumen dan mengekstrak nama berkas...",
          stepsList: steps,
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 2,
                    title: "Mengunduh Berkas PDF",
                    description: "Sedang mengambil data dokumen dari server sumber, mohon tunggu...",
                  }
                : null
            );
          }, 800)
        );

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 3,
                    title: "Mengamankan ke Google Drive",
                    description: `Menyimpan dokumen ke folder room ${roomCode.toUpperCase()} di Google Drive...`,
                  }
                : null
            );
          }, 2400)
        );

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 4,
                    title: "Menghitung Halaman Dokumen",
                    description: "Memverifikasi jumlah slide otentik agar kontrol panggung presisi...",
                  }
                : null
            );
          }, 4200)
        );
      } else if (isCanva) {
        const steps = [
          "Memvalidasi tautan desain Canva",
          "Menghubungkan ke Canva Connect",
          "Mengekspor slide presentasi",
          "Mendaftarkan materi ke antrean",
        ];

        setProcessingStage({
          currentStep: 1,
          totalSteps: 4,
          title: "Memeriksa Desain Canva",
          description: "Mengekstrak ID presentasi Canva...",
          stepsList: steps,
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 2,
                    title: "Menghubungkan ke Canva Connect",
                    description: "Memverifikasi izin integrasi Canva operator...",
                  }
                : null
            );
          }, 900)
        );

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 3,
                    title: "Mengimpor Slide Canva",
                    description: "Mengonversi halaman presentasi Canva ke materi panggung...",
                  }
                : null
            );
          }, 2600)
        );
      } else if (isVideo) {
        const steps = [
          "Memeriksa URL video",
          "Menganalisis judul & durasi",
          "Mendaftarkan player sinkron ke antrean",
        ];

        setProcessingStage({
          currentStep: 1,
          totalSteps: 3,
          title: "Memeriksa Video",
          description: "Mengekstrak ID video dan ketersediaan embed player...",
          stepsList: steps,
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 2,
                    title: "Menganalisis Media",
                    description: "Menyiapkan sinkronisasi playback play/pause untuk panggung...",
                  }
                : null
            );
          }, 1000)
        );
      } else {
        const steps = [
          "Memvalidasi tautan presentasi",
          "Mendeteksi total halaman otomatis",
          "Mendaftarkan ke antrean panggung",
        ];

        setProcessingStage({
          currentStep: 1,
          totalSteps: 3,
          title: "Memproses Tautan",
          description: "Menganalisis struktur presentasi web...",
          stepsList: steps,
        });

        stageTimerRef.current.push(
          setTimeout(() => {
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 2,
                    title: "Mendeteksi Halaman",
                    description: "Menghitung slide presentasi otomatis...",
                  }
                : null
            );
          }, 1200)
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

      if (!res.ok) {
        throw new Error(json.message || json.error || "Gagal memproses link presentasi.");
      }

      const fallbackMat = await defaultPresentationAdapter.loadMaterial(
        urlInput.trim(),
        title,
        validation.materialType
      );
      onMaterialAdded(fallbackMat);
      setUrlInput("");
      setUrlTitle("");
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

    const steps = [
      "Mengunggah berkas ke server",
      "Menyimpan ke Google Drive room",
      "Memverifikasi halaman & mendaftarkan",
    ];

    setProcessingStage({
      currentStep: 1,
      totalSteps: 3,
      title: "Mengunggah Berkas",
      description: `Mengirim ${file.name} ke server...`,
      stepsList: steps,
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
            setProcessingStage((prev) =>
              prev
                ? {
                    ...prev,
                    currentStep: 2,
                    title: "Menyimpan ke Google Drive",
                    description: `Mengamankan ${file.name} ke folder room ${roomCode.toUpperCase()} di Google Drive...`,
                  }
                : null
            );

            stageTimerRef.current.push(
              setTimeout(() => {
                setProcessingStage((prev) =>
                  prev
                    ? {
                        ...prev,
                        currentStep: 3,
                        title: "Menganalisis Dokumen",
                        description: "Menghitung total halaman & mendaftarkan ke antrean panggung...",
                      }
                    : null
                );
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
      <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-300">Add Stage Material</h4>
          </div>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Room: {roomCode}</span>
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
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-950/80 border border-rose-800/60 text-rose-200 text-xs flex items-start space-x-2.5 shadow-lg">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Gagal Menambahkan Materi</p>
              <p className="text-rose-300/90 text-[11px] mt-0.5 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* ─── LIVE PROCESSING STAGE TRACKER ──────────────────────────────────────── */}
        {loading && processingStage && (
          <div className="mb-4 p-4 rounded-2xl bg-purple-950/40 border border-purple-500/50 shadow-xl shadow-purple-950/30 animate-in fade-in duration-300">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 flex-shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400 bg-purple-950 px-2 py-0.5 rounded-md border border-purple-800/60">
                      Langkah {processingStage.currentStep} dari {processingStage.totalSteps}
                    </span>
                    <span className="text-xs font-bold text-white">{processingStage.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{processingStage.description}</p>
                </div>
              </div>
            </div>

            {/* Visual Step Timeline */}
            <div className="space-y-1.5 pt-2 border-t border-purple-900/40 mt-3">
              {processingStage.stepsList.map((stepName, idx) => {
                const stepNum = idx + 1;
                const isDone = stepNum < processingStage.currentStep;
                const isCurrent = stepNum === processingStage.currentStep;

                return (
                  <div
                    key={stepName}
                    className={`flex items-center space-x-2 text-[11px] transition-all ${
                      isDone
                        ? "text-emerald-400 font-medium"
                        : isCurrent
                        ? "text-purple-200 font-bold"
                        : "text-slate-500"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    ) : isCurrent ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-slate-700 flex items-center justify-center text-[9px] flex-shrink-0 text-slate-600">
                        {stepNum}
                      </div>
                    )}
                    <span className="truncate">{stepName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "link" ? (
          <form onSubmit={handleUrlSubmit} className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-400">Judul Presentasi (Opsional)</label>
                {isDiscoveringTitle && (
                  <span className="text-[10px] text-purple-400 animate-pulse font-medium flex items-center space-x-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Mendeteksi judul otomatis...</span>
                  </span>
                )}
              </div>
              <input
                type="text"
                disabled={loading}
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
                placeholder="Otomatis diambil dari metadata atau isi nama kustom"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 transition disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Tautan Google Drive / Canva / PDF / YouTube / Vimeo
              </label>
              <div className="relative">
                <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
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
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500 font-mono transition disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !urlInput.trim()}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs transition glow-purple shadow-md cursor-pointer mt-2 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{processingStage ? processingStage.title : "Memproses Materi..."}</span>
                </>
              ) : (
                <>
                  <PlusIcon className="w-4 h-4" />
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
              <div className="w-12 h-12 rounded-2xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-400 shadow-inner">
                {loading ? <Cloud className="w-6 h-6 animate-pulse" /> : <FileText className="w-6 h-6" />}
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-slate-200 mb-1">Drag & drop file presentasi di sini</p>
                <p className="text-[11px] text-slate-400">PDF, Gambar, atau Video (tersimpan otomatis ke Google Drive)</p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition shadow glow-purple cursor-pointer flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{processingStage?.title || "Mengunggah..."}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Pilih Berkas dari Komputer</span>
                  </>
                )}
              </button>
            </div>

            {uploadProgress !== null && (
              <div className="mt-4 p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-purple-300 flex items-center space-x-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                    <span>{uploadProgress.percentage < 100 ? "Mengunggah..." : "Menyimpan ke Google Drive..."}</span>
                  </span>
                  <span className="font-mono text-white font-bold">{uploadProgress.percentage}%</span>
                </div>

                <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  <div className="text-center">
                    <p className="font-bold text-slate-200">{uploadProgress.uploadedMB} / {uploadProgress.totalMB} MB</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Ukuran</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-200">{uploadProgress.speedMBps}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Kecepatan</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-200">{uploadProgress.remainingSeconds}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Estimasi</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
