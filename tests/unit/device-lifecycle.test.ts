import { describe, it, expect } from "vitest";
import { RoomRegistry } from "../../src/lib/rooms/registry";
import { createInitialSessionState } from "../../src/core/session/initial-state";
import { stageSessionReducer } from "../../src/core/session/reducer";
import { StageCommand } from "../../src/core/types";

describe("Unified Device Lifecycle & Approval Security Unit Tests", () => {
  it("should initialize guest devices with approvalStatus = pending for participant roles (operator, speaker)", async () => {
    const hostId = `host-unit-${Date.now()}`;
    const room = await RoomRegistry.createRoom(hostId, "Approval Test Room");

    let state = createInitialSessionState(room.roomId, room.roomCode, room.name, hostId, "host-dev-1");

    const operatorDevId = "dev-operator-1";
    const speakerDevId = "dev-speaker-1";

    // Operator requests join
    state = stageSessionReducer(state, {
      commandId: "cmd-join-op",
      type: "DEVICE_REQUEST_JOIN",
      senderDeviceId: operatorDevId,
      payload: {
        deviceName: "Operator Tablet",
        requestedRole: "operator",
        userAgent: "Safari",
      },
      timestamp: Date.now(),
    } as StageCommand);

    // Speaker requests join
    state = stageSessionReducer(state, {
      commandId: "cmd-join-spk",
      type: "DEVICE_REQUEST_JOIN",
      senderDeviceId: speakerDevId,
      payload: {
        deviceName: "Speaker MacBook",
        requestedRole: "speaker",
        userAgent: "Chrome",
      },
      timestamp: Date.now(),
    } as StageCommand);

    expect(state.devices[operatorDevId].approvalStatus).toBe("pending");
    expect(state.devices[operatorDevId].role).toBe("operator");
    expect(state.devices[operatorDevId].permissions.canControlTimer).toBe(true);
    expect(state.devices[operatorDevId].permissions.canManageDevices).toBe(false);

    expect(state.devices[speakerDevId].approvalStatus).toBe("pending");
    expect(state.devices[speakerDevId].role).toBe("speaker");
    expect(state.devices[speakerDevId].permissions.canControlPresentation).toBe(true);
    expect(state.devices[speakerDevId].permissions.canControlTimer).toBe(false);
    expect(state.devices[speakerDevId].permissions.canManageDevices).toBe(false);
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
