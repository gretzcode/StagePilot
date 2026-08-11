import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createInitialSessionState } from "@/core/session/initial-state";
import { CommandDispatcher } from "@/core/commands/dispatcher";
import { ServerMessage } from "@/core/realtime/protocol";
import { StageCommand, StageSessionState } from "@/core/types";
import { RoomRegistry } from "@/lib/rooms/registry";
import { verifyHostToken } from "@/lib/auth/jwt";

interface LocalRoomInstance {
  state: StageSessionState;
}

const globalRoomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_LOCAL_ROOMS__ ||=
  new Map<string, LocalRoomInstance>()) as Map<string, LocalRoomInstance>;

function getOrCreateLocalRoom(roomCode: string, title: string, hostUserId: string): LocalRoomInstance {
  let instance = globalRoomsMap.get(roomCode);
  if (!instance) {
    instance = {
      state: createInitialSessionState(roomCode, roomCode, title, hostUserId),
    };
    globalRoomsMap.set(roomCode, instance);
  }
  return instance;
}

async function verifyHostUser(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const cookieHeader = request.headers.get("cookie");
  const tokenFromCookie = cookieHeader
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("stagepilot_session_id=") || c.startsWith("stagepilot_host_token="))
    ?.split("=")[1];

  const token = tokenFromHeader || tokenFromCookie;
  if (!token) return null;

  const payload = await verifyHostToken(token);
  return payload?.sub || null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roomCode = (url.searchParams.get("roomCode") || "").toUpperCase();
  const deviceId = url.searchParams.get("deviceId") || `dev-${Date.now()}`;
  const requestedRole = (url.searchParams.get("role") || "control") as "host" | "control" | "audience" | "confidence";
  const deviceName = url.searchParams.get("deviceName") || "Device";

  if (!roomCode || roomCode.length < 4) {
    return new Response(JSON.stringify({ error: "INVALID_ROOM_CODE" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // 1. Authoritative Room Existence Validation
  const roomRecord = await RoomRegistry.getRoomByCode(roomCode);
  if (!roomRecord) {
    return new Response(JSON.stringify({ error: "ROOM_NOT_FOUND" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }

  if (roomRecord.status !== "ACTIVE") {
    return new Response(JSON.stringify({ error: "ROOM_CLOSED" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // 2. Authoritative Host Ownership Validation for Host Role
  if (requestedRole === "host") {
    const authenticatedHostId = await verifyHostUser(request);
    if (!authenticatedHostId || authenticatedHostId !== roomRecord.hostUserId) {
      return new Response(JSON.stringify({ error: "ROOM_ACCESS_DENIED" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }
  }

  // 3. Durable Object Upgrade for Cloudflare Workers Production Environment
  if (process.env.NODE_ENV === "production") {
    try {
      let env: Record<string, unknown> | undefined;
      try {
        const cfCtx = await getCloudflareContext({ async: true });
        env = cfCtx.env as Record<string, unknown>;
      } catch {
        env = process.env as Record<string, unknown>;
      }

      if (env && env.STAGE_ROOM) {
        const stageRoomNs = env.STAGE_ROOM as {
          idFromName: (name: string) => { toString: () => string };
          get: (id: unknown) => { fetch: (req: Request) => Promise<Response> };
        };
        const doId = stageRoomNs.idFromName(roomCode);
        const stub = stageRoomNs.get(doId);
        const doUrl = new URL(request.url);
        doUrl.searchParams.set("hostUserId", roomRecord.hostUserId);
        doUrl.searchParams.set("title", roomRecord.name);
        return await stub.fetch(new Request(doUrl.toString(), request));
      }
    } catch {
      // Fall through to local state handler
    }
  }

  // 4. Local Dev / HTTP Fallback Handler
  const localRoom = getOrCreateLocalRoom(roomCode, roomRecord.name, roomRecord.hostUserId);
  const isHostRole = requestedRole === "host";

  if (isHostRole) {
    // Purge any stale previous host device entries so host count never increments on refresh/reconnect
    Object.keys(localRoom.state.devices).forEach((id) => {
      if (id !== deviceId && (localRoom.state.devices[id].role === "host" || localRoom.state.devices[id].isHostDevice)) {
        delete localRoom.state.devices[id];
      }
    });
  }

  if (!localRoom.state.devices[deviceId]) {
    const autoApprove = isHostRole;
    localRoom.state.devices[deviceId] = {
      id: deviceId,
      name: deviceName,
      userAgent: request.headers.get("user-agent") || "Unknown Browser",
      role: requestedRole,
      approvalStatus: autoApprove ? "approved" : "pending",
      status: "online",
      permissions: {
        canControlPresentation: isHostRole || requestedRole === "control",
        canControlTimer: isHostRole || requestedRole === "control",
        canControlBrief: isHostRole || requestedRole === "control",
        canBlankDisplay: isHostRole || requestedRole === "control",
        canManageDevices: isHostRole,
        canManageRoom: isHostRole,
        canTakeoverControl: isHostRole || requestedRole === "control",
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      isHostDevice: isHostRole,
    };

    if (isHostRole) {
      localRoom.state.host.isHostConnected = true;
      localRoom.state.host.hostDeviceId = deviceId;
      localRoom.state.activeControllerDeviceId = deviceId;
    }
  } else {
    localRoom.state.devices[deviceId].status = "online";
    localRoom.state.devices[deviceId].lastSeenAt = Date.now();
    if (isHostRole) {
      localRoom.state.host.isHostConnected = true;
      localRoom.state.host.hostDeviceId = deviceId;
      localRoom.state.activeControllerDeviceId = deviceId;
    }
  }

  const syncMsg: ServerMessage = {
    type: "SYNC_STATE",
    state: localRoom.state,
    timestamp: Date.now(),
  };

  return new Response(JSON.stringify(syncMsg), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      roomCode?: string;
      deviceId?: string;
      command?: StageCommand;
    };

    const roomCode = (body.roomCode || "").toUpperCase();
    const deviceId = body.deviceId || "unknown-dev";
    const command = body.command;

    if (!roomCode || !command) {
      return new Response(JSON.stringify({ error: "Missing room code or command payload" }), { status: 400 });
    }

    const roomRecord = await RoomRegistry.getRoomByCode(roomCode);
    if (!roomRecord) {
      return new Response(JSON.stringify({ error: "ROOM_NOT_FOUND" }), { status: 404 });
    }

    const localRoom = getOrCreateLocalRoom(roomCode, roomRecord.name, roomRecord.hostUserId);
    command.senderDeviceId = deviceId;

    // ── Durable Object Forwarding ───────────────────────────────────────────
    if (process.env.NODE_ENV === "production") {
      try {
        let env: Record<string, unknown> | undefined;
        try {
          const cfCtx = await getCloudflareContext({ async: true });
          env = cfCtx.env as Record<string, unknown>;
        } catch {
          env = process.env as Record<string, unknown>;
        }

        if (env && env.STAGE_ROOM) {
          const stageRoomNs = env.STAGE_ROOM as {
            idFromName: (name: string) => { toString: () => string };
            get: (id: unknown) => { fetch: (req: Request) => Promise<Response> };
          };
          const doId = stageRoomNs.idFromName(roomCode);
          const stub = stageRoomNs.get(doId);
          const doUrl = new URL(request.url);
          doUrl.searchParams.set("roomCode", roomCode);
          doUrl.searchParams.set("hostUserId", roomRecord.hostUserId);
          doUrl.searchParams.set("title", roomRecord.name);
          return await stub.fetch(new Request(doUrl.toString(), request));
        }
      } catch {
        // Fall back to local room handling
      }
    }

    localRoom.state = CommandDispatcher.dispatch(localRoom.state, command);

    return new Response(
      JSON.stringify({
        success: true,
        type: "SYNC_STATE",
        state: localRoom.state,
        timestamp: Date.now(),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Command execution error";
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}
