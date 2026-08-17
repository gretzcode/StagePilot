import { DurableObject } from "cloudflare:workers";
import { StageSessionState, StageCommand } from "../src/core/types";
import { createInitialSessionState } from "../src/core/session/initial-state";
import { CommandDispatcher } from "../src/core/commands/dispatcher";
import { ClientMessage, ServerMessage } from "../src/core/realtime/protocol";

export interface Env {
  STAGE_ROOM: DurableObjectNamespace;
  JWT_SECRET: string;
}

export class StageRoom extends DurableObject {
  private state: StageSessionState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomCode = url.searchParams.get("roomCode") || "DEFAULT";
    const title = url.searchParams.get("title") || "Stage Room";
    const hostUserId = url.searchParams.get("hostUserId") || "host-user";

    // ── READ-ONLY state query (used by asset authorization) ──────────────────
    // DOES NOT register devices, mutate state, persist, or broadcast.
    if (url.searchParams.get("action") === "readonly_state") {
      if (!this.state) {
        const savedStateStr = await this.ctx.storage.get<string>("state");
        if (savedStateStr) {
          this.state = JSON.parse(savedStateStr) as import("../src/core/types").StageSessionState;
        } else {
          return new Response(JSON.stringify({ error: "ROOM_NOT_INITIALIZED" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      return new Response(
        JSON.stringify({ type: "SYNC_STATE", state: this.state, timestamp: Date.now() }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── HTTP POST: command execution fallback (when WebSocket is unavailable) ──
    if (request.method === "POST") {
      try {
        const body = (await request.json().catch(() => ({}))) as {
          roomCode?: string;
          deviceId?: string;
          command?: StageCommand;
        };
        const deviceId = body.deviceId || "unknown-dev";
        const command = body.command;

        await this.ensureStateLoaded(roomCode, title, hostUserId);

        if (command && this.state) {
          command.senderDeviceId = deviceId;
          if (!this.state.devices[deviceId]) {
            this.state.devices[deviceId] = {
              id: deviceId,
              name: "Stage Controller",
              userAgent: "HTTP Client",
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
          this.state = CommandDispatcher.dispatch(this.state, command);
          await this.persistState();
          this.broadcastState();
        }

        return new Response(
          JSON.stringify({ success: true, type: "SYNC_STATE", state: this.state, timestamp: Date.now() }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Command error";
        return new Response(JSON.stringify({ error: msg }), { status: 500 });
      }
    }

    const deviceId = url.searchParams.get("deviceId") || `dev-${Date.now()}`;
    const requestedRole = (url.searchParams.get("role") || "control") as "host" | "control" | "audience" | "confidence";
    const deviceName = url.searchParams.get("deviceName") || "Device";

    // Ensure session state is loaded or created
    await this.ensureStateLoaded(roomCode, title, hostUserId);

    if (!this.state) {
      return new Response("Failed to initialize room state", { status: 500 });
    }

    const isHostRole = requestedRole === "host";

    if (isHostRole) {
      // Purge any stale previous host device entries so host count remains exactly 1
      for (const id of Object.keys(this.state.devices)) {
        if (id !== deviceId && (this.state.devices[id].role === "host" || this.state.devices[id].isHostDevice)) {
          delete this.state.devices[id];
        }
      }
    }

    // Register or update device connection status in state
    const existingDevice = this.state.devices[deviceId];
    if (existingDevice) {
      existingDevice.status = "online";
      existingDevice.lastSeenAt = Date.now();
      if (isHostRole) {
        existingDevice.role = "host";
        existingDevice.approvalStatus = "approved";
        existingDevice.isHostDevice = true;
        this.state.host.isHostConnected = true;
        this.state.host.hostDeviceId = deviceId;
        this.state.activeControllerDeviceId = deviceId;
      }
      existingDevice.permissions = {
        canControlPresentation: isHostRole || existingDevice.role === "control",
        canControlTimer: isHostRole || existingDevice.role === "control",
        canControlBrief: isHostRole || existingDevice.role === "control",
        canBlankDisplay: isHostRole || existingDevice.role === "control",
        canManageDevices: isHostRole || existingDevice.role === "control",
        canManageRoom: isHostRole,
        canTakeoverControl: isHostRole || existingDevice.role === "control",
      };
    } else {
      const autoApprove = isHostRole;
      this.state.devices[deviceId] = {
        id: deviceId,
        name: deviceName,
        userAgent: request.headers.get("User-Agent") || "Unknown Browser",
        role: requestedRole,
        approvalStatus: autoApprove ? "approved" : "pending",
        status: "online",
        permissions: {
          canControlPresentation: isHostRole || requestedRole === "control",
          canControlTimer: isHostRole || requestedRole === "control",
          canControlBrief: isHostRole || requestedRole === "control",
          canBlankDisplay: isHostRole || requestedRole === "control",
          canManageDevices: isHostRole || requestedRole === "control",
          canManageRoom: isHostRole,
          canTakeoverControl: isHostRole || requestedRole === "control",
        },
        connectedAt: Date.now(),
        lastSeenAt: Date.now(),
        isHostDevice: isHostRole,
      };

      if (isHostRole) {
        this.state.host.isHostConnected = true;
        this.state.host.hostDeviceId = deviceId;
        this.state.activeControllerDeviceId = deviceId;
      }
    }

    await this.persistState();
    this.broadcastState();

    // ── HTTP GET (non-WebSocket): return current state for polling ─────────────
    if (request.headers.get("Upgrade") !== "websocket") {
      const syncMsg: ServerMessage = { type: "SYNC_STATE", state: this.state, timestamp: Date.now() };
      return new Response(JSON.stringify(syncMsg), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Use WebSocket Hibernation API: accept and tag connection with deviceId and role
    this.ctx.acceptWebSocket(server, [deviceId, requestedRole]);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;

    try {
      const clientMsg: ClientMessage = JSON.parse(message);
      const tags = this.ctx.getTags(ws);
      const tagSenderId = tags && tags.length > 0 ? tags[0] : undefined;
      const senderDeviceId = tagSenderId || (clientMsg as { payload?: { senderDeviceId?: string } })?.payload?.senderDeviceId || "unknown-device";

      // Hibernation state safety: Ensure state is loaded from storage after wake up
      await this.ensureStateLoaded("ROOM", "Stage Room", "host-user");

      if (clientMsg.type === "PING") {
        if (this.state) {
          const syncMsg: ServerMessage = { type: "SYNC_STATE", state: this.state, timestamp: Date.now() };
          ws.send(JSON.stringify(syncMsg));
        } else {
          const pong: ServerMessage = { type: "PONG", timestamp: Date.now() };
          ws.send(JSON.stringify(pong));
        }
        return;
      }

      if (clientMsg.type === "EXECUTE_COMMAND") {
        const command = clientMsg.payload as StageCommand;
        command.senderDeviceId = senderDeviceId;

        if (!this.state) {
          throw new Error("Room state is uninitialized");
        }

        // Execute command deterministically through domain reducer & validators
        this.state = CommandDispatcher.dispatch(this.state, command);
        await this.persistState();

        // Broadcast updated state to all connected WebSockets
        this.broadcastState();

        // Acknowledge command sender
        const ack: ServerMessage = {
          type: "COMMAND_ACK",
          commandId: command.commandId,
          status: "success",
          timestamp: Date.now(),
        };
        ws.send(JSON.stringify(ack));
        return;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Internal command error";
      const errResponse: ServerMessage = {
        type: "ERROR",
        code: "COMMAND_FAILED",
        message: errorMessage,
        timestamp: Date.now(),
      };
      ws.send(JSON.stringify(errResponse));
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const deviceId = tags[0];

    await this.ensureStateLoaded("ROOM", "Stage Room", "host-user");

    if (this.state && deviceId && this.state.devices[deviceId]) {
      this.state.devices[deviceId].status = "offline";
      this.state.devices[deviceId].lastSeenAt = Date.now();

      if (this.state.host.hostDeviceId === deviceId) {
        this.state.host.isHostConnected = false;
      }

      await this.persistState();
      this.broadcastState();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("Durable Object WebSocket error:", error);
  }

  private async ensureStateLoaded(roomCode: string, title: string, hostUserId: string): Promise<void> {
    if (this.state) return;

    // Load from SQLite-backed Durable Object storage
    const savedStateStr = await this.ctx.storage.get<string>("state");
    if (savedStateStr) {
      this.state = JSON.parse(savedStateStr);
      // Deduplicate host devices in state: keep at most 1 active host device
      if (this.state && this.state.devices) {
        const devices = this.state.devices;
        const hostIds = Object.keys(devices).filter(
          (id) => devices[id]?.role === "host" || devices[id]?.isHostDevice
        );
        if (hostIds.length > 1) {
          const primaryHostId = this.state.host.hostDeviceId || hostIds[0];
          for (const id of hostIds) {
            if (id !== primaryHostId) {
              delete devices[id];
            }
          }
        }
      }
    } else {
      this.state = createInitialSessionState(roomCode, roomCode, title, hostUserId);
      await this.persistState();
    }
  }

  private async persistState(): Promise<void> {
    if (this.state) {
      await this.ctx.storage.put("state", JSON.stringify(this.state));
    }
  }

  private broadcastState(): void {
    if (!this.state) return;

    const syncMsg: ServerMessage = {
      type: "SYNC_STATE",
      state: this.state,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(syncMsg);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch (err) {
        console.error("Failed to send message to websocket connection:", err);
      }
    }
  }
}
