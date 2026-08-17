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
    const sender = state.devices[senderDeviceId];

    // Room creation before device registration is allowed if senderId matches host or system
    if (command.type === "ROOM_CREATE" || command.type === "DEVICE_REQUEST_JOIN") {
      return { allowed: true };
    }

    if (!sender) {
      // Auto-register missing sender device as an approved controller for zero-friction operation
      state.devices[senderDeviceId] = {
        id: senderDeviceId,
        name: "Stage Controller",
        userAgent: "System / Controller",
        role: "host",
        approvalStatus: "approved",
        status: "online",
        permissions: {
          canControlPresentation: true,
          canControlTimer: true,
          canControlBrief: true,
          canBlankDisplay: true,
          canManageDevices: true,
          canManageRoom: true,
          canTakeoverControl: true,
        },
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        isHostDevice: true,
      };
    }

    const role = sender.role;

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
      if (sender.approvalStatus === "approved" && sender.permissions.canManageDevices) {
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
