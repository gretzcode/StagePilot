"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Users, CheckCircle, XCircle, Play, Radio } from "lucide-react";

export default function ControlRoomPage() {
  const [roomCode] = useState("A7K9P2");
  const [pendingDevices, setPendingDevices] = useState([
    { id: "dev-99", name: "Backstage iPad Pro", role: "confidence", userAgent: "Safari / iPadOS" },
    { id: "dev-101", name: "AV Desk Laptop", role: "control", userAgent: "Chrome / Windows" },
  ]);
  const [approvedDevices, setApprovedDevices] = useState([
    { id: "dev-host", name: "Host Workstation", role: "host", status: "online" },
    { id: "dev-aud-1", name: "Main Projector Mac", role: "audience", status: "online" },
  ]);

  const handleApprove = (id: string) => {
    const dev = pendingDevices.find((d) => d.id === id);
    if (dev) {
      setPendingDevices(pendingDevices.filter((d) => d.id !== id));
      setApprovedDevices([...approvedDevices, { id: dev.id, name: dev.name, role: dev.role, status: "online" }]);
    }
  };

  const handleReject = (id: string) => {
    setPendingDevices(pendingDevices.filter((d) => d.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Control Bar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center font-bold text-white shadow-md">
            SP
          </div>
          <div>
            <h1 className="font-bold text-base flex items-center space-x-2">
              <span>Control Room</span>
              <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded-full font-mono">
                Code: {roomCode}
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/control/presentation"
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition flex items-center space-x-2 shadow-md glow-purple"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Launch Presentation Control</span>
          </Link>
          <Link
            href="/dashboard"
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white text-xs transition"
          >
            Exit Control Room
          </Link>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Device Approval Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg flex items-center space-x-2">
                <Users className="w-5 h-5 text-purple-400" />
                <span>Pending Guest Device Approvals</span>
              </h2>
              <span className="text-xs bg-amber-950/80 border border-amber-800/60 text-amber-400 px-2.5 py-1 rounded-full font-semibold">
                {pendingDevices.length} Pending
              </span>
            </div>

            {pendingDevices.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40 text-slate-500 text-sm">
                No pending device approval requests.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingDevices.map((device) => (
                  <div
                    key={device.id}
                    className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <h4 className="font-semibold text-sm text-white">{device.name}</h4>
                      <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1">
                        <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          Role: {device.role}
                        </span>
                        <span>•</span>
                        <span>{device.userAgent}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleApprove(device.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1 transition"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => handleReject(device.id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-800/50 text-xs font-semibold flex items-center space-x-1 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Approved Connected Devices List */}
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl">
            <h2 className="font-bold text-lg mb-4 flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Authorized Room Devices</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {approvedDevices.map((dev) => (
                <div key={dev.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-white">{dev.name}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="mt-2 text-xs text-slate-400 flex items-center justify-between">
                    <span className="capitalize font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">
                      {dev.role}
                    </span>
                    <span className="text-emerald-400 font-semibold">{dev.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Room Quick Status Sidebar */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 shadow-xl">
            <h3 className="font-bold text-base mb-4 flex items-center space-x-2">
              <Radio className="w-4 h-4 text-purple-400" />
              <span>Runtime Coordinator</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Durable Object:</span>
                <span className="font-mono text-purple-300">StageRoom DO Active</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">WebSocket API:</span>
                <span className="font-mono text-emerald-400">Hibernation Enabled</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400">Failover/Takeover:</span>
                <span className="font-mono text-slate-300">Ready</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
