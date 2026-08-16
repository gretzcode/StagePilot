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
  const lastHandledStateRef = useRef<{ status?: string; updatedAt?: number; currentTime?: number }>({});

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

    const isNewTimestamp = lastHandledStateRef.current.updatedAt !== mediaState.updatedAt;
    const isStatusChanged = lastHandledStateRef.current.status !== mediaState.status;

    // Direct HTML5 Video Sync
    if (!isEmbedVideo && videoRef.current) {
      const video = videoRef.current;
      const elapsedSinceUpdate = (Date.now() - mediaState.updatedAt) / 1000;
      const expectedTime =
        mediaState.status === "playing"
          ? mediaState.currentTime + Math.max(0, elapsedSinceUpdate) * (mediaState.playbackRate || 1.0)
          : mediaState.currentTime;

      if (isNewTimestamp || isStatusChanged || Math.abs(video.currentTime - expectedTime) > 1.0) {
        if (Math.abs(video.currentTime - expectedTime) > 0.5) {
          video.currentTime = Math.max(0, expectedTime);
        }

        if (mediaState.status === "playing") {
          video.play().catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
        } else if (mediaState.status === "paused" || mediaState.status === "stopped") {
          video.pause();
        }
      }
    }
    // Embedded Iframe (YouTube / Vimeo) Sync
    else if (isEmbedVideo) {
      // Only seek when an explicit command changed mediaState.updatedAt
      if (isNewTimestamp) {
        const elapsedSinceUpdate = (Date.now() - mediaState.updatedAt) / 1000;
        const expectedTime =
          mediaState.status === "playing"
            ? mediaState.currentTime + Math.max(0, elapsedSinceUpdate) * (mediaState.playbackRate || 1.0)
            : mediaState.currentTime;

        if (typeof mediaState.currentTime === "number") {
          postIframeCommand("seek", expectedTime);
        }
      }

      if (isStatusChanged || isNewTimestamp) {
        if (mediaState.status === "playing") {
          postIframeCommand("play");
        } else if (mediaState.status === "paused" || mediaState.status === "stopped") {
          postIframeCommand("pause");
        }
      }
    }

    lastHandledStateRef.current = {
      status: mediaState.status,
      updatedAt: mediaState.updatedAt,
      currentTime: mediaState.currentTime,
    };
  }, [mediaState, isEmbedVideo, postIframeCommand]);

  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center relative overflow-hidden select-none">
      {isEmbedVideo ? (
        <iframe
          ref={iframeRef}
          src={embedUrl}
          onLoad={() => {
            const iframeWindow = iframeRef.current?.contentWindow;
            if (iframeWindow && isYouTube) {
              iframeWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
            }
            if (mediaState) {
              const elapsedSinceUpdate = (Date.now() - mediaState.updatedAt) / 1000;
              const expectedTime =
                mediaState.status === "playing"
                  ? mediaState.currentTime + Math.max(0, elapsedSinceUpdate) * (mediaState.playbackRate || 1.0)
                  : mediaState.currentTime;

              if (typeof expectedTime === "number") {
                postIframeCommand("seek", expectedTime);
              }
              if (mediaState.status === "playing") {
                postIframeCommand("play");
              } else {
                postIframeCommand("pause");
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
        />
      )}
    </div>
  );
}
