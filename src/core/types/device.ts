/**
 * Authoritative Participant Roles:
 * - host: Primary room owner / administrator with full permissions, authenticated via Control URL.
 * - operator: Control room crew participant joined via Join Room.
 * - speaker: Presenter / keynote participant joined via Join Room.
 */
export type ParticipantRole = "host" | "operator" | "speaker";

/**
 * Authoritative Display Modes:
 * - audience: Public stage projector / LED wall output rendering.
 * - confidence: Downstage monitor HUD timer & cue output rendering.
 */
export type DisplayMode = "audience" | "confidence";

/**
 * DeviceRole represents participant roles and backwards-compatible aliases.
 * Note: "control" is supported as an alias for "operator".
 * Display modes ("audience", "confidence") are supported for display session connections.
 */
export type DeviceRole = ParticipantRole | "control" | DisplayMode;

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

