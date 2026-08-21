"use client";

import { CopyRoomCodeButton } from "@/components/ui/CopyRoomCodeButton";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Radio, Play, Users, Tv, Monitor, LogOut, AlertCircle, Trash2, X, AlertTriangle, HardDrive } from "lucide-react";
import { ROUTES, API_ROUTES } from "@/lib/routes";

interface RoomItem {
  roomId: string;
  roomCode: string;
  title: string;
  createdAt: number;
  status: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<{ connected: boolean; account: string | null } | null>(null);
  const [canvaStatus, setCanvaStatus] = useState<{ connected: boolean; accountName: string | null; accountEmail: string | null } | null>(null);
  const [canvaDesigns, setCanvaDesigns] = useState<Array<{ id: string; title: string; thumbnail?: { url: string } }>>([]);
  const [isCanvaModalOpen, setIsCanvaModalOpen] = useState(false);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [disconnectingCanva, setDisconnectingCanva] = useState(false);
  const [disconnectingDrive, setDisconnectingDrive] = useState(false);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [roomToDelete, setRoomToDelete] = useState<RoomItem | null>(null);

  useEffect(() => {
    async function initDashboard() {
      try {
        const authRes = await fetch(API_ROUTES.auth.me);
        const authData = (await authRes.json()) as { authenticated?: boolean; user?: { id: string; email: string; name: string } };
        if (!authRes.ok || !authData.authenticated || !authData.user) {
          router.push(ROUTES.login(ROUTES.dashboard()));
          return;
        }
        setUser(authData.user);

        // Fetch host rooms list
        const roomsRes = await fetch(API_ROUTES.room.list);
        if (roomsRes.ok) {
          const roomsData = (await roomsRes.json()) as { success?: boolean; rooms?: RoomItem[] };
          if (roomsData.success && Array.isArray(roomsData.rooms)) {
            setRooms(roomsData.rooms);
          }
        }

        const driveRes = await fetch(API_ROUTES.integrations.googleDrive.status);
        if (driveRes.ok) {
          const driveData = (await driveRes.json()) as { connected?: boolean; account?: string | null };
          setDriveStatus({ connected: Boolean(driveData.connected), account: driveData.account || null });
        }

        const canvaRes = await fetch(API_ROUTES.integrations.canva.status);
        if (canvaRes.ok) {
          const canvaData = (await canvaRes.json()) as { connected?: boolean; accountName?: string | null; accountEmail?: string | null };
          setCanvaStatus({
            connected: Boolean(canvaData.connected),
            accountName: canvaData.accountName || null,
            accountEmail: canvaData.accountEmail || null,
          });
        }
      } catch {
        router.push(ROUTES.login(ROUTES.dashboard()));
      } finally {
        setLoading(false);
      }
    }
    initDashboard();
  }, [router]);

  const handleOpenCreateModal = () => {
    setNewRoomTitle("");
    setIsModalOpen(true);
  };

