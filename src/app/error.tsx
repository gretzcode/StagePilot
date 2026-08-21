"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[StagePilot Presentation Error Caught]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center font-sans select-none">
      <div className="w-14 h-14 rounded-3xl bg-purple-950/80 border border-purple-800/60 flex items-center justify-center mb-4 shadow-xl">
        <span className="text-purple-400 font-black text-sm">SP</span>
      </div>
      <h2 className="text-base font-bold text-white mb-1">Stage Control hit a render error</h2>
      <p className="text-xs text-slate-400 mb-2 max-w-sm">
        {error?.message || "The session can recover without leaving the live presentation page."}
      </p>
      {error?.digest && (
        <p className="text-[10px] font-mono text-slate-600 mb-5">Digest: {error.digest}</p>
      )}
      <button
        onClick={() => reset()}
        className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-bold text-xs transition shadow-lg glow-purple cursor-pointer"
      >
        Reload Session
      </button>
    </div>
  );
}
