import Link from "next/link";
import { Tv, Monitor, ShieldCheck, Cpu, ArrowRight } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-slate-950 text-white overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Header Navigation */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-xl shadow-lg glow-purple">
            SP
          </div>
          <span className="font-bold text-2xl tracking-wider text-white">STAGEPILOT</span>
        </div>

        <nav className="flex items-center space-x-4">
          <Link
            href="/join"
            className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition font-medium text-sm"
          >
            Join Room
          </Link>
          <Link
            href="/login"
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm transition shadow-md glow-purple"
          >
            Host Login
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-5xl mx-auto px-6 py-12 flex flex-col items-center text-center z-10 my-auto">
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-purple-950/60 border border-purple-800/40 text-purple-300 text-xs font-semibold uppercase tracking-wider mb-6">
          <Cpu className="w-4 h-4 text-purple-400" />
          <span>Realtime Stage Control Architecture — Phase 0</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl leading-tight">
          Authoritative Realtime Stage Control for <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">Live Event Crews</span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl font-normal leading-relaxed">
          Zero-drift synchronization between Control Devices, Audience Displays, and Speaker Confidence Monitors backed by Cloudflare Durable Objects.
        </p>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link
            href="/dashboard"
            className="px-8 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center space-x-2 transition glow-purple shadow-xl text-base"
          >
            <span>Open Control Dashboard</span>
            <ArrowRight className="w-5 h-5" />
          </Link>

          <Link
            href="/join"
            className="px-8 py-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 text-slate-200 font-semibold transition text-base"
          >
            <span>Enter Room Code</span>
          </Link>
        </div>

        {/* Interface Highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 hover:border-purple-500/40 transition">
            <ShieldCheck className="w-8 h-8 text-purple-400 mb-3" />
            <h3 className="font-semibold text-lg text-white">Control Room</h3>
            <p className="text-slate-400 text-sm mt-2">
              Multi-controller room management, slide navigation, stage timers, and device approvals.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 hover:border-indigo-500/40 transition">
            <Tv className="w-8 h-8 text-indigo-400 mb-3" />
            <h3 className="font-semibold text-lg text-white">Audience Display</h3>
            <p className="text-slate-400 text-sm mt-2">
              Clean fullscreen material rendering with zero chrome and immediate remote updates.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800/80 hover:border-blue-500/40 transition">
            <Monitor className="w-8 h-8 text-blue-400 mb-3" />
            <h3 className="font-semibold text-lg text-white">Confidence Display</h3>
            <p className="text-slate-400 text-sm mt-2">
              Speaker output featuring slide previews, stage countdown timer, and live show caller briefs.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 py-6 text-center text-slate-500 text-xs z-10">
        StagePilot Architecture Foundation — Phase 0
      </footer>
    </div>
  );
}
