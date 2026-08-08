"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Radio, Play, Users, Tv, Monitor, RefreshCw, LogOut } from "lucide-react";

export default function DashboardPage() {
  const [roomTitle] = useState("Main Stage — Keynote Session");
  const [roomCode] = useState("A7K9P2");

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
            <span>Host Authenticated</span>
          </div>
          <Link href="/login" className="text-slate-400 hover:text-white transition">
            <LogOut className="w-5 h-5" />
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl w-full mx-auto p-6 md:p-10 flex-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Active Stage Rooms</h1>
            <p className="text-slate-400 text-sm mt-1">
              Create, manage, and reconnect to authoritative StagePilot Rooms
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition flex items-center space-x-2 shadow-md glow-purple">
              <Plus className="w-4 h-4" />
              <span>Create New Room</span>
            </button>
          </div>
        </div>

        {/* Room Card */}
        <div className="grid grid-cols-1 gap-6">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 hover:border-purple-500/50 transition shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 mb-6">
              <div>
                <div className="flex items-center space-x-3">
                  <span className="px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800/50 text-emerald-400 text-xs font-semibold uppercase tracking-wide">
                    Live Room
                  </span>
                  <span className="text-xs text-slate-400">Created 12 mins ago</span>
                </div>
                <h2 className="text-2xl font-bold mt-2">{roomTitle}</h2>
              </div>

              <div className="flex items-center space-x-3 bg-slate-900 px-4 py-3 rounded-2xl border border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Room Code:</span>
                <span className="font-mono text-2xl font-extrabold text-purple-400 tracking-widest">{roomCode}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                <div className="text-slate-400 text-xs flex items-center space-x-1.5 mb-1">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span>Devices</span>
                </div>
                <span className="text-xl font-bold">4 Connected</span>
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
                <span className="text-xl font-bold">1 Display</span>
              </div>

              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
                <div className="text-slate-400 text-xs flex items-center space-x-1.5 mb-1">
                  <Monitor className="w-4 h-4 text-pink-400" />
                  <span>Confidence</span>
                </div>
                <span className="text-xl font-bold">1 Display</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/control"
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-sm transition flex items-center space-x-2 glow-purple"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Enter Control Room</span>
              </Link>
              <Link
                href="/control/presentation"
                className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 font-medium text-sm transition flex items-center space-x-2"
              >
                <span>Presentation View</span>
              </Link>
              <button className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition flex items-center space-x-1.5 text-sm">
                <RefreshCw className="w-4 h-4" />
                <span>Sync State</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
