import { DeviceState, StageCommand, StageSessionState } from "../types";
import { ForbiddenError } from "../errors/domain-error";

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export class PermissionPolicy {
  static canExecuteCommand(
    state: StageSessionState,
    senderDeviceId: string,
    command: StageCommand
  ): PermissionCheckResult {
    let sender = state.devices[senderDeviceId];

    // Room creation before device registration is allowed if senderId matches host or system
    if (command.type === "ROOM_CREATE" || command.type === "DEVICE_REQUEST_JOIN") {
      return { allowed: true };
    }

    if (!sender) {
      const isHostDevice = Boolean(state.host?.hostDeviceId && state.host.hostDeviceId === senderDeviceId);
      sender = {
        id: senderDeviceId,
        name: isHostDevice ? "Host Controller" : "Guest Controller",
        userAgent: "System / Controller",
        role: isHostDevice ? "host" : "control",
        approvalStatus: isHostDevice ? "approved" : "pending",
        status: "online",
        permissions: {
          canControlPresentation: isHostDevice,
          canControlTimer: isHostDevice,
          canControlBrief: isHostDevice,
          canBlankDisplay: isHostDevice,
          canManageDevices: isHostDevice,
          canManageRoom: isHostDevice,
          canTakeoverControl: isHostDevice,
        },
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        isHostDevice,
      };
      state.devices[senderDeviceId] = sender;
    }

    const role = sender.role || "host";

    // Audience and Confidence displays can NEVER send control commands
    if (role === "audience" || role === "confidence") {
      return {
        allowed: false,
        reason: `Role '${role}' is display-only and cannot send operational commands`,
      };
    }

    // Host has full operational & administrative permissions
    if (role === "host" || sender.isHostDevice) {
      return { allowed: true };
    }

    // CONTROL role permissions check
    if (role === "control") {
      const hasDeviceMgmt = sender.permissions?.canManageDevices ?? true;
      if (
        (sender.approvalStatus === "approved" || sender.approvalStatus === "connected") &&
        hasDeviceMgmt
      ) {
        const allowedWithDeviceMgmt = [
          "DEVICE_APPROVE",
          "DEVICE_REJECT",
          "DEVICE_REMOVE",
        ];
        if (allowedWithDeviceMgmt.includes(command.type)) {
          return { allowed: true };
        }
      }
      return this.checkControlPermissions(state, sender, command);
    }

    return { allowed: false, reason: "Unknown role permission boundary" };
  }

  private static checkControlPermissions(
    _state: StageSessionState,
    _sender: DeviceState,
    command: StageCommand
  ): PermissionCheckResult {
    const restrictedForControl = [
      "DEVICE_APPROVE",
      "DEVICE_REJECT",
      "DEVICE_REMOVE",
      "ROOM_CREATE",
    ];

    if (restrictedForControl.includes(command.type)) {
      return {
        allowed: false,
        reason: `Control device cannot execute administrative command '${command.type}'`,
      };
    }

    // CONTROL is allowed to execute presentation, timer, brief, display blanking & takeover commands
    const allowedForControl = [
      "MATERIAL_ADD",
      "MATERIAL_UPDATE",
      "MATERIAL_REMOVE",
      "PRESENTATION_START",
      "PRESENTATION_EXIT",
      "SLIDE_NEXT",
      "SLIDE_PREVIOUS",
      "SLIDE_GOTO",
      "TIMER_SET",
      "TIMER_START",
      "TIMER_PAUSE",
      "TIMER_RESET",
      "BRIEF_UPDATE",
      "BRIEF_CLEAR",
      "DISPLAY_BLANK",
      "DISPLAY_SHOW",
      "MEDIA_PLAY",
      "MEDIA_PAUSE",
      "MEDIA_SEEK",
      "MEDIA_STOP",
      "MEDIA_DURATION_UPDATE",
      "CONTROL_TAKEOVER",
      "ZOOM_SET",
      "ZOOM_RESET",
    ];

    if (allowedForControl.includes(command.type)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Command '${command.type}' is unauthorized for Control role`,
    };
  }


  static assertCanExecute(
    state: StageSessionState,
    senderDeviceId: string,
    command: StageCommand
  ): void {
    const result = this.canExecuteCommand(state, senderDeviceId, command);
    if (!result.allowed) {
      throw new ForbiddenError(result.reason || "Permission denied");
    }
  }
}
