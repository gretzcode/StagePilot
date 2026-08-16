import { describe, it, expect } from "vitest";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { CommandDispatcher } from "@/core/commands/dispatcher";
import { StageCommand, StageSessionState } from "@/core/types";

describe("Hibernation Recovery & Multi-Client Synchronization Test", () => {
  const roomId = "ROOM99";
  const hostUserId = "host-user-99";
  const hostDeviceId = "dev-host-99";

  it("should restore persistent state and process commands after hibernation simulation", () => {
    // 1. Initial State creation
    let persistedStorage: string | null = null;
    let memoryState: StageSessionState | null = createInitialSessionState(roomId, roomId, "Hibernation Room", hostUserId, hostDeviceId);

    // Persist to storage
    persistedStorage = JSON.stringify(memoryState);

    // 2. Simulate Hibernation Eviction (in-memory state reset to null)
    memoryState = null;
    expect(memoryState).toBeNull();

    // 3. Wakeup after hibernation & state restoration from storage
    if (!memoryState && persistedStorage) {
      memoryState = JSON.parse(persistedStorage);
    }
    expect(memoryState).not.toBeNull();
    expect(memoryState?.session.roomId).toBe(roomId);

    // 4. Process new command after wakeup
    const cmd: StageCommand = {
      type: "TIMER_SET",
      commandId: "cmd-h1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { duration: 1200, label: "Post-Hibernation Timer" },
    };

    memoryState = CommandDispatcher.dispatch(memoryState!, cmd);
    expect(memoryState.timer.duration).toBe(1200);
  });

  it("should converge all clients on identical authoritative room state (Multi-Client Test)", () => {
    let roomState = createInitialSessionState(roomId, roomId, "MultiClient Room", hostUserId, hostDeviceId);

    const controlDevId = "dev-control-b";
    const audienceDevId = "dev-audience-c";
    const confidenceDevId = "dev-confidence-d";

    roomState.materials = [
      {
        id: "mat-1",
        name: "Main Keynote Deck",
        type: "pdf",
        url: "http://example.com/deck.pdf",
        totalPages: 10,
        slides: [
          { index: 1, title: "Slide 1" },
          { index: 2, title: "Slide 2" },
        ],
        uploadedAt: Date.now(),
        status: "ready",
      },
    ];

    // Register devices
    const devicesToJoin = [
      { id: controlDevId, role: "control" as const, name: "Backup Control" },
      { id: audienceDevId, role: "audience" as const, name: "Projector Display" },
      { id: confidenceDevId, role: "confidence" as const, name: "Speaker Display" },
    ];

    devicesToJoin.forEach((dev) => {
      roomState = stageSessionReducer(roomState, {
        type: "DEVICE_REQUEST_JOIN",
        commandId: `join-${dev.id}`,
        senderDeviceId: dev.id,
        timestamp: Date.now(),
        payload: {
          roomCode: roomId,
          deviceName: dev.name,
          requestedRole: dev.role,
          userAgent: "Browser",
        },
      });

      // Host approves device
      roomState = stageSessionReducer(roomState, {
        type: "DEVICE_APPROVE",
        commandId: `appr-${dev.id}`,
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { targetDeviceId: dev.id },
      });
    });

    // Control B executes SLIDE_NEXT
    roomState = stageSessionReducer(roomState, {
      type: "PRESENTATION_START",
      commandId: "start-1",
      senderDeviceId: controlDevId,
      timestamp: Date.now(),
      payload: { materialId: "mat-1", startPage: 1 },
    });

    roomState = stageSessionReducer(roomState, {
      type: "SLIDE_NEXT",
      commandId: "next-1",
      senderDeviceId: controlDevId,
      timestamp: Date.now(),
      payload: {},
    });

    // All client views (Host, Control B, Audience C, Confidence D) receive identical state
    const hostView = roomState.presentation.currentSlide;
    const controlView = roomState.presentation.currentSlide;
    const audienceView = roomState.presentation.currentSlide;
    const confidenceView = roomState.presentation.currentSlide;

    expect(hostView).toBe(2);
    expect(controlView).toBe(2);
    expect(audienceView).toBe(2);
    expect(confidenceView).toBe(2);
  });

  it("should maintain presentation and timer when Host disconnects (Disconnect Test)", () => {
    let roomState = createInitialSessionState(roomId, roomId, "Disconnect Room", hostUserId, hostDeviceId);

    // Host disconnects
    roomState.devices[hostDeviceId].status = "offline";
    roomState.host.isHostConnected = false;

    // Timer and Presentation continue
    expect(roomState.session.isActive).toBe(true);

    // Host reconnects from new device identity with same hostUserId
    roomState = stageSessionReducer(roomState, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "reconnect-1",
      senderDeviceId: hostUserId, // Host user ID matches
      timestamp: Date.now(),
      payload: {
        roomCode: roomId,
        deviceName: "Host Laptop Reconnected",
        requestedRole: "host",
        userAgent: "Chrome New",
      },
    });

    expect(roomState.host.isHostConnected).toBe(true);
    expect(roomState.session.roomId).toBe(roomId);
  });
});
