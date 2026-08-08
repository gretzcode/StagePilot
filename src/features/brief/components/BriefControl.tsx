"use client";

import { useState } from "react";
import { BriefState, BriefUrgency } from "@/core/types";
import { MessageSquare, Send, AlertTriangle } from "lucide-react";

interface BriefControlProps {
  brief: BriefState;
  onSendBrief: (text: string, urgency: BriefUrgency) => void;
}

export function BriefControl({ brief, onSendBrief }: BriefControlProps) {
  const [text, setText] = useState("");
  const [urgency, setUrgency] = useState<BriefUrgency>("info");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendBrief(text.trim(), urgency);
    setText("");
  };

  return (
    <div className="glass-panel p-5 rounded-3xl border border-slate-800">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
        <h4 className="text-xs font-bold text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
          <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
          <span>Stage Brief / Speaker Note</span>
        </h4>
        <span className="text-[10px] text-slate-500 font-mono uppercase">CONFIDENCE ONLY</span>
      </div>

      {brief.activeMessage ? (
        <div className={`p-3 rounded-2xl border mb-3 ${
          brief.activeMessage.urgency === "urgent"
            ? "bg-rose-950/60 border-rose-800/80 text-rose-200"
            : brief.activeMessage.urgency === "warning"
            ? "bg-amber-950/60 border-amber-800/80 text-amber-200"
            : "bg-slate-900 border-slate-800 text-slate-200"
        }`}>
          <div className="flex items-center justify-between text-[10px] font-mono uppercase font-bold mb-1 opacity-75">
            <span className="flex items-center space-x-1">
              <AlertTriangle className="w-3 h-3" />
              <span>{brief.activeMessage.urgency}</span>
            </span>
            <span>{new Date(brief.activeMessage.createdAt).toLocaleTimeString()}</span>
          </div>
          <p className="text-xs font-medium">{brief.activeMessage.text}</p>
        </div>
      ) : (
        <div className="p-3 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-slate-500 text-xs mb-3">
          No active brief sent to confidence display.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send quick cue to speaker... (e.g. Wrap up in 2 mins, Q&A next)"
          rows={2}
          className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none"
        />

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {(["info", "warning", "urgent"] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setUrgency(level)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                  urgency === level
                    ? level === "urgent"
                      ? "bg-rose-600 text-white"
                      : level === "warning"
                      ? "bg-amber-600 text-white"
                      : "bg-purple-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!text.trim()}
            className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs flex items-center space-x-1.5 transition glow-purple"
          >
            <Send className="w-3 h-3" />
            <span>Send Cue</span>
          </button>
        </div>
      </form>
    </div>
  );
}
