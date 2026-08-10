"use client";

import { CopyRoomCodeButton } from "@/components/ui/CopyRoomCodeButton";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Radio, Play, Users, Tv, Monitor, LogOut, AlertCircle, Trash2, X, AlertTriangle } from "lucide-react";

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

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [roomToDelete, setRoomToDelete] = useState<RoomItem | null>(null);

  useEffect(() => {
    async function initDashboard() {
      try {
        const authRes = await fetch("/api/auth/me");
        const authData = (await authRes.json()) as { authenticated?: boolean; user?: { id: string; email: string; name: string } };
        if (!authRes.ok || !authData.authenticated || !authData.user) {
          router.push("/login");
          return;
        }
        setUser(authData.user);

        // Fetch host rooms list
        const roomsRes = await fetch("/api/room/list");
        if (roomsRes.ok) {
          const roomsData = (await roomsRes.json()) as { success?: boolean; rooms?: RoomItem[] };
          if (roomsData.success && Array.isArray(roomsData.rooms)) {
            setRooms(roomsData.rooms);
          }
        }
      } catch {
        router.push("/login");
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
      const res = await fetch("/api/room/create", {
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
      const res = await fetch("/api/room/delete", {
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
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
            SP
          </div>
          <span className="font-bold text-lg">StagePilot Host Dashboard</span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Host: {user?.email || "Authenticated"}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-900"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl w-full mx-auto p-6 md:p-10 flex-1">
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/80 border border-rose-800/60 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
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
                      href={`/control?roomCode=${room.roomCode}`}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition flex items-center space-x-2 glow-purple"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Enter Control Room</span>
                    </Link>
                    <Link
                      href={`/control/presentation?roomCode=${room.roomCode}&role=host`}
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
      </main>

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
