import { ClientMessage, ServerMessage, SyncStateServerMessage } from "./protocol";
import { StageCommand, StageSessionState } from "../types";

export type StateChangeCallback = (state: StageSessionState) => void;
export type ConnectionStatusCallback = (status: "connecting" | "connected" | "disconnected" | "reconnecting") => void;

export class StagePilotRealtimeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private roomCode: string;
  private deviceId: string;
  private stateListeners: Set<StateChangeCallback> = new Set();
  private statusListeners: Set<ConnectionStatusCallback> = new Set();
  private isExplicitDisconnect = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private currentState: StageSessionState | null = null;

  constructor(wsUrl: string, roomCode: string, deviceId: string) {
    this.url = wsUrl;
    this.roomCode = roomCode;
    this.deviceId = deviceId;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitDisconnect = false;
    this.notifyStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    try {
      this.ws = new WebSocket(`${this.url}?roomCode=${this.roomCode}&deviceId=${this.deviceId}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.notifyStatus("connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          this.handleServerMessage(message);
        } catch (e) {
          console.error("Failed to parse WebSocket server message:", e);
        }
      };

      this.ws.onclose = () => {
        this.notifyStatus("disconnected");
        if (!this.isExplicitDisconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    } catch (err) {
      console.error("Failed to initiate WebSocket connection:", err);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.isExplicitDisconnect = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStatus("disconnected");
  }

  sendCommand(command: StageCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cannot send command: WebSocket is not connected");
    }

    const message: ClientMessage = {
      type: "EXECUTE_COMMAND",
      messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      payload: command,
    };

    this.ws.send(JSON.stringify(message));
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateListeners.add(callback);
    if (this.currentState) {
      callback(this.currentState);
    }
    return () => this.stateListeners.delete(callback);
  }

  onStatusChange(callback: ConnectionStatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  getCurrentState(): StageSessionState | null {
    return this.currentState;
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case "SYNC_STATE": {
        const syncMsg = message as SyncStateServerMessage;
        this.currentState = syncMsg.state;
        this.stateListeners.forEach((listener) => listener(syncMsg.state));
        break;
      }
      case "PONG":
        break;
      case "ERROR":
        console.error(`Server Error [${message.code}]: ${message.message}`);
        break;
    }
  }

  private notifyStatus(status: "connecting" | "connected" | "disconnected" | "reconnecting"): void {
    this.statusListeners.forEach((listener) => listener(status));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);

    setTimeout(() => {
      if (!this.isExplicitDisconnect) {
        this.connect();
      }
    }, delay);
  }
}
