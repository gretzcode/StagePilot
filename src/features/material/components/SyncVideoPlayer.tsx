"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MediaPlaybackState, PresentationZoomState } from "@/core/types";
import {
  IVideoPresentationAdapter,
  YouTubeVideoAdapter,
  Html5VideoAdapter,
  buildControlledYouTubeEmbedUrl,
} from "../adapters/media-adapter";
import { useAspectFit } from "../hooks/useAspectFit";
import { Play, Pause } from "lucide-react";

interface SyncVideoPlayerProps {
  url: string;
  role?: "control" | "audience" | "confidence";
  mediaState?: MediaPlaybackState;
  zoom?: PresentationZoomState;
  onMediaPlay?: (currentTime?: number) => void;
  onMediaPause?: (currentTime?: number) => void;
  onMediaSeek?: (targetTime: number) => void;
  onMediaStop?: () => void;
  onDurationDiscovered?: (duration: number) => void;
}

export function SyncVideoPlayer({
  url,
  role = "audience",
  mediaState,
  zoom,
  onMediaPlay,
  onMediaPause,
  onDurationDiscovered,
}: SyncVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const adapterRef = useRef<IVideoPresentationAdapter | null>(null);

  // Dynamic aspect ratio calculation
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number }>({
    width: 1920,
    height: 1080,
  });

  const fit = useAspectFit(videoDimensions.width, videoDimensions.height);

  // Audio Routing: ONLY the audience display outputs audio. Host/Control and Confidence displays are always muted.
  const shouldUnmute = role === "audience";
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Track initialization and sequence updates
  const isInitializedRef = useRef(false);
  const lastStatusRef = useRef<string | undefined>(undefined);
  const lastSeekSeqRef = useRef<number | undefined>(undefined);
  const hasTriedUnmuteRef = useRef(false);

  // Reset player initialization flags when video URL changes (e.g. playlist slide switch)
  useEffect(() => {
    isInitializedRef.current = false;
    hasTriedUnmuteRef.current = false;
    lastStatusRef.current = undefined;
    lastSeekSeqRef.current = undefined;
    setPlayerError(null);
  }, [url]);

  const isYouTube =
    url.includes("youtube.com") ||
    url.includes("youtube-nocookie.com") ||
    url.includes("youtu.be");

  const isVimeo = url.includes("vimeo.com");
  const isEmbedVideo = isYouTube || isVimeo;

  // Generate controlled embed URL — always start MUTED for browser autoplay policy compliance.
  // Audience devices will be unmuted programmatically after playback starts.
  const embedUrl = useMemo(() => {
    if (!isEmbedVideo) return url;
    if (isYouTube) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      return buildControlledYouTubeEmbedUrl(url, origin, true); // always muted for autoplay
    }
    if (isVimeo) {
      try {
        const parsed = new URL(url);
        parsed.searchParams.set("api", "1");
        parsed.searchParams.set("autoplay", "1");
        parsed.searchParams.set("controls", "0");
        parsed.searchParams.set("muted", "1"); // always muted for autoplay
        return parsed.toString();
      } catch {
        return url;
      }
    }
    return url;
  }, [url, isEmbedVideo, isYouTube, isVimeo]);

  // Initialize Media Adapter for YouTube Iframe
  const handleIframeLoad = () => {
    if (!iframeRef.current || !isYouTube) return;

    if (adapterRef.current) {
      adapterRef.current.destroy();
    }

    const adapter = new YouTubeVideoAdapter(iframeRef.current, {
      onReady: () => {
        setPlayerError(null);
        // Always start muted for autoplay
        adapter.setMuted(true);
      },
      onDuration: (duration) => {
        if (duration > 0 && role === "control") {
          onDurationDiscovered?.(duration);
        }
      },
      onStateChange: (state) => {
        // Auto-unmute audience after playback starts (satisfies autoplay policy)
        if (state === "playing" && shouldUnmute && !hasTriedUnmuteRef.current) {
          hasTriedUnmuteRef.current = true;
          setTimeout(() => adapter.setMuted(false), 300);
        }
      },
      onEnded: () => {
        if (role === "control" && mediaState?.status === "playing") {
          onMediaPause?.(mediaState.duration || mediaState.currentTime);
        }
      },
      onError: (err) => {
        console.warn("[SyncVideoPlayer] YouTube error:", err);
        setPlayerError(err);
      },
    });

    adapter.initHandshake();
    adapter.setMuted(true); // always start muted
    adapterRef.current = adapter;

    // Synchronize initial state
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
        adapter.seek(startTime);
      }

      if (mediaState.status === "playing") {
        adapter.play();
      } else {
        adapter.pause();
      }
    }
  };

  // Initialize Media Adapter for Native HTML5 <video>
  const handleVideoLoadedMetadata = () => {
    if (!videoRef.current || isEmbedVideo) return;

    if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }

    if (adapterRef.current) {
      adapterRef.current.destroy();
    }

    const adapter = new Html5VideoAdapter(videoRef.current, {
      onReady: () => {
        setPlayerError(null);
        // Always start muted for autoplay
        adapter.setMuted(true);
      },
      onDuration: (duration) => {
        if (duration > 0 && role === "control") {
          onDurationDiscovered?.(duration);
        }
      },
      onStateChange: (state) => {
        // Auto-unmute audience after playback starts (satisfies autoplay policy)
        if (state === "playing" && shouldUnmute && !hasTriedUnmuteRef.current) {
          hasTriedUnmuteRef.current = true;
          setTimeout(() => adapter.setMuted(false), 300);
        }
      },
      onEnded: () => {
        if (role === "control" && mediaState?.status === "playing") {
          onMediaPause?.(mediaState.duration || mediaState.currentTime);
        }
      },
      onError: (err) => {
        console.warn("[SyncVideoPlayer] HTML5 video error:", err);
        setPlayerError(err);
      },
    });

    adapter.setMuted(true); // always start muted
    adapterRef.current = adapter;

    // Synchronize initial state
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
        adapter.seek(startTime);
      }

      if (mediaState.status === "playing") {
        adapter.play();
      } else {
        adapter.pause();
      }
    }
  };

  // Synchronize to Authoritative StageRoom mediaState
  useEffect(() => {
    if (!mediaState || !adapterRef.current) return;

    const currentStatus = mediaState.status;
    const currentSeekSeq = mediaState.seekSequence;

    // 1. Explicit Seek Synchronization
    const hasNewSeek = currentSeekSeq !== undefined && currentSeekSeq !== lastSeekSeqRef.current;
    if (hasNewSeek) {
      lastSeekSeqRef.current = currentSeekSeq;
      adapterRef.current.seek(mediaState.currentTime);
    }

    // 2. Play / Pause Transition Synchronization
    const hasStatusChanged = currentStatus !== lastStatusRef.current;
    if (hasStatusChanged) {
      lastStatusRef.current = currentStatus;
      if (currentStatus === "playing") {
        adapterRef.current.play();
      } else if (currentStatus === "paused" || currentStatus === "stopped") {
        adapterRef.current.pause();
      }
    }
  }, [mediaState]);

  // Clean up adapter on unmount
  useEffect(() => {
    return () => {
      if (adapterRef.current) {
        adapterRef.current.destroy();
        adapterRef.current = null;
      }
    };
  }, []);

  const isPlaying = mediaState?.status === "playing";

  return (
    <div
      ref={fit.containerRef}
      className="w-full h-full bg-slate-950 flex items-center justify-center p-0 relative overflow-hidden select-none"
    >
      {/* Aspect-Ratio Stage Box: fits container constraint without distortion */}
      <div
        style={fit.style}
        className="relative flex items-center justify-center overflow-hidden shrink-0 shadow-2xl transition-[width,height] duration-75"
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            transform: `scale(${zoom?.scale || 1.0}) translate(${zoom?.panX || 0}%, ${zoom?.panY || 0}%)`,
            transformOrigin: "center center",
            transition: "transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
            willChange: "transform",
          }}
          className="w-full h-full relative flex items-center justify-center"
        >
          {/* Video Output Target */}
          {isEmbedVideo ? (
            <div className="w-full h-full relative flex items-center justify-center">
              <iframe
                key={embedUrl}
                ref={iframeRef}
                src={embedUrl}
                onLoad={handleIframeLoad}
                className="w-full h-full border-0 pointer-events-none select-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <video
              key={url}
              ref={videoRef}
              src={url}
              className="w-full h-full object-contain pointer-events-none select-none"
              playsInline
              muted
              onLoadedMetadata={handleVideoLoadedMetadata}
            />
          )}
        </div>

        {/* Control Room Overlay: Click to Play/Pause & Status Feedback */}
        {role === "control" && (
          <div
            onClick={() => {
              if (isPlaying) {
                onMediaPause?.(mediaState?.currentTime);
              } else {
                onMediaPlay?.(mediaState?.currentTime);
              }
            }}
            className="absolute inset-0 z-20 cursor-pointer flex items-center justify-center group bg-transparent hover:bg-black/10 transition-colors"
            title={isPlaying ? "Click to Pause" : "Click to Play"}
          >
            {/* Subtle Play/Pause watermark overlay visible on hover */}
            <div className="w-16 h-16 rounded-full bg-slate-900/80 border border-slate-700/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-90 transition-opacity shadow-2xl backdrop-blur-sm">
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 fill-white ml-0.5" />}
            </div>
          </div>
        )}
      </div>

      {/* Error State Banner if Video Fails to Load */}
      {playerError && (
        <div className="absolute top-3 left-3 right-3 bg-rose-950/90 border border-rose-800 text-rose-200 text-xs px-3 py-2 rounded-xl z-30 flex items-center justify-between shadow-xl">
          <span>{playerError}</span>
          <button
            onClick={() => setPlayerError(null)}
            className="text-rose-400 hover:text-white font-bold ml-2 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
