"use client";

import { useEffect } from "react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Do not redirect the user away from a live presentation because of a
    // transient iframe or embed error. Keep them on the current page and let the
    // local retry/reset flow recover instead.
  }, []);

  return (
    <html>
      <body className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center font-sans">
        <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center mb-4 animate-pulse">
          <span className="text-purple-400 font-black text-sm">SP</span>
        </div>
        <h2 className="text-sm font-bold text-slate-200 mb-1">Stage Control hit a render error</h2>
        <p className="text-xs text-slate-500 mb-4 max-w-xs">The session can recover without leaving the live presentation page.</p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow glow-purple"
        >
          Reload Session
        </button>
      </body>
    </html>
  );
}
