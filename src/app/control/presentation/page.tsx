"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Material } from "@/core/types";
import { ThumbnailList } from "@/features/material/components/ThumbnailList";
import { SlideViewer } from "@/features/material/components/SlideViewer";
import { TimerControl } from "@/features/timer/components/TimerControl";
import { BriefControl } from "@/features/brief/components/BriefControl";
import { MaterialUploader } from "@/features/material/components/MaterialUploader";
import {
  ChevronLeft,
  ChevronRight,
  Square,
  Eye,
  EyeOff,
  LogOut,
  Tv,
  Layers,
  Sparkles,
  X,
  ListVideo,
  Plus,
  Play,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react";
import { useStageRoomSession } from "@/core/realtime/useStageRoomSession";
import { FriendlyErrorState } from "@/components/ui/FriendlyErrorState";
import { PendingApprovalState } from "@/components/ui/PendingApprovalState";
import { getPersistentDeviceId } from "@/core/utils/device-id";
import { CopyRoomCodeButton } from "@/components/ui/CopyRoomCodeButton";

function PresentationControlContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawRoomCode = searchParams.get("roomCode");
  const roomCode = rawRoomCode ? rawRoomCode.trim().toUpperCase() : "";
  const requestedRole = (searchParams.get("role") || "control") as "host" | "control";

  const [deviceId] = useState(() => getPersistentDeviceId(requestedRole, roomCode, searchParams.get("deviceId")));
  const [showUploader, setShowUploader] = useState(false);

  const { state, roomError, roomName, approvalStatus, dispatchCommand } = useStageRoomSession({
    roomCode,
    role: requestedRole,
    deviceId,
    deviceName: requestedRole === "host" ? "Host Primary Controller" : "Presentation Controller",
  });

  // Keyboard Navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        dispatchCommand("SLIDE_NEXT");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        dispatchCommand("SLIDE_PREVIOUS");
      } else if (e.key === " ") {
        e.preventDefault();
        if (state?.timer.status === "running") {
          dispatchCommand("TIMER_PAUSE");
        } else {
          dispatchCommand("TIMER_START");
        }
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        dispatchCommand("DISPLAY_BLANK", { blank: !state?.presentation.blanked });
      } else if (e.key === "Home") {
        e.preventDefault();
        dispatchCommand("SLIDE_GOTO", { pageNumber: 1 });
      } else if (e.key === "End") {
        e.preventDefault();
        if (state?.presentation.totalPages) {
          dispatchCommand("SLIDE_GOTO", { pageNumber: state.presentation.totalPages });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatchCommand, state]);

  const activeMaterial = state?.materials.find((m) => m.id === state?.presentation.materialId) || null;

  // Discover the real page count for Google Slides and expand the deck dynamically.
  useEffect(() => {
    if (!activeMaterial || (activeMaterial.type !== "url" && activeMaterial.type !== "canva")) return;

    const rawUrl = activeMaterial.externalUrl || activeMaterial.url || "";
    const match = rawUrl.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
    const googlePresentationId = match ? match[1] : null;

    if (!googlePresentationId) return;

    let isMounted = true;

    async function discoverSlideCount() {
      if (!activeMaterial) return;

      setIsDiscoveringSlides(true);
      const initialCount = Math.max(1, activeMaterial.totalPages || activeMaterial.slides?.length || 1);
      setDiscoveredPlaceholderCount(initialCount);

      const checkImageWithRetry = (page: number, retries = 1): Promise<boolean> => {
        return new Promise((resolve) => {
          const attempt = (remainingRetries: number) => {
            const img = new Image();
            const timer = window.setTimeout(() => {
              img.onload = null;
              img.onerror = null;
              if (remainingRetries > 0) {
                attempt(remainingRetries - 1);
              } else {
                resolve(false);
              }
            }, 3500);

            img.onload = () => {
              window.clearTimeout(timer);
              resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
            };
            img.onerror = () => {
              window.clearTimeout(timer);
              if (remainingRetries > 0) {
                attempt(remainingRetries - 1);
              } else {
                resolve(false);
              }
            };
            img.src = `https://docs.google.com/presentation/d/${googlePresentationId}/export/png?id=${googlePresentationId}&pageid=p${page}`;
          };
          attempt(retries);
        });
      };

      const maxPagesToScan = Math.max(40, activeMaterial.totalPages || 1);
      let discoveredPages = activeMaterial.totalPages || 1;
      let page = 1;

      while (page <= maxPagesToScan) {
        if (!isMounted) break;

        const batchSize = 4;
        const currentBatch = Array.from({ length: Math.min(batchSize, maxPagesToScan - page + 1) }, (_, index) => page + index);
        const results = await Promise.all(currentBatch.map((targetPage) => checkImageWithRetry(targetPage)));

        const confirmedInBatch = currentBatch.filter((_, index) => results[index]);
        if (confirmedInBatch.length > 0) {
          discoveredPages = confirmedInBatch[confirmedInBatch.length - 1];
          setDiscoveredPlaceholderCount(discoveredPages);
        }

        if (confirmedInBatch.length === 0) {
          break;
        }

        page = currentBatch[currentBatch.length - 1] + 1;
      }

      if (!isMounted || !activeMaterial) return;

      const expandedSlides = Array.from({ length: discoveredPages }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        url: rawUrl,
        contentUrl: rawUrl,
      }));

      dispatchCommand("MATERIAL_ADD", {
        material: {
          ...activeMaterial,
          totalPages: discoveredPages,
          slides: expandedSlides,
        },
      });
      setDiscoveredPlaceholderCount(discoveredPages);
      setIsDiscoveringSlides(false);
    }

    void discoverSlideCount();

    return () => {
      isMounted = false;
    };
  }, [activeMaterial?.id, dispatchCommand]);

  // ── PDF: update material totalPages when PDF.js discovers the real count ────
  const handlePdfNumPagesDiscovered = (numPages: number) => {
    if (!activeMaterial) return;
    if (numPages <= 1 || numPages === activeMaterial.totalPages) return;
    const expandedSlides = Array.from({ length: numPages }, (_, i) => ({
      index: i + 1,
      title: `Page ${i + 1}`,
      url: activeMaterial.externalUrl || activeMaterial.url || "",
      contentUrl: activeMaterial.externalUrl || activeMaterial.url || "",
    }));
    dispatchCommand("MATERIAL_ADD", {
      material: {
        ...activeMaterial,
        totalPages: numPages,
        slides: expandedSlides,
      },
    });
  };



  const [leftTab, setLeftTab] = useState<"playlist" | "slides">("playlist");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [discoveredPlaceholderCount, setDiscoveredPlaceholderCount] = useState<number | null>(null);
  const [isDiscoveringSlides, setIsDiscoveringSlides] = useState(false);

  // Auto-switch sidebar tab to 'slides' whenever GO LIVE / PRESENT is clicked or active
  useEffect(() => {
    if (state?.presentation.isPresenting && state.presentation.materialId) {
      setLeftTab("slides");
    }
  }, [state?.presentation.isPresenting, state?.presentation.materialId]);

  // Auto-redirect to main control page when presentation is stopped/exited
  useEffect(() => {
    if (state && !state.presentation.isPresenting) {
      router.push(`/control?roomCode=${encodeURIComponent(roomCode)}${requestedRole === "host" ? "&role=host" : "&role=control"}`);
    }
  }, [state?.presentation.isPresenting, roomCode, requestedRole, router]);

  const handleAddMaterial = (newMaterial: Material) => {
    setShowUploader(false);
    dispatchCommand("MATERIAL_ADD", { material: newMaterial });

    if (!state?.presentation.isPresenting) {
      dispatchCommand("PRESENTATION_START", { materialId: newMaterial.id, startPage: 1 });
      setLeftTab("slides");
    }
  };

  const handleRemoveMaterial = (materialId: string) => {
    dispatchCommand("MATERIAL_REMOVE", { materialId });
    fetch("/api/material/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ materialId }),
    }).catch(() => {});
  };

  // 1. Technical & Room Access Errors
  if (roomError) {
    return <FriendlyErrorState errorType={roomError} roomCode={roomCode} />;
  }

  // 2. Pending Approval State for Guest Controller (P0-1)
  if (approvalStatus === "pending") {
    return (
      <PendingApprovalState
        deviceName="Presentation Controller"
        roomCode={roomCode}
        role="control"
      />
    );
  }

  // 3. Rejected or Revoked Device Access State
  if (approvalStatus === "rejected" || approvalStatus === "revoked") {
    return (
      <FriendlyErrorState
        errorType={approvalStatus === "revoked" ? "DEVICE_REVOKED" : "DEVICE_REJECTED"}
        roomCode={roomCode}
      />
    );
  }

  // 4. Approved Presentation Control Surface
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Stage Control Header — Ultra-Clean Single Row for Mobile & Desktop */}
      <header className="h-14 px-3 sm:px-6 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center font-black text-white glow-purple text-xs flex-shrink-0">
            SP
          </div>

          <div className="flex items-center space-x-1.5 min-w-0">
            <CopyRoomCodeButton roomCode={roomCode} />
            {roomName && <span className="text-[11px] text-purple-300 font-semibold truncate hidden md:inline">({roomName})</span>}
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
          {/* Toggle Sidebar Icon Button */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl bg-slate-800/90 border border-slate-700 hover:bg-slate-700 text-purple-300 transition cursor-pointer flex items-center justify-center"
            title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
          >
            {isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            <span className="hidden sm:inline text-xs font-semibold ml-1.5">{isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}</span>
          </button>

          {/* Blank Display Toggle Button */}
          <button
            onClick={() => dispatchCommand("DISPLAY_BLANK", { blank: !state?.presentation.blanked })}
            className={`p-2 sm:px-3 sm:py-1.5 rounded-xl border text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
              state?.presentation.blanked
                ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                : "bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white"
            }`}
            title={state?.presentation.blanked ? "Unblank Display" : "Blank Display (B)"}
          >
            {state?.presentation.blanked ? <EyeOff className="w-4 h-4 text-amber-400" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline">{state?.presentation.blanked ? "DISPLAY BLANKED" : "BLANK DISPLAY (B)"}</span>
          </button>

          {/* Exit Presentation Button */}
          <button
            onClick={() => router.push(`/control?roomCode=${encodeURIComponent(roomCode)}${requestedRole === "host" ? "&role=host" : "&role=control"}`)}
            className="p-2 rounded-xl bg-slate-800/90 border border-slate-700 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title="Exit Presentation"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body: Off-canvas Mobile Drawer + Docked Desktop Sidebar */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 overflow-hidden relative">
        {/* Mobile Backdrop Overlay (Tapping outside closes drawer) */}
        {isSidebarOpen && (
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 transition-opacity"
          />
        )}

        {/* Left Column: Playlist Queue & Slides Deck (Slide-over Drawer on Mobile, Docked Sidebar on Desktop) */}
        {isSidebarOpen && (
          <aside className="fixed inset-y-0 left-0 w-80 max-w-[85vw] lg:w-full bg-slate-900 border-r border-slate-800 shadow-2xl z-50 lg:z-auto flex flex-col overflow-hidden lg:static col-span-12 lg:col-span-3 transition-transform duration-300">
            {/* Tab Switcher & Mobile Close Header */}
            <div className="p-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full">
                <button
                  onClick={() => setLeftTab("playlist")}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                    leftTab === "playlist" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <ListVideo className="w-3.5 h-3.5" />
                  <span>PLAYLIST ({state?.materials.length || 0})</span>
                </button>

                <button
                  onClick={() => setLeftTab("slides")}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] transition flex items-center justify-center space-x-1.5 cursor-pointer ${
                    leftTab === "slides" ? "bg-purple-600 text-white shadow-md" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>SLIDES ({state?.presentation.totalPages || 0})</span>
                </button>
              </div>

              {/* Close Drawer Button (Mobile Only) */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition flex-shrink-0"
                title="Close Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Left Column Content View */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {leftTab === "playlist" ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Queue</span>
                    <button
                      onClick={() => setShowUploader(true)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center space-x-1 shadow glow-purple cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Material</span>
                    </button>
                  </div>

                  {showUploader && (
                    <div className="relative">
                      <button
                        onClick={() => setShowUploader(false)}
                        className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-lg z-10"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <MaterialUploader roomCode={roomCode} onMaterialAdded={handleAddMaterial} />
                    </div>
                  )}

                  {/* Material Queue Items List */}
                  <div className="space-y-2.5">
                    {!state?.materials || state.materials.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40 text-slate-500 text-xs">
                        No materials in queue. Click &quot;Add Material&quot; above.
                      </div>
                    ) : (
                      state.materials.map((mat) => {
                        const isLive = state.presentation.isPresenting && state.presentation.materialId === mat.id;
                        return (
                          <div
                            key={mat.id}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              isLive
                                ? "bg-purple-950/40 border-purple-500/80 shadow-lg ring-1 ring-purple-500/40"
                                : "bg-slate-900 border-slate-800 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-400 block mb-0.5">
                                  {mat.type.toUpperCase()} • {mat.totalPages} SLIDES
                                </span>
                                <h4 className="text-xs font-bold text-white line-clamp-1">{mat.name}</h4>
                              </div>

                              {isLive ? (
                                <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center space-x-1 animate-pulse">
                                  <Play className="w-2.5 h-2.5 fill-current" />
                                  <span>LIVE</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[9px] font-bold uppercase tracking-wider">
                                  READY
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60 mt-2">
                              {!isLive ? (
                                <>
                                  <button
                                    onClick={() => {
                                      dispatchCommand("PRESENTATION_START", { materialId: mat.id, startPage: 1 });
                                      setLeftTab("slides");
                                    }}
                                    className="flex-1 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 glow-purple cursor-pointer shadow"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    <span>GO LIVE NOW</span>
                                  </button>
                                  <button
                                    onClick={() => handleRemoveMaterial(mat.id)}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                                    title="Remove from Queue & Database"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setLeftTab("slides")}
                                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
                                >
                                  <Layers className="w-3 h-3 text-purple-400" />
                                  <span>VIEW SLIDES DECK</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* Slides Thumbnails List View */
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      {activeMaterial?.name || "Active Presentation"}
                    </span>
                    <span className="text-[10px] font-mono text-purple-400 font-bold">
                      {state?.presentation.currentPage || 1} / {state?.presentation.totalPages || 1}
                    </span>
                  </div>
                  <ThumbnailList
                    material={activeMaterial}
                    currentPage={state?.presentation.currentPage || 1}
                    placeholderCount={discoveredPlaceholderCount}
                    isDiscoveringSlides={isDiscoveringSlides}
                    onSelectSlide={(pageNumber) => {
                      dispatchCommand("SLIDE_GOTO", { pageNumber });
                      if (typeof window !== "undefined" && window.innerWidth < 1024) {
                        setIsSidebarOpen(false);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Center Column: Live Slide Output Viewer (Expands dynamically to col-span-9 when sidebar is hidden) */}
        <div className={`${isSidebarOpen ? "col-span-12 lg:col-span-6" : "col-span-12 lg:col-span-9"} bg-black flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden transition-all duration-200 min-h-[350px] sm:min-h-[450px]`}>
          <div className="flex-1 flex items-center justify-center relative min-h-[250px]">
            <SlideViewer
              material={activeMaterial}
              slide={state?.presentation.currentSlide || null}
              currentPage={state?.presentation.currentPage || 1}
              blanked={state?.presentation.blanked}
              role="control"
              onNumPagesDiscovered={handlePdfNumPagesDiscovered}
            />
          </div>

          {/* Slide Controls Bar */}
          <div className="h-16 bg-slate-900/90 border border-slate-800 rounded-2xl px-4 sm:px-6 flex items-center justify-between shadow-2xl mt-4 z-10">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => dispatchCommand("SLIDE_PREVIOUS")}
                disabled={!state?.presentation.currentPage || state.presentation.currentPage <= 1}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white transition cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => dispatchCommand("SLIDE_NEXT")}
                disabled={
                  !state?.presentation.currentPage ||
                  (activeMaterial?.type !== "url" &&
                    activeMaterial?.type !== "canva" &&
                    !!state.presentation.totalPages &&
                    state.presentation.totalPages > 1 &&
                    state.presentation.currentPage >= state.presentation.totalPages)
                }
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white transition cursor-pointer"
                title="Next Slide (Right Arrow)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <span className="font-mono text-xs sm:text-sm font-bold text-slate-300">
              SLIDE {state?.presentation.currentPage || 1} / {state?.presentation.totalPages || 1}
            </span>

            <button
              onClick={() => {
                dispatchCommand("PRESENTATION_EXIT");
              }}
              className="px-3 sm:px-3.5 py-2 rounded-xl bg-rose-950/80 border border-rose-800 hover:bg-rose-900 text-rose-300 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-md"
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Stop Presentation</span>
            </button>
          </div>
        </div>

        {/* Right Column: Timer & Show Caller Brief Cue Controls */}
        <div className="col-span-12 lg:col-span-3 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900/40 p-4 space-y-4 overflow-y-auto">
          {/* Stage Timer Control */}
          {state && (
            <TimerControl
              timer={state.timer}
              onStart={() => dispatchCommand("TIMER_START")}
              onPause={() => dispatchCommand("TIMER_PAUSE")}
              onReset={() => dispatchCommand("TIMER_RESET")}
              onSetDuration={(duration) => dispatchCommand("TIMER_SET", { duration })}
            />
          )}

          {/* Show Caller Brief Cue Control */}
          {state && (
            <BriefControl
              brief={state.brief}
              onSendBrief={(text, urgency) => dispatchCommand("BRIEF_UPDATE", { text, urgency })}
            />
          )}

          {/* Quick Display Links Panel */}
          <div className="glass-panel p-4 rounded-3xl border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Live Stage Displays
            </span>

            <a
              href={`/display/audience?roomCode=${roomCode}`}
              target="_blank"
              rel="noreferrer"
              className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-indigo-300 flex items-center justify-between transition"
            >
              <span className="flex items-center space-x-2">
                <Tv className="w-4 h-4 text-indigo-400" />
                <span>Audience Display Window</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">↗</span>
            </a>

            <a
              href={`/display/confidence?roomCode=${roomCode}`}
              target="_blank"
              rel="noreferrer"
              className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-purple-300 flex items-center justify-between transition"
            >
              <span className="flex items-center space-x-2">
                <Tv className="w-4 h-4 text-purple-400" />
                <span>Confidence Display Window</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">↗</span>
            </a>
          </div>
        </div>
      </div>

      {/* Material Uploader Modal */}
      {showUploader && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg relative">
            <button
              onClick={() => setShowUploader(false)}
              className="absolute top-4 right-4 z-10 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <MaterialUploader roomCode={roomCode} onMaterialAdded={handleAddMaterial} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function PresentationControlPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>}>
      <PresentationControlContent />
    </Suspense>
  );
}
