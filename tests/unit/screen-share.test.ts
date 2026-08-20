import { describe, it, expect } from "vitest";
import { PermissionPolicy } from "@/core/permissions/policy";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { StageCommand } from "@/core/types";

describe("Speaker Screen Sharing", () => {
  const roomId = "ROOM_SCREEN_01";
  const hostUserId = "host-user-screen";
  const hostDeviceId = "dev-host-screen";
  const speakerADevId = "dev-speaker-screen-a";
  const speakerBDevId = "dev-speaker-screen-b";

  const setupRoomState = () => {
    let state = createInitialSessionState(roomId, roomId, "Screen Share Stage", hostUserId, hostDeviceId);

    state.devices[speakerADevId] = {
      id: speakerADevId,
      name: "Speaker Alice",
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

    state.devices[speakerBDevId] = {
      id: speakerBDevId,
      name: "Speaker Bob",
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

    return state;
  };

  describe("Permission Policy", () => {
    it("should allow Speaker to start their own screen share", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-start-1",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      };
      const result = PermissionPolicy.canExecuteCommand(state, speakerADevId, cmd);
      expect(result.allowed).toBe(true);
    });

    it("should allow Speaker to stop their own screen share", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SCREEN_SHARE_STOP",
        commandId: "cmd-ss-stop-1",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      };
      const result = PermissionPolicy.canExecuteCommand(state, speakerADevId, cmd);
      expect(result.allowed).toBe(true);
    });

    it("should reject Speaker B from stopping Speaker A's screen share", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SCREEN_SHARE_STOP",
        commandId: "cmd-ss-stop-2",
        senderDeviceId: speakerBDevId,
        timestamp: Date.now(),
        payload: { targetDeviceId: speakerADevId },
      };
      const result = PermissionPolicy.canExecuteCommand(state, speakerBDevId, cmd);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cannot stop another Speaker");
    });

    it("should allow Host to stop any Speaker's screen share", () => {
      const state = setupRoomState();
      const cmd: StageCommand = {
        type: "SCREEN_SHARE_STOP",
        commandId: "cmd-ss-host-stop",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { targetDeviceId: speakerADevId },
      };
      const result = PermissionPolicy.canExecuteCommand(state, hostDeviceId, cmd);
      expect(result.allowed).toBe(true);
    });
  });

  describe("Reducer - Screen Share Start", () => {
    it("should create a screen share source entry when Speaker starts sharing", () => {
      let state = setupRoomState();

      const cmd: StageCommand = {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-start",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      };

      state = stageSessionReducer(state, cmd);

      expect(state.screenShareSources).toBeDefined();
      expect(state.screenShareSources[speakerADevId]).toBeDefined();
      expect(state.screenShareSources[speakerADevId].status).toBe("active");
      expect(state.screenShareSources[speakerADevId].deviceId).toBe(speakerADevId);
      expect(state.screenShareSources[speakerADevId].speakerName).toBe("Speaker Alice");
      expect(state.screenShareSources[speakerADevId].startedAt).toBeGreaterThan(0);
      expect(state.screenShareSources[speakerADevId].stoppedAt).toBeNull();
    });

    it("should allow multiple Speakers to have independent screen shares", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-b",
        senderDeviceId: speakerBDevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(Object.keys(state.screenShareSources).length).toBe(2);
      expect(state.screenShareSources[speakerADevId].status).toBe("active");
      expect(state.screenShareSources[speakerBDevId].status).toBe("active");
    });
  });

  describe("Reducer - Screen Share Stop", () => {
    it("should remove screen share source when Speaker stops sharing", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-start",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(state.screenShareSources[speakerADevId]).toBeDefined();

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_STOP",
        commandId: "cmd-ss-stop",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(state.screenShareSources[speakerADevId]).toBeUndefined();
    });

    it("should not affect Speaker A's screen share when Speaker B stops their own", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-b",
        senderDeviceId: speakerBDevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_STOP",
        commandId: "cmd-ss-b-stop",
        senderDeviceId: speakerBDevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(state.screenShareSources[speakerADevId]).toBeDefined();
      expect(state.screenShareSources[speakerADevId].status).toBe("active");
      expect(state.screenShareSources[speakerBDevId]).toBeUndefined();
    });

    it("should throw when Speaker B tries to stop Speaker A's screen share via reducer", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      expect(() => {
        stageSessionReducer(state, {
          type: "SCREEN_SHARE_STOP",
          commandId: "cmd-ss-b-stop-a",
          senderDeviceId: speakerBDevId,
          timestamp: Date.now(),
          payload: { targetDeviceId: speakerADevId },
        } as StageCommand);
      }).toThrow(/cannot stop another Speaker/i);
    });

    it("should allow Host to stop Speaker A's screen share", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_STOP",
        commandId: "cmd-ss-host-stop",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { targetDeviceId: speakerADevId },
      } as StageCommand);

      expect(state.screenShareSources[speakerADevId]).toBeUndefined();
    });
  });

  describe("Live Separation", () => {
    it("should NOT change the current LIVE presentation when screen share starts", () => {
      let state = setupRoomState();

      // Start a presentation first
      state.materials.push({
        id: "mat-host-pres",
        name: "Host Presentation",
        type: "pdf",
        url: "https://example.com/pres.pdf",
        totalPages: 10,
        slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}` })),
        uploadedAt: Date.now(),
        ownerDeviceId: hostDeviceId,
        ownerRole: "host",
        ownerName: "Host",
        status: "ready",
      });

      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "cmd-pres-start",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { materialId: "mat-host-pres", startPage: 1 },
      } as StageCommand);

      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.materialId).toBe("mat-host-pres");

      // Speaker starts screen share
      state = stageSessionReducer(state, {
        type: "SCREEN_SHARE_START",
        commandId: "cmd-ss-start",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      } as StageCommand);

      // Presentation state must NOT change
      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.materialId).toBe("mat-host-pres");
      expect(state.presentation.currentSlide).toBe(1);
    });
  });

  describe("Regression - Existing Functionality", () => {
    it("should preserve Speaker material add workflow after screen share feature", () => {
      let state = setupRoomState();

      const addCmd: StageCommand = {
        type: "MATERIAL_ADD",
        commandId: "cmd-mat-add",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {
          material: {
            id: "mat-speaker-test",
            name: "Speaker Test Material",
            type: "pdf",
            url: "https://example.com/test.pdf",
            totalPages: 5,
            slides: [],
            uploadedAt: Date.now(),
            status: "ready",
          },
        },
      };

      const permResult = PermissionPolicy.canExecuteCommand(state, speakerADevId, addCmd);
      expect(permResult.allowed).toBe(true);

      state = stageSessionReducer(state, addCmd);
      const added = state.materials.find((m) => m.id === "mat-speaker-test");
      expect(added).toBeDefined();
      expect(added?.ownerDeviceId).toBe(speakerADevId);
    });

    it("should preserve Host unrestricted access", () => {
      const state = setupRoomState();

      const cmds: StageCommand[] = [
        { type: "TIMER_START", commandId: "h1", senderDeviceId: hostDeviceId, timestamp: Date.now(), payload: {} },
        { type: "BRIEF_UPDATE", commandId: "h2", senderDeviceId: hostDeviceId, timestamp: Date.now(), payload: { text: "Test", urgency: "info" } },
        { type: "SCREEN_SHARE_START", commandId: "h3", senderDeviceId: hostDeviceId, timestamp: Date.now(), payload: {} },
      ] as StageCommand[];

      for (const cmd of cmds) {
        const result = PermissionPolicy.canExecuteCommand(state, hostDeviceId, cmd);
        expect(result.allowed).toBe(true);
      }
    });
  });
});
