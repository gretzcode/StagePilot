import { describe, it, expect } from "vitest";
import { RoomRegistry } from "../../src/lib/rooms/registry";
import { createInitialSessionState } from "../../src/core/session/initial-state";
import { stageSessionReducer } from "../../src/core/session/reducer";
import { StageCommand } from "../../src/core/types";

describe("Unified Device Lifecycle & Approval Security Unit Tests", () => {
  it("should initialize guest devices with approvalStatus = pending for ALL roles (control, audience, confidence)", async () => {
    const hostId = `host-unit-${Date.now()}`;
    const room = await RoomRegistry.createRoom(hostId, "Approval Test Room");

    const state = createInitialSessionState(room.roomId, room.roomCode, room.name, hostId, "host-dev-1");

    // Add devices for each role
    const controlDevId = "dev-control-1";
    const audienceDevId = "dev-audience-1";
    const confidenceDevId = "dev-confidence-1";

    state.devices[controlDevId] = {
      id: controlDevId,
      name: "Control iPad",
      userAgent: "Test Browser",
      role: "control",
      approvalStatus: "pending",
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

    state.devices[audienceDevId] = {
      id: audienceDevId,
      name: "Audience Monitor",
      userAgent: "Test Browser",
      role: "audience",
      approvalStatus: "pending",
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

    state.devices[confidenceDevId] = {
      id: confidenceDevId,
      name: "Confidence HUD",
      userAgent: "Test Browser",
      role: "confidence",
      approvalStatus: "pending",
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

    expect(state.devices[controlDevId].approvalStatus).toBe("pending");
    expect(state.devices[audienceDevId].approvalStatus).toBe("pending");
    expect(state.devices[confidenceDevId].approvalStatus).toBe("pending");
  });

  it("should update approvalStatus = approved when Host dispatches DEVICE_APPROVE", async () => {
    const hostId = "host-1";
    let state = createInitialSessionState("room-1", "ROOM01", "Main Room", hostId, "host-dev");

    const audienceDevId = "dev-aud-1";
    state.devices[audienceDevId] = {
      id: audienceDevId,
      name: "Audience Display",
      userAgent: "Test",
      role: "audience",
      approvalStatus: "pending",
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

    const approveCmd = {
      commandId: "cmd-approve",
      type: "DEVICE_APPROVE",
      payload: { targetDeviceId: audienceDevId },
      senderDeviceId: "host-dev",
      timestamp: Date.now(),
    } as StageCommand;

    state = stageSessionReducer(state, approveCmd);

    expect(state.devices[audienceDevId].approvalStatus).toBe("approved");
  });

  it("should ensure device approval is room-scoped and not shared across rooms", async () => {
    const hostId = "host-1";

    const stateRoomA = createInitialSessionState("room-a", "ROOMA1", "Room A", hostId, "host-dev");
    const stateRoomB = createInitialSessionState("room-b", "ROOMB1", "Room B", hostId, "host-dev");

    const guestDevId = "guest-dev-shared-id";

    // Approve guestDevId in Room A
    stateRoomA.devices[guestDevId] = {
      id: guestDevId,
      name: "Shared Device",
      userAgent: "Test",
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

    // Room B has not approved guestDevId
    expect(stateRoomA.devices[guestDevId]?.approvalStatus).toBe("approved");
    expect(stateRoomB.devices[guestDevId]).toBeUndefined();
  });
});
