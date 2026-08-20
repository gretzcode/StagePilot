import { describe, it, expect } from "vitest";
import { PermissionPolicy } from "@/core/permissions/policy";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { StageCommand, Material } from "@/core/types";

describe("Speaker Material Ownership & Isolation Unit Tests", () => {
  const roomId = "ROOM_SPK_01";
  const hostUserId = "host-user-alpha";
  const hostDeviceId = "dev-host-01";
  const speakerADevId = "dev-speaker-a";
  const speakerBDevId = "dev-speaker-b";
  const operatorDevId = "dev-operator-01";

  const setupRoomState = () => {
    let state = createInitialSessionState(roomId, roomId, "Keynote Main Stage", hostUserId, hostDeviceId);

    // Register Speaker A
    state.devices[speakerADevId] = {
      id: speakerADevId,
      name: "Dr. Alice Keynote",
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

    // Register Speaker B
    state.devices[speakerBDevId] = {
      id: speakerBDevId,
      name: "Bob Presenter",
      userAgent: "Safari on iPad",
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

    // Register Operator
    state.devices[operatorDevId] = {
      id: operatorDevId,
      name: "Floor AV Tech",
      userAgent: "Firefox on Windows",
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

    // Add initial Host-owned material
    const hostMaterial: Material = {
      id: "mat-host-01",
      name: "Opening Remarks & Agenda",
      type: "pdf",
      url: "https://storage.stagepilot.io/host-opening.pdf",
      totalPages: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, title: `Agenda ${i + 1}` })),
      uploadedAt: Date.now(),
      ownerUserId: hostUserId,
      ownerDeviceId: hostDeviceId,
      ownerRole: "host",
      ownerName: "Host",
      status: "ready",
    };
    state.materials.push(hostMaterial);

    return state;
  };

  describe("Material Creation & Ownership Stamping", () => {
    it("should allow Speaker A to add material and authoritatively stamp Speaker A as owner", () => {
      let state = setupRoomState();

      const newMaterial: Material = {
        id: "mat-alice-01",
        name: "Quantum Computing Horizons",
        type: "pdf",
        url: "https://storage.stagepilot.io/alice-quantum.pdf",
        totalPages: 24,
        slides: Array.from({ length: 24 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}` })),
        uploadedAt: Date.now(),
        status: "ready",
      };

      const addCmd: StageCommand = {
        type: "MATERIAL_ADD",
        commandId: "cmd-spk-add-1",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: { material: newMaterial },
      };

      // 1. Permission policy check
      const permCheck = PermissionPolicy.canExecuteCommand(state, speakerADevId, addCmd);
      expect(permCheck.allowed).toBe(true);

      // 2. Reducer execution
      state = stageSessionReducer(state, addCmd);

      const added = state.materials.find((m) => m.id === "mat-alice-01");
      expect(added).toBeDefined();
      expect(added?.ownerDeviceId).toBe(speakerADevId);
      expect(added?.ownerRole).toBe("speaker");
      expect(added?.ownerName).toBe("Dr. Alice Keynote");
    });
  });

  describe("Speaker Isolation & Ownership Boundaries", () => {
    it("should reject Speaker B from deleting Speaker A's material", () => {
      let state = setupRoomState();

      // Speaker A adds material
      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-spk-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {
          material: {
            id: "mat-alice-private",
            name: "Alice Confidential Research",
            type: "pdf",
            url: "https://example.com/alice.pdf",
            totalPages: 5,
            slides: [],
            uploadedAt: Date.now(),
            status: "ready",
          },
        },
      } as StageCommand);

      const deleteByBobCmd: StageCommand = {
        type: "MATERIAL_REMOVE",
        commandId: "cmd-spk-b-del",
        senderDeviceId: speakerBDevId,
        timestamp: Date.now(),
        payload: { materialId: "mat-alice-private" },
      };

      // PermissionPolicy must deny Speaker B
      const permResult = PermissionPolicy.canExecuteCommand(state, speakerBDevId, deleteByBobCmd);
      expect(permResult.allowed).toBe(false);
      expect(permResult.reason).toContain("cannot delete material owned by another participant");

      // Reducer must throw / block unauthorized deletion
      expect(() => {
        stageSessionReducer(state, deleteByBobCmd);
      }).toThrow(/cannot delete material owned by another participant/);
    });

    it("should reject Speaker from deleting or modifying Host-owned material", () => {
      const state = setupRoomState();

      const deleteHostMatCmd: StageCommand = {
        type: "MATERIAL_REMOVE",
        commandId: "cmd-spk-del-host",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: { materialId: "mat-host-01" },
      };

      const permResult = PermissionPolicy.canExecuteCommand(state, speakerADevId, deleteHostMatCmd);
      expect(permResult.allowed).toBe(false);
      expect(permResult.reason).toContain("Host-owned");

      expect(() => {
        stageSessionReducer(state, deleteHostMatCmd);
      }).toThrow(/Host-owned/);
    });

    it("should allow Host to delete any material in the room", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-spk-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {
          material: {
            id: "mat-alice-02",
            name: "Alice Slides",
            type: "pdf",
            url: "https://example.com/alice2.pdf",
            totalPages: 5,
            slides: [],
            uploadedAt: Date.now(),
            status: "ready",
          },
        },
      } as StageCommand);

      const hostDeleteCmd: StageCommand = {
        type: "MATERIAL_REMOVE",
        commandId: "cmd-host-del",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { materialId: "mat-alice-02" },
      };

      const permResult = PermissionPolicy.canExecuteCommand(state, hostDeviceId, hostDeleteCmd);
      expect(permResult.allowed).toBe(true);

      state = stageSessionReducer(state, hostDeleteCmd);
      expect(state.materials.find((m) => m.id === "mat-alice-02")).toBeUndefined();
    });
  });

  describe("Presentation Preparation & Slide Navigation", () => {
    it("should allow Speaker A to prepare and navigate own material", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-spk-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {
          material: {
            id: "mat-alice-keynote",
            name: "Alice Keynote",
            type: "pdf",
            url: "https://example.com/alice.pdf",
            totalPages: 15,
            slides: Array.from({ length: 15 }, (_, i) => ({ index: i + 1, title: `Page ${i + 1}` })),
            uploadedAt: Date.now(),
            status: "ready",
          },
        },
      } as StageCommand);

      // 1. Speaker A starts presenting own material
      const startCmd: StageCommand = {
        type: "PRESENTATION_START",
        commandId: "cmd-start-alice",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: { materialId: "mat-alice-keynote", startPage: 1 },
      };
      expect(PermissionPolicy.canExecuteCommand(state, speakerADevId, startCmd).allowed).toBe(true);

      state = stageSessionReducer(state, startCmd);
      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.materialId).toBe("mat-alice-keynote");
      expect(state.presentation.currentSlide).toBe(1);

      // 2. Speaker A navigates slides: SLIDE_NEXT, SLIDE_PREVIOUS, SLIDE_GOTO
      const nextCmd: StageCommand = {
        type: "SLIDE_NEXT",
        commandId: "cmd-next-alice",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      };
      expect(PermissionPolicy.canExecuteCommand(state, speakerADevId, nextCmd).allowed).toBe(true);
      state = stageSessionReducer(state, nextCmd);
      expect(state.presentation.currentSlide).toBe(2);

      const gotoCmd: StageCommand = {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-alice",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: { pageNumber: 7 },
      };
      expect(PermissionPolicy.canExecuteCommand(state, speakerADevId, gotoCmd).allowed).toBe(true);
      state = stageSessionReducer(state, gotoCmd);
      expect(state.presentation.currentSlide).toBe(7);

      // 3. Speaker A exits presentation
      const exitCmd: StageCommand = {
        type: "PRESENTATION_EXIT",
        commandId: "cmd-exit-alice",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {},
      };
      expect(PermissionPolicy.canExecuteCommand(state, speakerADevId, exitCmd).allowed).toBe(true);
      state = stageSessionReducer(state, exitCmd);
      expect(state.presentation.isPresenting).toBe(false);
    });

    it("should reject Speaker B from presenting Speaker A's private material", () => {
      let state = setupRoomState();

      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-spk-a",
        senderDeviceId: speakerADevId,
        timestamp: Date.now(),
        payload: {
          material: {
            id: "mat-alice-private-2",
            name: "Alice Confidential",
            type: "pdf",
            url: "https://example.com/alice.pdf",
            totalPages: 8,
            slides: [],
            uploadedAt: Date.now(),
            status: "ready",
          },
        },
      } as StageCommand);

      const startByBobCmd: StageCommand = {
        type: "PRESENTATION_START",
        commandId: "cmd-bob-start",
        senderDeviceId: speakerBDevId,
        timestamp: Date.now(),
        payload: { materialId: "mat-alice-private-2", startPage: 1 },
      };

      const permResult = PermissionPolicy.canExecuteCommand(state, speakerBDevId, startByBobCmd);
      expect(permResult.allowed).toBe(false);
      expect(permResult.reason).toContain("cannot present material owned by another Speaker");
    });
  });
});
