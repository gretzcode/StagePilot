import { describe, it, expect } from "vitest";
import { PermissionPolicy } from "@/core/permissions/policy";
import { createInitialSessionState } from "@/core/session/initial-state";
import { StageCommand } from "@/core/types";

describe("PermissionPolicy", () => {
  const hostId = "host-user-1";
  const hostDevId = "dev-host-1";
  const controlDevId = "dev-control-1";
  const audienceDevId = "dev-audience-1";

  const buildState = () => {
    const state = createInitialSessionState("ROOM01", "ROOM01", "Test Room", hostId, hostDevId);

    state.devices[controlDevId] = {
      id: controlDevId,
      name: "Backup Control Laptop",
      userAgent: "Chrome",
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

    state.devices[audienceDevId] = {
      id: audienceDevId,
      name: "Main Projector",
      userAgent: "Chrome",
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

    return state;
  };

  it("should allow Host to execute administrative and operational commands", () => {
    const state = buildState();
    const cmd: StageCommand = {
      type: "DEVICE_APPROVE",
      commandId: "c1",
      senderDeviceId: hostDevId,
      timestamp: Date.now(),
      payload: { targetDeviceId: "some-device" },
    };

    const res = PermissionPolicy.canExecuteCommand(state, hostDevId, cmd);
    expect(res.allowed).toBe(true);
  });

  it("should allow Control role to execute slide commands but reject device approvals", () => {
    const state = buildState();

    const slideCmd: StageCommand = {
      type: "SLIDE_NEXT",
      commandId: "c2",
      senderDeviceId: controlDevId,
      timestamp: Date.now(),
      payload: {},
    };
    expect(PermissionPolicy.canExecuteCommand(state, controlDevId, slideCmd).allowed).toBe(true);

    const briefClearCmd: StageCommand = {
      type: "BRIEF_CLEAR",
      commandId: "c2b",
      senderDeviceId: controlDevId,
      timestamp: Date.now(),
      payload: {},
    };
    expect(PermissionPolicy.canExecuteCommand(state, controlDevId, briefClearCmd).allowed).toBe(true);

    const approveCmd: StageCommand = {
      type: "DEVICE_APPROVE",
      commandId: "c3",
      senderDeviceId: controlDevId,
      timestamp: Date.now(),
      payload: { targetDeviceId: "some-device" },
    };
    const res = PermissionPolicy.canExecuteCommand(state, controlDevId, approveCmd);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("cannot execute administrative command");
  });

  it("should allow Operator role to execute slide and stage commands but reject device approvals", () => {
    const state = buildState();
    const operatorDevId = "dev-operator-1";
    state.devices[operatorDevId] = {
      id: operatorDevId,
      name: "Floor Operator iPad",
      userAgent: "Safari",
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

    const slideCmd: StageCommand = {
      type: "SLIDE_NEXT",
      commandId: "c2-op",
      senderDeviceId: operatorDevId,
      timestamp: Date.now(),
      payload: {},
    };
    expect(PermissionPolicy.canExecuteCommand(state, operatorDevId, slideCmd).allowed).toBe(true);

    const timerCmd: StageCommand = {
      type: "TIMER_START",
      commandId: "c2-timer",
      senderDeviceId: operatorDevId,
      timestamp: Date.now(),
      payload: {},
    };
    expect(PermissionPolicy.canExecuteCommand(state, operatorDevId, timerCmd).allowed).toBe(true);

    const approveCmd: StageCommand = {
      type: "DEVICE_APPROVE",
      commandId: "c3-op",
      senderDeviceId: operatorDevId,
      timestamp: Date.now(),
      payload: { targetDeviceId: "some-device" },
    };
    const res = PermissionPolicy.canExecuteCommand(state, operatorDevId, approveCmd);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("cannot execute administrative command");
  });

  it("should allow Speaker role to navigate slides but reject timer, brief, and administrative commands", () => {
    const state = buildState();
    const speakerDevId = "dev-speaker-1";
    state.devices[speakerDevId] = {
      id: speakerDevId,
      name: "Keynote Speaker Clicker",
      userAgent: "Chrome",
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

    // Speaker is allowed slide navigation and zoom
    const slideCmd: StageCommand = {
      type: "SLIDE_NEXT",
      commandId: "c-spk-1",
      senderDeviceId: speakerDevId,
      timestamp: Date.now(),
      payload: {},
    };
    expect(PermissionPolicy.canExecuteCommand(state, speakerDevId, slideCmd).allowed).toBe(true);

    const slideGotoCmd: StageCommand = {
      type: "SLIDE_GOTO",
      commandId: "c-spk-2",
      senderDeviceId: speakerDevId,
      timestamp: Date.now(),
      payload: { pageNumber: 3 },
    };
    expect(PermissionPolicy.canExecuteCommand(state, speakerDevId, slideGotoCmd).allowed).toBe(true);

    const zoomSetCmd: StageCommand = {
      type: "ZOOM_SET",
      commandId: "c-spk-zoom",
      senderDeviceId: speakerDevId,
      timestamp: Date.now(),
      payload: { scale: 2.0, panX: 10, panY: 10 },
    };
    expect(PermissionPolicy.canExecuteCommand(state, speakerDevId, zoomSetCmd).allowed).toBe(true);

    // Speaker is rejected from timer control
    const timerCmd: StageCommand = {
      type: "TIMER_START",
      commandId: "c-spk-timer",
      senderDeviceId: speakerDevId,
      timestamp: Date.now(),
      payload: {},
    };
    const timerRes = PermissionPolicy.canExecuteCommand(state, speakerDevId, timerCmd);
    expect(timerRes.allowed).toBe(false);
    expect(timerRes.reason).toContain("cannot execute administrative or stage control command");

    // Speaker is rejected from brief control
    const briefCmd: StageCommand = {
      type: "BRIEF_UPDATE",
      commandId: "c-spk-brief",
      senderDeviceId: speakerDevId,
      timestamp: Date.now(),
      payload: { text: "Hello", urgency: "info" },
    };
    const briefRes = PermissionPolicy.canExecuteCommand(state, speakerDevId, briefCmd);
    expect(briefRes.allowed).toBe(false);

    // Speaker is rejected from device approvals
    const approveCmd: StageCommand = {
      type: "DEVICE_APPROVE",
      commandId: "c-spk-approve",
      senderDeviceId: speakerDevId,
      timestamp: Date.now(),
      payload: { targetDeviceId: "some-device" },
    };
    const approveRes = PermissionPolicy.canExecuteCommand(state, speakerDevId, approveCmd);
    expect(approveRes.allowed).toBe(false);
  });

  it("should reject any operational command sent by Audience or Confidence Display", () => {
    const state = buildState();
    const cmd: StageCommand = {
      type: "SLIDE_NEXT",
      commandId: "c4",
      senderDeviceId: audienceDevId,
      timestamp: Date.now(),
      payload: {},
    };

    const res = PermissionPolicy.canExecuteCommand(state, audienceDevId, cmd);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Display output mode");
  });
});
