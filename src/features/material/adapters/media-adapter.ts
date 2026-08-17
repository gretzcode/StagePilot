/**
 * StagePilot Media Presentation Adapter
 * Authoritative interface and concrete adapters for video presentation renderers.
 * The external player is treated purely as a renderer target, while StagePilot
 * owns presentation state and commands.
 */

export interface VideoPlayerCallbacks {
  onReady?: () => void;
  onDuration?: (duration: number) => void;
  onStateChange?: (state: "playing" | "paused" | "ended") => void;
  onTimeUpdate?: (currentTime: number) => void;
  onError?: (error: string) => void;
  onEnded?: () => void;
}

export interface IVideoPresentationAdapter {
  play(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

/**
 * Extracts YouTube Video ID from any standard or embed URL.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const trimmed = url.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      return parsed.pathname.slice(1).split("?")[0] || null;
    }
    if (parsed.pathname.includes("/embed/")) {
      return parsed.pathname.split("/embed/")[1].split("?")[0] || null;
    }
    return parsed.searchParams.get("v") || null;
  } catch {
    return null;
  }
}

/**
 * Builds a strictly controlled YouTube embed URL with native controls disabled.
 */
export function buildControlledYouTubeEmbedUrl(url: string, origin?: string, isMuted = true): string {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return url;

  const params = new URLSearchParams({
    enablejsapi: "1",
    controls: "0", // Suppress native YouTube controls completely
    disablekb: "1", // Disable keyboard interaction in iframe
    fs: "0", // Disable native fullscreen button
    iv_load_policy: "3", // Suppress video annotations
    rel: "0", // Suppress unrelated videos
    autoplay: "1",
    mute: isMuted ? "1" : "0",
    playsinline: "1",
    modestbranding: "1",
  });

  if (origin && typeof origin === "string") {
    params.set("origin", origin);
    params.set("widget_referrer", origin);
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/**
 * YouTube IFrame Player Adapter via JS PostMessage API.
 */
export class YouTubeVideoAdapter implements IVideoPresentationAdapter {
  private iframe: HTMLIFrameElement;
  private callbacks: VideoPlayerCallbacks;
  private messageHandler: (event: MessageEvent) => void;
  private isDestroyed = false;

  constructor(iframe: HTMLIFrameElement, callbacks: VideoPlayerCallbacks = {}) {
    this.iframe = iframe;
    this.callbacks = callbacks;

    this.messageHandler = (event: MessageEvent) => {
      if (this.isDestroyed) return;
      // Ensure the message originated from this iframe's contentWindow (when source is present)
      if (this.iframe.contentWindow && event.source && event.source !== this.iframe.contentWindow) {
        return;
      }

      try {
        const rawData = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!rawData || typeof rawData !== "object") return;

        const { event: evtType, info } = rawData as {
          event?: string;
          info?: {
            duration?: number;
            currentTime?: number;
            playerState?: number;
          } | number;
        };

        // 1. Initial onReady event
        if (evtType === "onReady") {
          this.callbacks.onReady?.();
          // Request initial duration from player
          this.postCommand("getDuration");
        }

        // 2. Info delivery telemetry (duration, currentTime, state)
        if (evtType === "infoDelivery" && info && typeof info === "object") {
          if (typeof info.duration === "number" && info.duration > 0) {
            this.callbacks.onDuration?.(info.duration);
          }
          if (typeof info.currentTime === "number") {
            this.callbacks.onTimeUpdate?.(info.currentTime);
          }
          if (typeof info.playerState === "number") {
            this.handlePlayerState(info.playerState);
          }
        }

        // 3. State change event
        if (evtType === "onStateChange" && typeof info === "number") {
          this.handlePlayerState(info);
        }

        // 4. Error event
        if (evtType === "onError") {
          this.callbacks.onError?.(`YouTube player error code: ${JSON.stringify(info)}`);
        }
      } catch {
        // Non-JSON or third-party message ignored
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("message", this.messageHandler);
    }
  }

  private handlePlayerState(stateCode: number): void {
    // YT.PlayerState: -1 (UNSTARTED), 0 (ENDED), 1 (PLAYING), 2 (PAUSED), 3 (BUFFERING), 5 (CUED)
    if (stateCode === 1) {
      this.callbacks.onStateChange?.("playing");
    } else if (stateCode === 2) {
      this.callbacks.onStateChange?.("paused");
    } else if (stateCode === 0) {
      this.callbacks.onStateChange?.("ended");
      this.callbacks.onEnded?.();
    }
  }

  private postCommand(func: string, args: unknown = ""): void {
    if (this.isDestroyed) return;
    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow) return;

    targetWindow.postMessage(
      JSON.stringify({
        event: "command",
        func,
        args,
      }),
      "*"
    );
  }

  initHandshake(): void {
    const targetWindow = this.iframe.contentWindow;
    if (!targetWindow) return;
    targetWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
  }

  play(): void {
    this.postCommand("playVideo");
  }

  pause(): void {
    this.postCommand("pauseVideo");
  }

  seek(timeSeconds: number): void {
    this.postCommand("seekTo", [Math.max(0, timeSeconds), true]);
  }

  setMuted(muted: boolean): void {
    if (muted) {
      this.postCommand("mute");
    } else {
      this.postCommand("unMute");
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("message", this.messageHandler);
    }
  }
}

/**
 * HTML5 Native Video Element Adapter.
 */
export class Html5VideoAdapter implements IVideoPresentationAdapter {
  private video: HTMLVideoElement;
  private callbacks: VideoPlayerCallbacks;
  private isDestroyed = false;

  private onLoadedMetadata: () => void;
  private onTimeUpdate: () => void;
  private onEnded: () => void;
  private onError: () => void;

  constructor(video: HTMLVideoElement, callbacks: VideoPlayerCallbacks = {}) {
    this.video = video;
    this.callbacks = callbacks;

    this.onLoadedMetadata = () => {
      if (this.isDestroyed) return;
      if (this.video.duration && !isNaN(this.video.duration)) {
        this.callbacks.onDuration?.(this.video.duration);
      }
      this.callbacks.onReady?.();
    };

    this.onTimeUpdate = () => {
      if (this.isDestroyed) return;
      this.callbacks.onTimeUpdate?.(this.video.currentTime);
    };

    this.onEnded = () => {
      if (this.isDestroyed) return;
      this.callbacks.onStateChange?.("ended");
      this.callbacks.onEnded?.();
    };

    this.onError = () => {
      if (this.isDestroyed) return;
      this.callbacks.onError?.("HTML5 video error occurred");
    };

    this.video.addEventListener("loadedmetadata", this.onLoadedMetadata);
    this.video.addEventListener("timeupdate", this.onTimeUpdate);
    this.video.addEventListener("ended", this.onEnded);
    this.video.addEventListener("error", this.onError);
  }

  play(): void {
    if (this.isDestroyed) return;
    this.video.play().catch(() => {
      // Autoplay with audio may be blocked by browser policy; retry muted
      this.video.muted = true;
      this.video.play().catch(() => {});
    });
  }

  pause(): void {
    if (this.isDestroyed) return;
    this.video.pause();
  }

  seek(timeSeconds: number): void {
    if (this.isDestroyed) return;
    this.video.currentTime = Math.max(0, timeSeconds);
  }

  setMuted(muted: boolean): void {
    if (this.isDestroyed) return;
    this.video.muted = muted;
  }

  destroy(): void {
    this.isDestroyed = true;
    this.video.removeEventListener("loadedmetadata", this.onLoadedMetadata);
    this.video.removeEventListener("timeupdate", this.onTimeUpdate);
    this.video.removeEventListener("ended", this.onEnded);
    this.video.removeEventListener("error", this.onError);
  }
}
