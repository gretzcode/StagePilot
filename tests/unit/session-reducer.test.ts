import { describe, it, expect } from "vitest";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { StageCommand } from "@/core/types";

describe("Stage Session Reducer", () => {
  const roomId = "ROOM1";
  const hostUserId = "host-user-1";
  const hostDeviceId = "dev-host-1";

  it("should process DEVICE_REQUEST_JOIN and auto-approve host device", () => {
    const initialState = createInitialSessionState(roomId, roomId, "Test Room", hostUserId);

    const joinCommand: StageCommand = {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "cmd-1",
      senderDeviceId: hostUserId,
      timestamp: Date.now(),
      payload: {
        roomCode: roomId,
        deviceName: "Host Laptop",
        requestedRole: "host",
        userAgent: "Mozilla/5.0",
      },
    };

    const nextState = stageSessionReducer(initialState, joinCommand);

    expect(nextState.devices[hostUserId]).toBeDefined();
    expect(nextState.devices[hostUserId].approvalStatus).toBe("approved");
    expect(nextState.host.isHostConnected).toBe(true);
    expect(nextState.version).toBe(2);
  });

  it("should process DEVICE_REQUEST_JOIN for guest control device as pending", () => {
    const initialState = createInitialSessionState(roomId, roomId, "Test Room", hostUserId, hostDeviceId);
    const guestDeviceId = "dev-guest-1";

    const joinCommand: StageCommand = {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "cmd-2",
      senderDeviceId: guestDeviceId,
      timestamp: Date.now(),
      payload: {
        roomCode: roomId,
        deviceName: "Guest iPad",
        requestedRole: "control",
        userAgent: "Mobile Safari",
      },
    };

    const nextState = stageSessionReducer(initialState, joinCommand);

    expect(nextState.devices[guestDeviceId]).toBeDefined();
    expect(nextState.devices[guestDeviceId].approvalStatus).toBe("pending");
  });

  it("should update presentation state on PRESENTATION_START and SLIDE_NEXT", () => {
    let state = createInitialSessionState(roomId, roomId, "Test Room", hostUserId, hostDeviceId);

    state.materials = [
      {
        id: "mat-1",
        name: "Test Deck",
        type: "pdf",
        url: "http://example.com/deck.pdf",
        totalPages: 5,
        slides: [
          { index: 1, title: "Slide 1" },
          { index: 2, title: "Slide 2" },
        ],
        uploadedAt: Date.now(),
        status: "ready",
      },
    ];

    const startCmd: StageCommand = {
      type: "PRESENTATION_START",
      commandId: "cmd-3",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-1", startPage: 1 },
    };

    state = stageSessionReducer(state, startCmd);
    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.currentPage).toBe(1);

    const nextCmd: StageCommand = {
      type: "SLIDE_NEXT",
      commandId: "cmd-4",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: {},
    };

    state = stageSessionReducer(state, nextCmd);
    expect(state.presentation.currentPage).toBe(2);
  });
});
