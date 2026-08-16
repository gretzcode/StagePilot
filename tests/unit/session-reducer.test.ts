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
    expect(state.presentation.currentSlide).toBe(1);

    const nextCmd: StageCommand = {
      type: "SLIDE_NEXT",
      commandId: "cmd-4",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: {},
    };

    state = stageSessionReducer(state, nextCmd);
    expect(state.presentation.currentSlide).toBe(2);
  });

  it("should expand slide metadata for web materials when jumping to a later page", () => {
    let state = createInitialSessionState(roomId, roomId, "Test Room", hostUserId, hostDeviceId);

    state.materials = [
      {
        id: "mat-web-1",
        name: "Google Slides Deck",
        type: "url",
        url: "https://docs.google.com/presentation/d/test123/embed",
        externalUrl: "https://docs.google.com/presentation/d/test123/embed",
        totalPages: 5,
        slides: [{ index: 1, title: "Slide 1" }, { index: 2, title: "Slide 2" }],
        uploadedAt: Date.now(),
        status: "ready",
      },
    ];

    const startCmd: StageCommand = {
      type: "PRESENTATION_START",
      commandId: "cmd-start-web",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-web-1", startPage: 1 },
    };

    state = stageSessionReducer(state, startCmd);

    const gotoCmd: StageCommand = {
      type: "SLIDE_GOTO",
      commandId: "cmd-goto-web",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { pageNumber: 4 },
    };

    expect(() => stageSessionReducer(state, gotoCmd)).not.toThrow();

    const nextState = stageSessionReducer(state, gotoCmd);
    expect(nextState.presentation.currentSlide).toBe(4);
    expect(nextState.materials[0].slides.length).toBeGreaterThanOrEqual(4);
  });

  it("should process MATERIAL_ADD command and update state.materials", () => {
    let state = createInitialSessionState(roomId, roomId, "Test Room", hostUserId, hostDeviceId);

    const newMaterial = {
      id: "mat-new-123",
      name: "Uploaded Deck.pdf",
      type: "pdf" as const,
      url: "http://example.com/uploaded.pdf",
      totalPages: 10,
      slides: [{ index: 1, title: "Slide 1" }],
      uploadedAt: Date.now(),
      status: "ready" as const,
    };

    const addCmd: StageCommand = {
      type: "MATERIAL_ADD",
      commandId: "cmd-add-mat",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: newMaterial },
    };

    state = stageSessionReducer(state, addCmd);
    expect(state.materials.length).toBe(1);
    expect(state.materials[0].id).toBe("mat-new-123");

    const startCmd: StageCommand = {
      type: "PRESENTATION_START",
      commandId: "cmd-start-new",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-new-123", startPage: 1 },
    };

    state = stageSessionReducer(state, startCmd);
    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.materialId).toBe("mat-new-123");
    expect(state.presentation.totalPages).toBe(10);
  });

  it("should synchronize media playback state on MEDIA_PLAY, MEDIA_PAUSE, and MEDIA_SEEK", () => {
    let state = createInitialSessionState(roomId, roomId, "Test Room", hostUserId, hostDeviceId);

    // 1. Play command
    const playCmd: StageCommand = {
      type: "MEDIA_PLAY",
      commandId: "cmd-play-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { currentTime: 15.5 },
    };

    state = stageSessionReducer(state, playCmd);
    expect(state.presentation.mediaState).toBeDefined();
    expect(state.presentation.mediaState?.status).toBe("playing");
    expect(state.presentation.mediaState?.currentTime).toBe(15.5);

    // 2. Pause command
    const pauseCmd: StageCommand = {
      type: "MEDIA_PAUSE",
      commandId: "cmd-pause-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { currentTime: 25.0 },
    };

    state = stageSessionReducer(state, pauseCmd);
    expect(state.presentation.mediaState?.status).toBe("paused");
    expect(state.presentation.mediaState?.currentTime).toBe(25.0);

    // 3. Seek command
    const seekCmd: StageCommand = {
      type: "MEDIA_SEEK",
      commandId: "cmd-seek-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { targetTime: 120.0 },
    };

    state = stageSessionReducer(state, seekCmd);
    expect(state.presentation.mediaState?.currentTime).toBe(120.0);
  });
});
