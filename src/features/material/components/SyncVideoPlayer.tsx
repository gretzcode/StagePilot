"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { MediaPlaybackState } from "@/core/types";

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
}: SyncVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [isMuted, setIsMuted] = useState(role !== "control");

  // Track the exact handled states to never re-trigger commands during continuous playback
  const isInitializedRef = useRef(false);
  const lastStatusRef = useRef<string | undefined>(undefined);
  const lastSeekSeqRef = useRef<number | undefined>(undefined);

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

  // Synchronize to authoritative mediaState across all screens
  useEffect(() => {
    if (!mediaState) return;

    const currentStatus = mediaState.status;
    const currentSeekSeq = mediaState.seekSequence;

    // 1. Handle explicit seek commands ONLY
    const hasNewSeek = currentSeekSeq !== undefined && currentSeekSeq !== lastSeekSeqRef.current;
    if (hasNewSeek) {
      lastSeekSeqRef.current = currentSeekSeq;

      if (!isEmbedVideo && videoRef.current) {
        videoRef.current.currentTime = mediaState.currentTime;
      } else if (isEmbedVideo) {
        postIframeCommand("seek", mediaState.currentTime);
      }
    }

    // 2. Handle Play / Pause transitions ONLY when status changes
    const hasStatusChanged = currentStatus !== lastStatusRef.current;
    if (hasStatusChanged) {
      lastStatusRef.current = currentStatus;

      if (!isEmbedVideo && videoRef.current) {
        if (currentStatus === "playing") {
          videoRef.current.play().catch(() => {
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play().catch(() => {});
            }
          });
        } else if (currentStatus === "paused" || currentStatus === "stopped") {
          videoRef.current.pause();
        }
      } else if (isEmbedVideo) {
        if (currentStatus === "playing") {
          postIframeCommand("play");
        } else if (currentStatus === "paused" || currentStatus === "stopped") {
          postIframeCommand("pause");
        }
      }
    }
  }, [mediaState, isEmbedVideo, postIframeCommand]);

  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center relative overflow-hidden select-none">
      {isEmbedVideo ? (
        <iframe
          key={embedUrl}
          ref={iframeRef}
          src={embedUrl}
          onLoad={() => {
            const iframeWindow = iframeRef.current?.contentWindow;
            if (iframeWindow && isYouTube) {
              iframeWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
            }

            // On initial load only: sync current playback position if joining late
            if (!isInitializedRef.current && mediaState) {
              isInitializedRef.current = true;
              lastStatusRef.current = mediaState.status;
              lastSeekSeqRef.current = mediaState.seekSequence;

              const elapsed = (Date.now() - mediaState.updatedAt) / 1000;
              const startTime =
                mediaState.status === "playing"
                  ? mediaState.currentTime + Math.max(0, elapsed) * (mediaState.playbackRate || 1.0)
                  : mediaState.currentTime;

              if (startTime > 1.5) {
                postIframeCommand("seek", startTime);
              }

              if (mediaState.status === "playing") {
                postIframeCommand("play");
              } else if (mediaState.status === "paused" || mediaState.status === "stopped") {
                postIframeCommand("pause");
              }
            }
          }}
          className="w-full h-full border-0 pointer-events-auto"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <video
          key={url}
          ref={videoRef}
          src={url}
          className="max-w-full max-h-full object-contain pointer-events-auto"
          playsInline
          muted={isMuted}
          onLoadedMetadata={() => {
            if (!isInitializedRef.current && mediaState && videoRef.current) {
              isInitializedRef.current = true;
              lastStatusRef.current = mediaState.status;
              lastSeekSeqRef.current = mediaState.seekSequence;

              const elapsed = (Date.now() - mediaState.updatedAt) / 1000;
              const startTime =
                mediaState.status === "playing"
                  ? mediaState.currentTime + Math.max(0, elapsed) * (mediaState.playbackRate || 1.0)
                  : mediaState.currentTime;

              if (startTime > 1.5) {
                videoRef.current.currentTime = startTime;
              }

              if (mediaState.status === "playing") {
                videoRef.current.play().catch(() => {
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    setIsMuted(true);
                    videoRef.current.play().catch(() => {});
                  }
                });
              }
            }
          }}
        />
      )}
    </div>
  );
}
