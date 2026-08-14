"use client";

import { useEffect } from "react";

export default function PresentationError({ reset }: { reset: () => void }) {
  useEffect(() => {
    // Never auto-redirect from the presentation page. If the Canva embed or a
    // presentation render throws, keep the user on this page so the actual error
    // can be surfaced and recovered without bouncing them back to the room list.
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center font-sans">
      <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center mb-3 animate-pulse">
        <span className="text-purple-400 font-black text-xs">SP</span>
      </div>
      <p className="text-sm font-bold text-slate-200 mb-2">Presentation failed to load</p>
      <p className="text-xs text-slate-400 max-w-md mb-4">
        There was an error while rendering this presentation. You can retry without leaving the live control page.
      </p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow glow-purple"
      >
        Retry Presentation
      </button>
    </div>
  );
}
