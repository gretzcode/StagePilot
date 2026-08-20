import { describe, it, expect } from "vitest";
import { PermissionPolicy } from "@/core/permissions/policy";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { StageCommand } from "@/core/types";
import { getAvailableSources } from "@/features/source-manager/utils/available-sources";

describe("Source Manager & Take Live (Corrected Semantics)", () => {
  const roomId = "ROOM_SRC_01";
  const hostUserId = "host-user-src";
  const hostDeviceId = "dev-host-src";
  const operatorDevId = "dev-operator-src";
  const speakerADevId = "dev-speaker-src-a";
  const speakerBDevId = "dev-speaker-src-b";
  const audienceDevId = "dev-audience-src";

  const setupRoomState = () => {
    let state = createInitialSessionState(roomId, roomId, "Source Manager Stage", hostUserId, hostDeviceId);

    // Operator
    state.devices[operatorDevId] = {
      id: operatorDevId,
      name: "Operator Dave",
      userAgent: "Edge on Windows",
      role: "operator",
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

    // Speaker A
    state.devices[speakerADevId] = {
      id: speakerADevId,
      name: "Speaker Armand",
      userAgent: "Chrome on macOS",
      role: "speaker",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: true,
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

    // Speaker B
    state.devices[speakerBDevId] = {
      id: speakerBDevId,
      name: "Speaker Harman",
      userAgent: "Firefox on Windows",
      role: "speaker",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: true,
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

    // Audience Display
    state.devices[audienceDevId] = {
      id: audienceDevId,
      name: "Audience Main Screen",
      userAgent: "Chrome Display",
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

    // Add Host Material (Persistent asset)
    state.materials.push({
      id: "mat-host-01",
      name: "Main Keynote",
      type: "pdf",
      url: "https://example.com/main.pdf",
      totalPages: 20,
      slides: Array.from({ length: 20 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}` })),
      uploadedAt: Date.now() - 5000,
      ownerDeviceId: hostDeviceId,
      ownerRole: "host",
      ownerName: "Host",
      status: "ready",
    });

    // Add Speaker A Material (Persistent asset)
    state.materials.push({
      id: "mat-speaker-a",
      name: "Armand Keynote",
      type: "pdf",
      url: "https://example.com/armand.pdf",
      totalPages: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}` })),
      uploadedAt: Date.now() - 3000,
      ownerDeviceId: speakerADevId,
      ownerRole: "speaker",
      ownerName: "Speaker Armand",
      status: "ready",
    });

    // Add Speaker A Screen Share (Dynamic realtime source)
    state.screenShareSources[speakerADevId] = {
      deviceId: speakerADevId,
      speakerName: "Speaker Armand",
      status: "active",
      startedAt: Date.now() - 2000,
      stoppedAt: null,
      updatedAt: Date.now() - 2000,
    };

    return state;
  };

  describe("1. Available Sources Semantics (Materials != Sources)", () => {
    it("should NOT return persistent materials in getAvailableSources() merely because they exist", () => {
      const state = setupRoomState();
      const sources = getAvailableSources(state);

      // Should ONLY contain active screen share, NOT the 2 materials
      expect(sources.length).toBe(1);
      expect(sources[0].id).toBe(speakerADevId);
      expect(sources[0].type).toBe("screen_share");

      expect(sources.find((s) => s.id === "mat-host-01")).toBeUndefined();
      expect(sources.find((s) => s.id === "mat-speaker-a")).toBeUndefined();
    });

    it("should return multiple active Speaker screen shares when multiple speakers share", () => {
      const state = setupRoomState();

      // Speaker B also starts sharing screen
      state.screenShareSources[speakerBDevId] = {
        deviceId: speakerBDevId,
        speakerName: "Speaker Harman",
        status: "active",
        startedAt: Date.now() - 1000,
        stoppedAt: null,
        updatedAt: Date.now() - 1000,
      };

      const sources = getAvailableSources(state);
      expect(sources.length).toBe(2);

      const armandSource = sources.find((s) => s.id === speakerADevId);
      const harmanSource = sources.find((s) => s.id === speakerBDevId);

      expect(armandSource?.ownerName).toBe("Speaker Armand");
      expect(harmanSource?.ownerName).toBe("Speaker Harman");
    });

    it("should return empty list when no speakers are sharing screen", () => {
      const state = setupRoomState();
      state.screenShareSources = {};

      const sources = getAvailableSources(state);
      expect(sources.length).toBe(0);
    });

    it("should exclude stopped screen shares from available sources", () => {
      const state = setupRoomState();
      state.screenShareSources[speakerADevId].status = "stopped";

      const sources = getAvailableSources(state);
      expect(sources.length).toBe(0);
    });
  });

  describe("2. Security & Permission Policy", () => {
    it("should allow Host to execute SOURCE_TAKE_LIVE", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-take-live-host",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-host-01" },
      };
      const result = PermissionPolicy.canExecuteCommand(state, hostDeviceId, cmd);
      expect(result.allowed).toBe(true);
    });

    it("should allow Operator to execute SOURCE_TAKE_LIVE", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-take-live-op",
        senderDeviceId: operatorDevId,
        timestamp: Date.now(),
        payload: { sourceType: "screen_share", sourceId: speakerADevId },
      };
      const result = PermissionPolicy.canExecuteCommand(state, operatorDevId, cmd);
      expect(result.allowed).toBe(true);
    });

    it("should reject Speaker from executing SOURCE_TAKE_LIVE", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-take-live-spk",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-speaker-a" },
      };
      const result = PermissionPolicy.canExecuteCommand(state, speakerADevId, cmd);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cannot execute administrative or stage control command 'SOURCE_TAKE_LIVE'");
    });

    it("should reject Display from executing SOURCE_TAKE_LIVE", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-take-live-aud",
        senderDeviceId: audienceDevId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-host-01" },
      };
      const result = PermissionPolicy.canExecuteCommand(state, audienceDevId, cmd);
      expect(result.allowed).toBe(false);
    });
  });

  describe("3. Reducer - Take Live Execution", () => {
    it("should transition Material source to LIVE authoritatively via presentation system", () => {
      let state = setupRoomState();
      const cmd: StageCommand = {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-take-mat-live",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-speaker-a" },
      };

      state = stageSessionReducer(state, cmd);

      expect(state.liveSource).toBeDefined();
      expect(state.liveSource?.type).toBe("material");
      expect(state.liveSource?.id).toBe("mat-speaker-a");
      expect(state.liveSource?.ownerName).toBe("Speaker Armand");
      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.materialId).toBe("mat-speaker-a");
      expect(state.presentation.status).toBe("live");
    });

    it("should transition Screen Share source to LIVE authoritatively", () => {
      let state = setupRoomState();
      const cmd: StageCommand = {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-take-screen-live",
        senderDeviceId: operatorDevId,
        timestamp: Date.now(),
        payload: { sourceType: "screen_share", sourceId: speakerADevId },
      };

      state = stageSessionReducer(state, cmd);

      expect(state.liveSource).toBeDefined();
      expect(state.liveSource?.type).toBe("screen_share");
      expect(state.liveSource?.id).toBe(speakerADevId);
      expect(state.liveSource?.ownerName).toBe("Speaker Armand");
      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.status).toBe("live");

      const sources = getAvailableSources(state);
      const spkScreen = sources.find((s) => s.id === speakerADevId && s.type === "screen_share");
      expect(spkScreen?.isLive).toBe(true);
      expect(spkScreen?.status).toBe("live");
    });

    it("should reject taking an unavailable / non-existent source LIVE", () => {
      let state = setupRoomState();

      expect(() => {
        stageSessionReducer(state, {
          type: "SOURCE_TAKE_LIVE",
          commandId: "cmd-err-1",
          senderDeviceId: hostDeviceId,
          timestamp: Date.now(),
          payload: { sourceType: "material", sourceId: "non-existent-mat" },
        } as StageCommand);
      }).toThrow(/Material does not exist/);

      expect(() => {
        stageSessionReducer(state, {
          type: "SOURCE_TAKE_LIVE",
          commandId: "cmd-err-2",
          senderDeviceId: hostDeviceId,
          timestamp: Date.now(),
          payload: { sourceType: "screen_share", sourceId: speakerBDevId },
        } as StageCommand);
      }).toThrow(/Screen share source does not exist/);
    });

    it("should take source OFFLINE when SOURCE_TAKE_OFFLINE is dispatched", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-live",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-host-01" },
      } as StageCommand);

      expect(state.liveSource).toBeDefined();

      state = stageSessionReducer(state, {
        type: "SOURCE_TAKE_OFFLINE",
        commandId: "cmd-offline",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(state.liveSource).toBeNull();
      expect(state.presentation.isPresenting).toBe(false);
      expect(state.presentation.status).toBe("ended");
    });
  });

  describe("4. Cleanup & Unavailable Sources", () => {
    it("should clear LIVE state when the LIVE screen share source is stopped", () => {
      let state = setupRoomState();

      // Take Armand's screen share LIVE
      state = stageSessionReducer(state, {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-live-screen",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { sourceType: "screen_share", sourceId: speakerADevId },
      } as StageCommand);

      expect(state.liveSource?.id).toBe(speakerADevId);

      // Armand stops screen share
      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_STOP",
        commandId: "cmd-stop-screen",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(state.liveSource).toBeNull();
      expect(state.presentation.isPresenting).toBe(false);
      expect(state.presentation.status).toBe("ended");
    });

    it("should clear LIVE state when the LIVE material is removed", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-live-mat",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-host-01" },
      } as StageCommand);

      expect(state.liveSource?.id).toBe("mat-host-01");

      state = stageSessionReducer(state, {
        type: "MATERIAL_REMOVE",
        commandId: "cmd-rm-mat",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { materialId: "mat-host-01" },
      } as StageCommand);

      expect(state.liveSource).toBeNull();
      expect(state.presentation.isPresenting).toBe(false);
    });
  });

  describe("5. Speaker Independence & Slide Navigation", () => {
    it("should allow Speaker to navigate slides when their material is LIVE", () => {
      let state = setupRoomState();

      // Host takes Armand's material LIVE
      state = stageSessionReducer(state, {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-live-armand",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-speaker-a" },
      } as StageCommand);

      expect(state.presentation.currentSlide).toBe(1);

      // Armand navigates to next slide
      state = stageSessionReducer(state, {
        type: "SLIDE_NEXT",
        commandId: "cmd-next",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(state.presentation.currentSlide).toBe(2);
      expect(state.liveSource?.id).toBe("mat-speaker-a");
    });

    it("should NOT change liveSource when a new Speaker screen share starts", () => {
      let state = setupRoomState();

      // Host takes main keynote LIVE
      state = stageSessionReducer(state, {
        type: "SOURCE_TAKE_LIVE",
        commandId: "cmd-live-host",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { sourceType: "material", sourceId: "mat-host-01" },
      } as StageCommand);

      // Speaker B starts sharing screen
      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-b-start",
        senderDeviceId: speakerBDevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      // LIVE source must remain Host's presentation
      expect(state.liveSource?.id).toBe("mat-host-01");
      expect(state.liveSource?.type).toBe("material");
    });
  });
});
