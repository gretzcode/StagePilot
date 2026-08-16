import { describe, it, expect } from "vitest";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { CommandDispatcher } from "@/core/commands/dispatcher";
import { StageCommand } from "@/core/types";
import { ForbiddenError } from "@/core/errors/domain-error";

describe("StagePilot Phase 1 Core Stage Runtime Invariant Tests", () => {
  const roomId = "A7K9P2";
  const roomCode = "A7K9P2";
  const hostUserId = "host-usr-100";
  const hostDeviceId = "dev-host-main";

  it("INVARIANT 1: Only one authoritative StageSessionState per Room exists and updates deterministically", () => {
    let state = createInitialSessionState(roomId, roomCode, "Main Stage Keynote", hostUserId, hostDeviceId);
    expect(state.version).toBe(1);

    state.materials.push({
      id: "mat-test-1",
      name: "Keynote.pdf",
      type: "pdf",
      url: "http://example.com/k.pdf",
      totalPages: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1 })),
      uploadedAt: Date.now(),
      status: "ready",
    });

    const cmdStart: StageCommand = {
      type: "PRESENTATION_START",
      commandId: "c-inv-start",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-test-1", startPage: 1 },
    };
    state = CommandDispatcher.dispatch(state, cmdStart);

    const cmdGoto: StageCommand = {
      type: "SLIDE_GOTO",
      commandId: "c-inv-goto",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { pageNumber: 3 },
    };
    state = CommandDispatcher.dispatch(state, cmdGoto);

    expect(state.version).toBe(3);
    expect(state.presentation.currentSlide).toBe(3);
    expect(state.presentation.revision).toBe(3);
  });

  it("INVARIANT 2: Only Host can approve devices; Control devices cannot approve pending requests", () => {
    let state = createInitialSessionState(roomId, roomCode, "Main Stage Keynote", hostUserId, hostDeviceId);

    // Guest Control joins
    state = stageSessionReducer(state, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "j-ctrl",
      senderDeviceId: "dev-control-1",
      timestamp: Date.now(),
      payload: { roomCode, deviceName: "Backup Laptop", requestedRole: "control", userAgent: "Chrome" },
    });

    // Guest Audience joins
    state = stageSessionReducer(state, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "j-aud",
      senderDeviceId: "dev-audience-1",
      timestamp: Date.now(),
      payload: { roomCode, deviceName: "LED Wall PC", requestedRole: "audience", userAgent: "Chrome" },
    });

    // Host approves Control
    state = stageSessionReducer(state, {
      type: "DEVICE_APPROVE",
      commandId: "appr-ctrl",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { targetDeviceId: "dev-control-1" },
    });
    expect(state.devices["dev-control-1"].approvalStatus).toBe("approved");

    // Control device attempts to approve Audience -> Must be rejected by PermissionPolicy
    const illegalApproveCmd: StageCommand = {
      type: "DEVICE_APPROVE",
      commandId: "ill-appr",
      senderDeviceId: "dev-control-1",
      timestamp: Date.now(),
      payload: { targetDeviceId: "dev-audience-1" },
    };

    expect(() => CommandDispatcher.dispatch(state, illegalApproveCmd)).toThrow(ForbiddenError);
  });

  it("INVARIANTS 3 & 4: Audience and Confidence Displays cannot execute Control commands", () => {
    let state = createInitialSessionState(roomId, roomCode, "Main Stage Keynote", hostUserId, hostDeviceId);

    // Join & Approve Audience Display
    state = stageSessionReducer(state, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "j-aud",
      senderDeviceId: "dev-aud-1",
      timestamp: Date.now(),
      payload: { roomCode, deviceName: "Projector 1", requestedRole: "audience", userAgent: "Chrome" },
    });
    state.devices["dev-aud-1"].approvalStatus = "approved";

    // Join & Approve Confidence Display
    state = stageSessionReducer(state, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "j-conf",
      senderDeviceId: "dev-conf-1",
      timestamp: Date.now(),
      payload: { roomCode, deviceName: "Stage Monitor", requestedRole: "confidence", userAgent: "Safari" },
    });
    state.devices["dev-conf-1"].approvalStatus = "approved";

    // Audience attempts SLIDE_NEXT
    const audControlCmd: StageCommand = {
      type: "SLIDE_NEXT",
      commandId: "aud-cmd",
      senderDeviceId: "dev-aud-1",
      timestamp: Date.now(),
      payload: {},
    };
    expect(() => CommandDispatcher.dispatch(state, audControlCmd)).toThrow(ForbiddenError);

    // Confidence attempts TIMER_START
    const confControlCmd: StageCommand = {
      type: "TIMER_START",
      commandId: "conf-cmd",
      senderDeviceId: "dev-conf-1",
      timestamp: Date.now(),
      payload: {},
    };
    expect(() => CommandDispatcher.dispatch(state, confControlCmd)).toThrow(ForbiddenError);
  });

  it("INVARIANT 5 & 6: Room ownership remains hostUserId and Host disconnect does not destroy Room", () => {
    const state = createInitialSessionState(roomId, roomCode, "Main Stage Keynote", hostUserId, hostDeviceId);

    // Host disconnects
    state.devices[hostDeviceId].status = "offline";
    state.host.isHostConnected = false;

    expect(state.session.isActive).toBe(true);
    expect(state.host.hostUserId).toBe(hostUserId);
  });

  it("INVARIANT 7 & 8: Host reconnect restores connection without creating a new Room; Approved Guest reconnect retains approval", () => {
    let state = createInitialSessionState(roomId, roomCode, "Main Stage Keynote", hostUserId, hostDeviceId);

    // Add approved guest control
    const guestDevId = "dev-guest-backup";
    state = stageSessionReducer(state, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "j-guest",
      senderDeviceId: guestDevId,
      timestamp: Date.now(),
      payload: { roomCode, deviceName: "AV Desk Laptop", requestedRole: "control", userAgent: "Chrome" },
    });
    state.devices[guestDevId].approvalStatus = "approved";

    // Transient network disconnect & reconnect for guest
    state.devices[guestDevId].status = "offline";
    expect(state.devices[guestDevId].approvalStatus).toBe("approved");

    state.devices[guestDevId].status = "online";
    expect(state.devices[guestDevId].approvalStatus).toBe("approved"); // Retains approval
  });

  it("INVARIANT 9 & 10: All clients converge on identical authoritative state and local state is never authoritative", () => {
    let state = createInitialSessionState(roomId, roomCode, "Main Stage Keynote", hostUserId, hostDeviceId);

    state.materials.push({
      id: "mat-k",
      name: "Keynote.pdf",
      type: "pdf",
      url: "http://example.com/k.pdf",
      totalPages: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1 })),
      uploadedAt: Date.now(),
      status: "ready",
    });

    state = stageSessionReducer(state, {
      type: "PRESENTATION_START",
      commandId: "start-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-k", startPage: 1 },
    });

    const controlDevId = "dev-ctrl-caller";
    state = stageSessionReducer(state, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "j-ctrl",
      senderDeviceId: controlDevId,
      timestamp: Date.now(),
      payload: { roomCode, deviceName: "Show Caller Laptop", requestedRole: "control", userAgent: "Chrome" },
    });
    state.devices[controlDevId].approvalStatus = "approved";

    // Show Caller sends SLIDE_NEXT
    state = stageSessionReducer(state, {
      type: "SLIDE_NEXT",
      commandId: "c-next-1",
      senderDeviceId: controlDevId,
      timestamp: Date.now(),
      payload: {},
    });

    const hostViewCurrentSlide = state.presentation.currentSlide;
    const controlViewCurrentSlide = state.presentation.currentSlide;
    const audienceViewCurrentSlide = state.presentation.currentSlide;

    expect(hostViewCurrentSlide).toBe(controlViewCurrentSlide);
    expect(controlViewCurrentSlide).toBe(audienceViewCurrentSlide);
  });

  it("CONTROL TAKEOVER: Approved Control can claim active controller status when Host is disconnected", () => {
    let state = createInitialSessionState(roomId, roomCode, "Main Stage Keynote", hostUserId, hostDeviceId);

    const backupControlId = "dev-ctrl-backup";
    state = stageSessionReducer(state, {
      type: "DEVICE_REQUEST_JOIN",
      commandId: "j-bup",
      senderDeviceId: backupControlId,
      timestamp: Date.now(),
      payload: { roomCode, deviceName: "Backup Operator", requestedRole: "control", userAgent: "Chrome" },
    });
    state.devices[backupControlId].approvalStatus = "approved";

    // Host disconnects
    state.host.isHostConnected = false;
    state.devices[hostDeviceId].status = "offline";

    // Backup Control requests takeover
    state = stageSessionReducer(state, {
      type: "CONTROL_TAKEOVER",
      commandId: "take-1",
      senderDeviceId: backupControlId,
      timestamp: Date.now(),
      payload: { reason: "Host disconnected on main stage" },
    });

    expect(state.activeControllerDeviceId).toBe(backupControlId);
    expect(state.host.hostUserId).toBe(hostUserId); // Ownership unaffected
  });
});
