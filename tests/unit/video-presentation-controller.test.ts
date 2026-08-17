import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { StageCommand } from "@/core/types/commands";
import { PermissionPolicy } from "@/core/permissions/policy";
import {
  extractYouTubeVideoId,
  buildControlledYouTubeEmbedUrl,
  YouTubeVideoAdapter,
  Html5VideoAdapter,
} from "@/features/material/adapters/media-adapter";

describe("Video Presentation Architecture & Single Controller (Phase 1-20)", () => {
  const roomId = "room-vid-test";
  const hostUserId = "user-host-1";
  const hostDeviceId = "dev-host-1";
  const controlDeviceId = "dev-control-1";

  type EventCallback = (event: { type: string; data?: string; source?: unknown }) => void;
  const eventListeners: Record<string, EventCallback[]> = {};

  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      location: { origin: "https://stagepilot.live" },
      addEventListener: (type: string, listener: EventCallback) => {
        eventListeners[type] = eventListeners[type] || [];
        eventListeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: EventCallback) => {
        if (eventListeners[type]) {
          eventListeners[type] = eventListeners[type].filter((l) => l !== listener);
        }
      },
      dispatchEvent: (event: { type: string; data?: string; source?: unknown }) => {
        const list = eventListeners[event.type] || [];
        for (const fn of list) fn(event);
        return true;
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  describe("Authoritative Media State Reducer", () => {
    it("1. VIDEO_PLAY changes authoritative state to playing", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);

      const playCmd: StageCommand = {
        type: "MEDIA_PLAY",
        commandId: "cmd-play-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { currentTime: 10.5 },
      };

      state = stageSessionReducer(state, playCmd);
      expect(state.presentation.mediaState).toBeDefined();
      expect(state.presentation.mediaState?.status).toBe("playing");
      expect(state.presentation.mediaState?.currentTime).toBe(10.5);
      expect(state.presentation.revision).toBe(2);
    });

    it("2. VIDEO_PAUSE changes authoritative state to paused", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);

      const playCmd: StageCommand = {
        type: "MEDIA_PLAY",
        commandId: "cmd-play-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { currentTime: 10.5 },
      };
      state = stageSessionReducer(state, playCmd);

      const pauseCmd: StageCommand = {
        type: "MEDIA_PAUSE",
        commandId: "cmd-pause-1",
        senderDeviceId: hostDeviceId,
        timestamp: 2000,
        payload: { currentTime: 20.0 },
      };
      state = stageSessionReducer(state, pauseCmd);

      expect(state.presentation.mediaState?.status).toBe("paused");
      expect(state.presentation.mediaState?.currentTime).toBe(20.0);
      expect(state.presentation.revision).toBe(3);
    });

    it("3. VIDEO_SEEK changes currentTime and increments seekSequence", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);

      const seekCmd1: StageCommand = {
        type: "MEDIA_SEEK",
        commandId: "cmd-seek-1",
        senderDeviceId: hostDeviceId,
        timestamp: 3000,
        payload: { targetTime: 75.0 },
      };
      state = stageSessionReducer(state, seekCmd1);
      expect(state.presentation.mediaState?.currentTime).toBe(75.0);
      expect(state.presentation.mediaState?.seekSequence).toBe(1);

      const seekCmd2: StageCommand = {
        type: "MEDIA_SEEK",
        commandId: "cmd-seek-2",
        senderDeviceId: hostDeviceId,
        timestamp: 4000,
        payload: { targetTime: 150.0 },
      };
      state = stageSessionReducer(state, seekCmd2);
      expect(state.presentation.mediaState?.currentTime).toBe(150.0);
      expect(state.presentation.mediaState?.seekSequence).toBe(2);
    });

    it("4. VIDEO_STOP sets status to stopped and resets currentTime to 0", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);

      state = stageSessionReducer(state, {
        type: "MEDIA_PLAY",
        commandId: "cmd-play-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { currentTime: 45.0 },
      });

      const stopCmd: StageCommand = {
        type: "MEDIA_STOP",
        commandId: "cmd-stop-1",
        senderDeviceId: hostDeviceId,
        timestamp: 5000,
        payload: {},
      };
      state = stageSessionReducer(state, stopCmd);

      expect(state.presentation.mediaState?.status).toBe("stopped");
      expect(state.presentation.mediaState?.currentTime).toBe(0);
      expect(state.presentation.mediaState?.seekSequence).toBe(1);
    });

    it("5. MEDIA_DURATION_UPDATE preserves duration across subsequent play and pause commands", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);

      const durationCmd: StageCommand = {
        type: "MEDIA_DURATION_UPDATE",
        commandId: "cmd-dur-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { duration: 320.5 },
      };
      state = stageSessionReducer(state, durationCmd);
      expect(state.presentation.mediaState?.duration).toBe(320.5);

      // Play preserves duration
      state = stageSessionReducer(state, {
        type: "MEDIA_PLAY",
        commandId: "cmd-play-1",
        senderDeviceId: hostDeviceId,
        timestamp: 2000,
        payload: { currentTime: 10.0 },
      });
      expect(state.presentation.mediaState?.duration).toBe(320.5);

      // Pause preserves duration
      state = stageSessionReducer(state, {
        type: "MEDIA_PAUSE",
        commandId: "cmd-pause-1",
        senderDeviceId: hostDeviceId,
        timestamp: 3000,
        payload: { currentTime: 25.0 },
      });
      expect(state.presentation.mediaState?.duration).toBe(320.5);
    });
  });

  describe("Permission Policy for Media Commands", () => {
    it("6. Control role is authorized to dispatch all media playback commands", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);
      // Register control device
      state.devices[controlDeviceId] = {
        id: controlDeviceId,
        name: "Stage Controller",
        userAgent: "Browser",
        role: "control",
        approvalStatus: "approved",
        status: "online",
        permissions: {
          canControlPresentation: true,
          canControlTimer: true,
          canControlBrief: true,
          canBlankDisplay: true,
          canManageDevices: false,
          canManageRoom: false,
          canTakeoverControl: true,
        },
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        isHostDevice: false,
      };

      const mediaCommands: StageCommand[] = [
        { type: "MEDIA_PLAY", commandId: "c1", senderDeviceId: controlDeviceId, timestamp: 1, payload: { currentTime: 0 } },
        { type: "MEDIA_PAUSE", commandId: "c2", senderDeviceId: controlDeviceId, timestamp: 2, payload: { currentTime: 0 } },
        { type: "MEDIA_SEEK", commandId: "c3", senderDeviceId: controlDeviceId, timestamp: 3, payload: { targetTime: 10 } },
        { type: "MEDIA_STOP", commandId: "c4", senderDeviceId: controlDeviceId, timestamp: 4, payload: {} },
        { type: "MEDIA_DURATION_UPDATE", commandId: "c5", senderDeviceId: controlDeviceId, timestamp: 5, payload: { duration: 120 } },
      ];

      for (const cmd of mediaCommands) {
        const result = PermissionPolicy.canExecuteCommand(state, controlDeviceId, cmd);
        expect(result.allowed).toBe(true);
      }
    });

    it("7. Audience role cannot dispatch media commands (strictly read-only)", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);
      const audienceDeviceId = "dev-aud-1";
      state.devices[audienceDeviceId] = {
        id: audienceDeviceId,
        name: "Audience Screen",
        userAgent: "Browser",
        role: "audience",
        approvalStatus: "approved",
        status: "online",
        permissions: {
          canControlPresentation: false,
          canControlTimer: false,
          canControlBrief: false,
          canBlankDisplay: false,
          canManageDevices: false,
          canManageRoom: false,
          canTakeoverControl: false,
        },
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        isHostDevice: false,
      };

      const playCmd: StageCommand = {
        type: "MEDIA_PLAY",
        commandId: "c-aud-1",
        senderDeviceId: audienceDeviceId,
        timestamp: 1,
        payload: { currentTime: 0 },
      };

      const result = PermissionPolicy.canExecuteCommand(state, audienceDeviceId, playCmd);
      expect(result.allowed).toBe(false);
    });
  });

  describe("YouTube Video Adapter & Embed URL Normalization", () => {
    it("8. extractYouTubeVideoId parses standard, short, and embed YouTube URLs", () => {
      expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://invalid.com/file.pdf")).toBe(null);
    });

    it("9. buildControlledYouTubeEmbedUrl enforces controls=0 and JS API parameters", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const controlledUrl = buildControlledYouTubeEmbedUrl(url, "https://stagepilot.live");

      expect(controlledUrl).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
      expect(controlledUrl).toContain("enablejsapi=1");
      expect(controlledUrl).toContain("controls=0");
      expect(controlledUrl).toContain("disablekb=1");
      expect(controlledUrl).toContain("fs=0");
      expect(controlledUrl).toContain("iv_load_policy=3");
      expect(controlledUrl).toContain("rel=0");
      expect(controlledUrl).toContain("origin=https%3A%2F%2Fstagepilot.live");
    });

    it("10. YouTubeVideoAdapter dispatches postMessage commands to iframe target", () => {
      const postMessageMock = vi.fn();
      const mockIframe = {
        contentWindow: {
          postMessage: postMessageMock,
        },
      } as unknown as HTMLIFrameElement;

      const adapter = new YouTubeVideoAdapter(mockIframe);

      // Play
      adapter.play();
      expect(postMessageMock).toHaveBeenCalledWith(
        JSON.stringify({ event: "command", func: "playVideo", args: "" }),
        "*"
      );

      // Pause
      adapter.pause();
      expect(postMessageMock).toHaveBeenCalledWith(
        JSON.stringify({ event: "command", func: "pauseVideo", args: "" }),
        "*"
      );

      // Seek
      adapter.seek(42.5);
      expect(postMessageMock).toHaveBeenCalledWith(
        JSON.stringify({ event: "command", func: "seekTo", args: [42.5, true] }),
        "*"
      );

      // Mute / Unmute
      adapter.setMuted(true);
      expect(postMessageMock).toHaveBeenCalledWith(
        JSON.stringify({ event: "command", func: "mute", args: "" }),
        "*"
      );

      adapter.destroy();
    });

    it("11. YouTubeVideoAdapter handles infoDelivery telemetry without creating command feedback loops", () => {
      const postMessageMock = vi.fn();
      const mockIframe = {
        contentWindow: {
          postMessage: postMessageMock,
        },
      } as unknown as HTMLIFrameElement;

      const durationCallback = vi.fn();
      const timeCallback = vi.fn();
      const stateCallback = vi.fn();
      const endCallback = vi.fn();

      const adapter = new YouTubeVideoAdapter(mockIframe, {
        onDuration: durationCallback,
        onTimeUpdate: timeCallback,
        onStateChange: stateCallback,
        onEnded: endCallback,
      });

      const win = (globalThis as unknown as { window: { dispatchEvent: (e: unknown) => void } }).window;

      // Simulate incoming window message from YouTube iframe
      win.dispatchEvent({
        type: "message",
        data: JSON.stringify({
          event: "infoDelivery",
          info: {
            duration: 180,
            currentTime: 45.2,
            playerState: 1, // Playing
          },
        }),
      });

      expect(durationCallback).toHaveBeenCalledWith(180);
      expect(timeCallback).toHaveBeenCalledWith(45.2);
      expect(stateCallback).toHaveBeenCalledWith("playing");

      // Verify no feedback command was sent back
      expect(postMessageMock).not.toHaveBeenCalled();

      // Test natural end event
      win.dispatchEvent({
        type: "message",
        data: JSON.stringify({
          event: "onStateChange",
          info: 0, // Ended
        }),
      });
      expect(stateCallback).toHaveBeenCalledWith("ended");
      expect(endCallback).toHaveBeenCalled();

      adapter.destroy();
    });
  });

  describe("HTML5 Native Video Adapter", () => {
    it("12. Html5VideoAdapter controls HTMLVideoElement and dispatches events", () => {
      const playMock = vi.fn().mockResolvedValue(undefined);
      const pauseMock = vi.fn();
      const listeners: Record<string, () => void> = {};

      const mockVideo = {
        play: playMock,
        pause: pauseMock,
        currentTime: 0,
        duration: 240,
        muted: false,
        addEventListener: vi.fn((event, handler) => {
          listeners[event] = handler;
        }),
        removeEventListener: vi.fn((event) => {
          delete listeners[event];
        }),
      } as unknown as HTMLVideoElement;

      const durationCb = vi.fn();
      const adapter = new Html5VideoAdapter(mockVideo, {
        onDuration: durationCb,
      });

      // Play & Pause
      adapter.play();
      expect(playMock).toHaveBeenCalled();

      adapter.pause();
      expect(pauseMock).toHaveBeenCalled();

      // Seek
      adapter.seek(88);
      expect(mockVideo.currentTime).toBe(88);

      // Metadata loaded event
      if (listeners["loadedmetadata"]) {
        listeners["loadedmetadata"]();
        expect(durationCb).toHaveBeenCalledWith(240);
      }

      adapter.destroy();
      expect(mockVideo.removeEventListener).toHaveBeenCalledWith("loadedmetadata", expect.any(Function));
    });
  });

  describe("Independence & Stability (Phase 16 & 20)", () => {
    it("13. Stage Timer remains independent when media commands are executed", () => {
      let state = createInitialSessionState(roomId, roomId, "Video Test", hostUserId, hostDeviceId);

      // Start stage timer
      state = stageSessionReducer(state, {
        type: "TIMER_SET",
        commandId: "t-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { duration: 600 },
      });
      state = stageSessionReducer(state, {
        type: "TIMER_START",
        commandId: "t-2",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: {},
      });

      expect(state.timer.status).toBe("running");
      expect(state.timer.duration).toBe(600);

      // Play video
      state = stageSessionReducer(state, {
        type: "MEDIA_PLAY",
        commandId: "m-1",
        senderDeviceId: hostDeviceId,
        timestamp: 2000,
        payload: { currentTime: 30 },
      });

      // Timer is STILL running and unchanged
      expect(state.timer.status).toBe("running");
      expect(state.timer.duration).toBe(600);
      expect(state.presentation.mediaState?.status).toBe("playing");

      // Pause video
      state = stageSessionReducer(state, {
        type: "MEDIA_PAUSE",
        commandId: "m-2",
        senderDeviceId: hostDeviceId,
        timestamp: 3000,
        payload: { currentTime: 60 },
      });

      expect(state.timer.status).toBe("running");
      expect(state.presentation.mediaState?.status).toBe("paused");
    });

    it("14. Slide presentation and navigation remain stable alongside media state", () => {
      let state = createInitialSessionState(roomId, roomId, "Deck Test", hostUserId, hostDeviceId);
      state.materials = [
        {
          id: "mat-deck-1",
          name: "Company Deck",
          type: "pdf",
          url: "https://stagepilot.live/deck.pdf",
          totalPages: 5,
          slides: [
            { index: 1, title: "Intro" },
            { index: 2, title: "Product" },
            { index: 3, title: "Traction" },
            { index: 4, title: "Financials" },
            { index: 5, title: "Closing" },
          ],
          uploadedAt: Date.now(),
          status: "ready",
        },
      ];

      // Start presenting slide 1
      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "p-start",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { materialId: "mat-deck-1", startPage: 1 },
      });

      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.currentSlide).toBe(1);

      // Slide next
      state = stageSessionReducer(state, {
        type: "SLIDE_NEXT",
        commandId: "p-next",
        senderDeviceId: hostDeviceId,
        timestamp: 2000,
        payload: {},
      });

      expect(state.presentation.currentSlide).toBe(2);
      expect(state.presentation.currentSlideMetadata?.title).toBe("Product");
    });

    it("15. buildControlledYouTubeEmbedUrl configures mute=0 for audience and mute=1 for others", () => {
      const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const audienceUrl = buildControlledYouTubeEmbedUrl(url, "https://stagepilot.live", false);
      const controlUrl = buildControlledYouTubeEmbedUrl(url, "https://stagepilot.live", true);

      expect(audienceUrl).toContain("mute=0");
      expect(controlUrl).toContain("mute=1");
    });

    it("16. Media adapters support mute and unmute commands for role-based audio separation", () => {
      const postMessageMock = vi.fn();
      const mockIframe = {
        contentWindow: {
          postMessage: postMessageMock,
        },
      } as unknown as HTMLIFrameElement;

      const ytAdapter = new YouTubeVideoAdapter(mockIframe);
      ytAdapter.setMuted(false);
      expect(postMessageMock).toHaveBeenCalledWith(
        JSON.stringify({ event: "command", func: "unMute", args: "" }),
        "*"
      );

      ytAdapter.setMuted(true);
      expect(postMessageMock).toHaveBeenCalledWith(
        JSON.stringify({ event: "command", func: "mute", args: "" }),
        "*"
      );
      ytAdapter.destroy();
    });
  });
});
