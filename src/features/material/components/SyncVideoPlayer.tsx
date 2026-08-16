"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MediaPlaybackState } from "@/core/types";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

interface SyncVideoPlayerProps {
  url: string;
  role?: "control" | "audience" | "confidence";
  mediaState?: MediaPlaybackState;
  onMediaPlay?: (currentTime?: number) => void;
  onMediaPause?: (currentTime?: number) => void;
  onMediaSeek?: (targetTime: number) => void;
}

export function SyncVideoPlayer({
  url,
  role = "audience",
  mediaState,
  onMediaPlay,
  onMediaPause,
  onMediaSeek,
}: SyncVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(role !== "control");
  const [isIframeReady, setIsIframeReady] = useState(false);

  const isEmbedVideo =
    url.includes("youtube.com") ||
    url.includes("youtube-nocookie.com") ||
    url.includes("youtu.be") ||
    url.includes("vimeo.com");

  const isYouTube = url.includes("youtube.com") || url.includes("youtube-nocookie.com") || url.includes("youtu.be");
  const isVimeo = url.includes("vimeo.com");

  const embedUrl = useMemo(() => {
    if (!isEmbedVideo) return url;
    try {
      const parsed = new URL(url);
      if (isYouTube) {
        parsed.searchParams.set("enablejsapi", "1");
        parsed.searchParams.set("autoplay", "1");
        parsed.searchParams.set("mute", "1");
        parsed.searchParams.set("playsinline", "1");
        if (typeof window !== "undefined") {
          parsed.searchParams.set("origin", window.location.origin);
          parsed.searchParams.set("widget_referrer", window.location.origin);
        }
        return parsed.toString();
      }
      if (isVimeo) {
        parsed.searchParams.set("api", "1");
        parsed.searchParams.set("autoplay", "1");
        return parsed.toString();
      }
    } catch {
      return url;
    }
    return url;
  }, [url, isEmbedVideo, isYouTube, isVimeo]);

  // Post message to embedded iframe players (YouTube & Vimeo JS API)
  const postIframeCommand = useCallback(
    (command: "play" | "pause" | "seek" | "unMute" | "mute", value?: number) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow) return;

      if (isYouTube) {
        if (command === "play") {
          iframeWindow.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: "" }), "*");
        } else if (command === "pause") {
          iframeWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: "" }), "*");
        } else if (command === "seek" && typeof value === "number") {
          iframeWindow.postMessage(JSON.stringify({ event: "command", func: "seekTo", args: [value, true] }), "*");
        } else if (command === "unMute") {
          iframeWindow.postMessage(JSON.stringify({ event: "command", func: "unMute", args: "" }), "*");
        } else if (command === "mute") {
          iframeWindow.postMessage(JSON.stringify({ event: "command", func: "mute", args: "" }), "*");
        }
      } else if (isVimeo) {
        if (command === "play") {
          iframeWindow.postMessage(JSON.stringify({ method: "play" }), "*");
        } else if (command === "pause") {
          iframeWindow.postMessage(JSON.stringify({ method: "pause" }), "*");
        } else if (command === "seek" && typeof value === "number") {
          iframeWindow.postMessage(JSON.stringify({ method: "setCurrentTime", value }), "*");
        }
      }
    },
    [isYouTube, isVimeo]
  );

  // Audience & Confidence: Synchronize to authoritative mediaState from DO
  useEffect(() => {
    if (!mediaState) return;

    if (!isEmbedVideo && videoRef.current) {
      const video = videoRef.current;
      const elapsedSinceUpdate = (Date.now() - mediaState.updatedAt) / 1000;
      const expectedTime =
        mediaState.status === "playing"
          ? mediaState.currentTime + Math.max(0, elapsedSinceUpdate) * (mediaState.playbackRate || 1.0)
          : mediaState.currentTime;

      // Re-sync if time drifts more than 0.4 seconds
      if (Math.abs(video.currentTime - expectedTime) > 0.4) {
        video.currentTime = Math.max(0, expectedTime);
      }

      if (mediaState.status === "playing") {
        setIsPlaying(true);
        video.play().catch(() => {
          // Autoplay fallback: mute first then play
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => {});
        });
      } else if (mediaState.status === "paused" || mediaState.status === "stopped") {
        setIsPlaying(false);
        video.pause();
      }
    } else if (isEmbedVideo) {
      if (mediaState.status === "playing") {
        setIsPlaying(true);
        postIframeCommand("play");
      } else if (mediaState.status === "paused" || mediaState.status === "stopped") {
        setIsPlaying(false);
        postIframeCommand("pause");
      }

      if (typeof mediaState.currentTime === "number") {
        postIframeCommand("seek", mediaState.currentTime);
        setCurrentTime(mediaState.currentTime);
      }
    }
  }, [mediaState, isEmbedVideo, postIframeCommand]);

  // Handle Control Role user interactions
  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (!isEmbedVideo && videoRef.current) {
        videoRef.current.pause();
        onMediaPause?.(videoRef.current.currentTime);
      } else {
        postIframeCommand("pause");
        onMediaPause?.(currentTime);
      }
    } else {
      setIsPlaying(true);
      if (!isEmbedVideo && videoRef.current) {
        videoRef.current.play().catch(() => {});
        onMediaPlay?.(videoRef.current.currentTime);
      } else {
        postIframeCommand("play");
        onMediaPlay?.(currentTime);
      }
    }
  };

  const handleSeek = (targetSeconds: number) => {
    const clamped = Math.max(0, duration > 0 ? Math.min(targetSeconds, duration) : targetSeconds);
    setCurrentTime(clamped);

    if (!isEmbedVideo && videoRef.current) {
      videoRef.current.currentTime = clamped;
    } else {
      postIframeCommand("seek", clamped);
    }

    onMediaSeek?.(clamped);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden select-none group">
      {isEmbedVideo ? (
        <iframe
          ref={iframeRef}
          src={embedUrl}
          onLoad={() => {
            setIsIframeReady(true);
            const iframeWindow = iframeRef.current?.contentWindow;
            if (iframeWindow && isYouTube) {
              iframeWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
            }
            if (mediaState) {
              if (mediaState.status === "playing") {
                postIframeCommand("play");
              } else {
                postIframeCommand("pause");
              }
              if (typeof mediaState.currentTime === "number") {
                postIframeCommand("seek", mediaState.currentTime);
              }
            }
          }}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <video
          ref={videoRef}
          src={url}
          className="max-w-full max-h-full object-contain"
          playsInline
          muted={isMuted}
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current) {
              setDuration(videoRef.current.duration || 0);
            }
          }}
        />
      )}

      {/* Synchronized Control Toolbar Overlay (Always available for Control role) */}
      {role === "control" && (
        <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 transition-all duration-200 z-30">
          {/* Progress Seekbar */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[11px] font-mono text-slate-400 w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={(e) => {
                const target = parseFloat(e.target.value);
                handleSeek(target);
              }}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-400"
            />
            <span className="text-[11px] font-mono text-slate-400 w-12">
              {duration > 0 ? formatTime(duration) : "--:--"}
            </span>
          </div>

          {/* Player Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleSeek(currentTime - 10)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold cursor-pointer"
                title="Rewind 10s"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>-10s</span>
              </button>

              <button
                type="button"
                onClick={handleTogglePlay}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-900/40 transition glow-purple cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                <span>{isPlaying ? "PAUSE" : "PLAY"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSeek(currentTime + 10)}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs font-semibold cursor-pointer"
                title="Forward 10s"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>+10s</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const nextMute = !isMuted;
                  setIsMuted(nextMute);
                  if (videoRef.current) {
                    videoRef.current.muted = nextMute;
                  }
                  postIframeCommand(nextMute ? "mute" : "unMute");
                }}
                className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title={isMuted ? "Unmute Host Audio" : "Mute Host Audio"}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <span className="text-[10px] font-mono text-purple-400 bg-purple-950/60 border border-purple-800/50 px-2.5 py-1 rounded-full">
                SYNC ACTIVE
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
