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

    // Displays (Audience & Confidence) are output renderers only and can NEVER send operational commands,
    // EXCEPT for MATERIAL_CACHE_REPORT (telemetry acknowledging local preloading)
    if (role === "audience" || role === "confidence") {
      if (command.type === "MATERIAL_CACHE_REPORT") {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Display output mode '${role}' is read-only and cannot send operational commands`,
      };
    }

    // Host has full operational & administrative permissions
    if (role === "host" || sender.isHostDevice) {
      return { allowed: true };
    }

    // OPERATOR role (and legacy 'control' alias) permissions check
    if (role === "operator" || role === "control") {
      return this.checkOperatorPermissions(state, sender, command);
    }

    // SPEAKER role permissions check
    if (role === "speaker") {
      return this.checkSpeakerPermissions(state, sender, command);
    }

    return { allowed: false, reason: "Unknown role permission boundary" };
  }

  private static checkOperatorPermissions(
    _state: StageSessionState,
    _sender: DeviceState,
    command: StageCommand
  ): PermissionCheckResult {
    const restrictedForOperator = [
      "DEVICE_APPROVE",
      "DEVICE_REJECT",
      "DEVICE_REMOVE",
      "ROOM_CREATE",
    ];

    if (restrictedForOperator.includes(command.type)) {
      return {
        allowed: false,
        reason: `Operator device cannot execute administrative command '${command.type}'`,
      };
    }

    // Operator is allowed to execute presentation, timer, brief, display blanking & media commands
    const allowedForOperator = [
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
      "SOURCE_TAKE_LIVE",
      "SOURCE_TAKE_OFFLINE",
      "MATERIAL_PRECACHE_REQUEST",
      "MATERIAL_CACHE_REPORT",
    ];

    if (allowedForOperator.includes(command.type)) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Command '${command.type}' is unauthorized for Operator role`,
    };
  }

  private static checkSpeakerPermissions(
    state: StageSessionState,
    sender: DeviceState,
    command: StageCommand
  ): PermissionCheckResult {
    const restrictedForSpeaker = [
      "DEVICE_APPROVE",
      "DEVICE_REJECT",
      "DEVICE_REMOVE",
      "ROOM_CREATE",
      "CONTROL_TAKEOVER",
      "TIMER_SET",
      "TIMER_START",
      "TIMER_PAUSE",
      "TIMER_RESET",
      "BRIEF_UPDATE",
      "BRIEF_CLEAR",
      "DISPLAY_BLANK",
      "DISPLAY_SHOW",
      "SOURCE_TAKE_LIVE",
      "SOURCE_TAKE_OFFLINE",
    ];

    if (restrictedForSpeaker.includes(command.type)) {
      return {
        allowed: false,
        reason: `Speaker device cannot execute administrative or stage control command '${command.type}'`,
      };
    }

    // Material Precache and Telemetry Cache Reports are allowed
    if (command.type === "MATERIAL_PRECACHE_REQUEST" || command.type === "MATERIAL_CACHE_REPORT") {
      return { allowed: true };
    }

    // Material Ownership Checks for Speaker
    if (command.type === "MATERIAL_REMOVE") {
      const materialId = command.payload?.materialId;
      const targetMaterial = state.materials.find((m) => m.id === materialId);
      if (targetMaterial) {
        if (targetMaterial.ownerRole === "host" || (!targetMaterial.ownerDeviceId && targetMaterial.ownerUserId) || targetMaterial.ownerDeviceId === state.host?.hostDeviceId) {
          return {
            allowed: false,
            reason: "Speaker cannot delete Host-owned material",
          };
        }
        if (targetMaterial.ownerDeviceId && targetMaterial.ownerDeviceId !== sender.id) {
          return {
            allowed: false,
            reason: "Speaker cannot delete material owned by another participant",
          };
        }
      }
      return { allowed: true };
    }

    if (command.type === "MATERIAL_UPDATE") {
      const material = command.payload?.material;
      if (material) {
        const existing = state.materials.find((m) => m.id === material.id);
        if (existing) {
          if (existing.ownerRole === "host" || (!existing.ownerDeviceId && existing.ownerUserId) || existing.ownerDeviceId === state.host?.hostDeviceId) {
            return {
              allowed: false,
              reason: "Speaker cannot modify Host-owned material",
            };
          }
          if (existing.ownerDeviceId && existing.ownerDeviceId !== sender.id) {
            return {
              allowed: false,
              reason: "Speaker cannot modify material owned by another participant",
            };
          }
        }
      }
      return { allowed: true };
    }

    if (command.type === "MATERIAL_ADD") {
      return { allowed: true };
    }

    // Presentation Preparation & Navigation
    if (command.type === "PRESENTATION_START") {
      const materialId = command.payload?.materialId;
      const targetMaterial = state.materials.find((m) => m.id === materialId);
      if (targetMaterial) {
        // Speaker cannot start presentation of another Speaker's private material
        if (targetMaterial.ownerDeviceId && targetMaterial.ownerDeviceId !== sender.id && targetMaterial.ownerRole === "speaker") {
          return {
            allowed: false,
            reason: "Speaker cannot present material owned by another Speaker",
          };
        }
      }
      return { allowed: true };
    }

    // Speaker is allowed slide navigation, playback & zoom during presentation
    const allowedForSpeaker = [
      "SLIDE_NEXT",
      "SLIDE_PREVIOUS",
      "SLIDE_GOTO",
      "PRESENTATION_EXIT",
      "MEDIA_PLAY",
      "MEDIA_PAUSE",
      "MEDIA_SEEK",
      "MEDIA_STOP",
      "MEDIA_DURATION_UPDATE",
      "ZOOM_SET",
      "ZOOM_RESET",
    ];

    if (allowedForSpeaker.includes(command.type)) {
      return { allowed: true };
    }

    // Screen Share Lifecycle: Speaker can start/stop their own screen share
    if (command.type === "SCREEN_SHARE_START") {
      return { allowed: true };
    }

    if (command.type === "SCREEN_SHARE_STOP") {
      const targetDeviceId = command.payload?.targetDeviceId;
      // Speaker can only stop their own screen share
      if (targetDeviceId && targetDeviceId !== sender.id) {
        return {
          allowed: false,
          reason: "Speaker cannot stop another Speaker's screen share",
        };
      }
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Command '${command.type}' is unauthorized for Speaker role`,
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
