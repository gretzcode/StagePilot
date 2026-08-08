export type DeviceRole = "host" | "control" | "audience" | "confidence";

export type DeviceApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "revoked";

export type DeviceStatus = "online" | "offline" | "reconnecting";

export interface DevicePermissions {
  canControlPresentation: boolean;
  canControlTimer: boolean;
  canControlBrief: boolean;
  canBlankDisplay: boolean;
  canManageDevices: boolean;
  canManageRoom: boolean;
  canTakeoverControl: boolean;
}

export interface DeviceState {
  id: string;
  name: string;
  userAgent: string;
  role: DeviceRole;
  approvalStatus: DeviceApprovalStatus;
  status: DeviceStatus;
  permissions: DevicePermissions;
  connectedAt: number;
  lastSeenAt: number;
  isHostDevice: boolean;
}