  const handleCreateRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim()) return;

    setCreating(true);
    setError(null);
    try {
      const res = await fetch(API_ROUTES.room.create, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newRoomTitle.trim() }),
      });
      const data = (await res.json()) as { success?: boolean; room?: RoomItem; error?: string };
      if (!res.ok || !data.success || !data.room) {
        throw new Error(data.error || "Failed to create room");
      }
      setRooms((prev) => [data.room!, ...prev]);
      setIsModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Room creation failed");
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmDelete = useCallback(async () => {
    if (!roomToDelete) return;
    const targetId = roomToDelete.roomId;
    setDeletingId(targetId);
    setError(null);
    try {
      const res = await fetch(API_ROUTES.room.delete, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: targetId }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menghapus room");
      }
      setRooms((prev) => prev.filter((r) => r.roomId !== targetId));
      setRoomToDelete(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menghapus room");
    } finally {
      setDeletingId(null);
    }
  }, [roomToDelete]);

  // Keyboard shortcut listener for Delete Confirmation Modal (Enter = Delete, Esc = Cancel)
  useEffect(() => {
    if (!roomToDelete) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setRoomToDelete(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleConfirmDelete();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [roomToDelete, handleConfirmDelete]);

  // Keyboard shortcut listener for Create Modal (Esc = Cancel)
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  const handleLogout = async () => {
    await fetch(API_ROUTES.auth.logout, { method: "POST" });
    router.push(ROUTES.login());
  };

  const handleBrowseCanvaDesigns = async () => {
    setIsCanvaModalOpen(true);
    setLoadingDesigns(true);
    try {
      const res = await fetch(API_ROUTES.integrations.canva.designs);
      const data = (await res.json()) as { success?: boolean; designs?: Array<{ id: string; title: string; thumbnail?: { url: string } }> };
      if (res.ok && data.success && Array.isArray(data.designs)) {
        setCanvaDesigns(data.designs);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingDesigns(false);
    }
  };

  const handleDisconnectCanva = async () => {
    setDisconnectingCanva(true);
    try {
      await fetch("/api/integrations/canva/disconnect", { method: "POST" });
      setCanvaStatus({ connected: false, accountName: null, accountEmail: null });
    } catch {
      // Non-fatal
    } finally {
      setDisconnectingCanva(false);
    }
  };

  const handleDisconnectDrive = async () => {
    setDisconnectingDrive(true);
    try {
      await fetch("/api/google-drive/disconnect", { method: "POST" });
      setDriveStatus({ connected: false, account: null });
    } catch {
      // Non-fatal
    } finally {
      setDisconnectingDrive(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans relative overflow-x-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Top Navigation / Header */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-6 mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">StagePilot</span>
              <span className="block text-xs font-mono text-purple-400">HOST DASHBOARD</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right hidden sm:block">
              <span className="text-sm font-medium block">{user?.name || "Host User"}</span>
              <span className="text-xs text-slate-400">{user?.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-300 text-sm flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Active Stage Rooms</h1>
            <p className="text-slate-400 text-sm mt-1">
              Create, manage, and reconnect to independent StagePilot Rooms
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition flex items-center space-x-2 shadow-md glow-purple"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Room</span>
            </button>
          </div>
        </div>

        {/* Integrations Section */}
        <div className="mb-8">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Integrations & External Storage</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Google Drive Card */}
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                  <HardDrive className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">Google Drive</h3>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      driveStatus?.connected
                        ? "bg-emerald-950/80 border-emerald-800 text-emerald-400"
                        : "bg-slate-950 border-slate-800 text-slate-500"
                    }`}>
                      {driveStatus?.connected ? "● Connected" : "Not connected"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {driveStatus?.connected ? `Account: ${driveStatus.account || "Connected"}` : "Hubungkan Google Drive untuk import materi PPTX / PDF."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {driveStatus?.connected ? (
                  <>
                    <a
                      href="/api/google-drive/connect"
                      className="flex-1 px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-300 font-medium text-xs text-center transition"
                    >
                      Switch Account
                    </a>
                    <button
                      onClick={handleDisconnectDrive}
                      disabled={disconnectingDrive}
                      className="px-3 py-2 rounded-xl bg-rose-950/60 border border-rose-800 hover:bg-rose-900/80 text-rose-300 font-medium text-xs transition"
                    >
                      {disconnectingDrive ? "..." : "Disconnect"}
                    </button>
                  </>
                ) : (
                  <a
                    href="/api/google-drive/connect"
                    className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium text-xs text-center transition"
                  >
                    Connect Google Drive
                  </a>
                )}
              </div>
            </div>

            {/* Canva Connect API Card */}
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 font-bold text-purple-400 text-sm">
                  C
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">Canva Connect</h3>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      canvaStatus?.connected
                        ? "bg-purple-950/80 border-purple-800 text-purple-300"
                        : "bg-slate-950 border-slate-800 text-slate-500"
                    }`}>
                      {canvaStatus?.connected ? "● Connected" : "Not connected"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {canvaStatus?.connected
                      ? `Account: ${canvaStatus.accountName || canvaStatus.accountEmail || "Canva Connected"}`
                      : "Hubungkan Canva untuk sinkronisasi presentasi & slide native."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canvaStatus?.connected ? (
                  <>
                    <button
                      onClick={handleBrowseCanvaDesigns}
                      className="flex-1 px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 text-purple-300 font-medium text-xs transition"
                    >
                      Browse Designs
                    </button>
                    <button
                      onClick={handleDisconnectCanva}
                      disabled={disconnectingCanva}
                      className="px-3 py-2 rounded-xl bg-rose-950/60 border border-rose-800 hover:bg-rose-900/80 text-rose-300 font-medium text-xs transition"
                    >
                      {disconnectingCanva ? "..." : "Disconnect"}
                    </button>
                  </>
                ) : (
                  <a
                    href="/api/integrations/canva/authorize"
                    className="w-full px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium text-xs text-center transition"
                  >
                    Connect Canva
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Canva Designs Browser Modal */}
        {isCanvaModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-2xl p-6 rounded-3xl border border-slate-800 shadow-2xl relative max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300 font-bold text-xs">
                    C
                  </div>
                  <h3 className="text-lg font-bold text-white">Canva Presentations</h3>
                </div>
                <button
                  onClick={() => setIsCanvaModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {loadingDesigns ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-mono text-slate-400">Loading accessible Canva designs…</span>
                </div>
              ) : canvaDesigns.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  <p>Tidak ada desain presentasi yang ditemukan di akun Canva Anda.</p>
                  <p className="text-xs text-slate-500 mt-2">Buat presentasi di Canva atau paste link Canva langsung pada Control Room.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                  {canvaDesigns.map((design) => (
                    <div
                      key={design.id}
                      className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 transition flex flex-col justify-between"
                    >
                      {design.thumbnail?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={design.thumbnail.url}
                          alt={design.title}
                          className="w-full h-28 object-cover rounded-xl mb-2 bg-slate-950"
                        />
                      ) : (
                        <div className="w-full h-28 rounded-xl bg-slate-950 flex items-center justify-center mb-2 text-slate-600 font-mono text-xs">
                          Preview
                        </div>
                      )}
                      <h4 className="text-sm font-semibold text-white truncate">{design.title || "Untitled Design"}</h4>
                      <span className="text-[10px] font-mono text-slate-400 mt-1 truncate">ID: {design.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Room Cards List */}
        {rooms.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/40 text-slate-400">
            <p className="text-base font-semibold">No active stage rooms found.</p>
            <p className="text-xs text-slate-500 mt-1">Click &quot;Create New Room&quot; above to generate your first room.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {rooms.map((room) => (
              <div
                key={room.roomId}
                className="glass-panel p-6 rounded-3xl border border-slate-800 hover:border-purple-500/50 transition shadow-xl"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 mb-6">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/50 text-emerald-400 text-xs font-semibold uppercase tracking-wide">
                        {room.status}
                      </span>
                      <span className="text-xs text-slate-400">Authoritative Durable Object</span>
                    </div>
                    <h2 className="text-2xl font-bold mt-2">{room.title}</h2>
                  </div>

                  <div className="flex items-center space-x-3">
                    <CopyRoomCodeButton roomCode={room.roomCode} />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-slate-400 text-xs flex items-center space-x-1.5 mb-1">
                      <Users className="w-4 h-4 text-purple-400" />
                      <span>Devices</span>
                    </div>
                    <span className="text-xl font-bold">Realtime</span>
                  </div>

                  <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-slate-400 text-xs flex items-center space-x-1.5 mb-1">
                      <Radio className="w-4 h-4 text-indigo-400" />
                      <span>Control Status</span>
                    </div>
                    <span className="text-xl font-bold">Host Active</span>
                  </div>

                  <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-slate-400 text-xs flex items-center space-x-1.5 mb-1">
                      <Tv className="w-4 h-4 text-blue-400" />
                      <span>Audience</span>
                    </div>
                    <span className="text-xl font-bold">Ready</span>
                  </div>

                  <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                    <div className="text-slate-400 text-xs flex items-center space-x-1.5 mb-1">
                      <Monitor className="w-4 h-4 text-pink-400" />
                      <span>Confidence</span>
                    </div>
                    <span className="text-xl font-bold">Ready</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={ROUTES.control(room.roomCode, "host")}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition flex items-center space-x-2 glow-purple"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Enter Control Room</span>
                    </Link>
                    <Link
                      href={ROUTES.presentation(room.roomCode, "host")}
                      className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium text-sm transition flex items-center space-x-2"
                    >
                      <span>Presentation View</span>
                    </Link>
                  </div>

                  <button
                    onClick={() => setRoomToDelete(room)}
                    className="px-4 py-2.5 rounded-xl bg-rose-950/60 border border-rose-800/60 hover:bg-rose-900/80 text-rose-300 font-medium text-sm transition flex items-center space-x-2"
                    title="Hapus Room"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>Hapus Room</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create New Room Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-2">Create New Stage Room</h2>
            <p className="text-xs text-slate-400 mb-6">
              Set the room title and configuration for your upcoming live session.
            </p>

            <form onSubmit={handleCreateRoomSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                  Event Title
                </label>
                <input
                  type="text"
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 text-sm transition"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creating || !newRoomTitle.trim()}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition glow-purple flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>{creating ? "Membuat..." : "Buat Room"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {roomToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-rose-900/50 w-full max-w-md rounded-3xl p-6 md:p-8 shadow-2xl shadow-rose-950/40 relative animate-in fade-in zoom-in duration-200 text-center">
            <button
              onClick={() => setRoomToDelete(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-rose-950/80 border border-rose-800/60 flex items-center justify-center text-rose-400 mx-auto mb-4 shadow-lg shadow-rose-950/80">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Hapus Stage Room?</h2>
            <p className="text-sm text-slate-300 mb-1">
              Apakah Anda yakin ingin menghapus room <span className="font-mono text-purple-400 font-bold">{roomToDelete.roomCode}</span>?
            </p>
            <p className="text-xs text-slate-400 font-medium mb-6">
              &quot;{roomToDelete.title}&quot; akan ditutup dan dihapus secara permanen. Perangkat yang terhubung akan terputus.
            </p>

            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setRoomToDelete(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-semibold transition"
              >
                Batal (Esc)
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deletingId === roomToDelete.roomId}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:opacity-50 text-white text-sm font-semibold transition shadow-lg shadow-rose-950/80 flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deletingId === roomToDelete.roomId ? "Menghapus..." : "Ya, Hapus (Enter)"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
