import { DeviceRole, StageCommand, StageSessionState } from "../types";

export type ClientMessageType = "JOIN_ROOM" | "RECONNECT" | "EXECUTE_COMMAND" | "PING";

export interface JoinRoomPayload {
  roomCode: string;
  deviceName: string;
  requestedRole: DeviceRole;
  userAgent: string;
  hostToken?: string;
}

export interface ReconnectPayload {
  roomCode: string;
  deviceId: string;
  sessionToken: string;
}

export interface ClientMessage {
  type: ClientMessageType;
  messageId: string;
  payload: JoinRoomPayload | ReconnectPayload | StageCommand | { timestamp: number };
}

export type ServerMessageType =
  | "SYNC_STATE"
  | "COMMAND_ACK"
  | "DEVICE_JOIN_REQUESTED"
  | "DEVICE_STATUS_CHANGED"
  | "ERROR"
  | "PONG";

export interface SyncStateServerMessage {
  type: "SYNC_STATE";
  state: StageSessionState;
  timestamp: number;
}

export interface CommandAckServerMessage {
  type: "COMMAND_ACK";
  commandId: string;
  status: "success" | "error";
  error?: string;
  timestamp: number;
}

export interface DeviceJoinRequestedServerMessage {
  type: "DEVICE_JOIN_REQUESTED";
  deviceId: string;
  deviceName: string;
  requestedRole: DeviceRole;
  userAgent: string;
  timestamp: number;
}

export interface DeviceStatusChangedServerMessage {
  type: "DEVICE_STATUS_CHANGED";
  deviceId: string;
  approvalStatus: string;
  status: string;
  timestamp: number;
}

export interface ErrorServerMessage {
  type: "ERROR";
  code: string;
  message: string;
  timestamp: number;
}

export interface PongServerMessage {
  type: "PONG";
  timestamp: number;
}

export type ServerMessage =
  | SyncStateServerMessage
  | CommandAckServerMessage
  | DeviceJoinRequestedServerMessage
  | DeviceStatusChangedServerMessage
  | ErrorServerMessage
  | PongServerMessage;
