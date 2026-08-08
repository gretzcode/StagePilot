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
    expect(res.reason).toContain("display-only");
  });
});
