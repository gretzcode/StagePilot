import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createInitialSessionState } from "@/core/session/initial-state";
import { CommandDispatcher } from "@/core/commands/dispatcher";
import { ServerMessage } from "@/core/realtime/protocol";
import { StageCommand, StageSessionState } from "@/core/types";
import { RoomRegistry } from "@/lib/rooms/registry";
import { verifyHostToken } from "@/lib/auth/jwt";

import { MaterialRegistryService } from "@/lib/storage/registry";
import { Material } from "@/core/types";
import { createAssetGrant } from "@/lib/auth/asset-grant";

interface LocalRoomInstance {
  state: StageSessionState;
}

const globalRoomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_LOCAL_ROOMS__ ||=
  new Map<string, LocalRoomInstance>()) as Map<string, LocalRoomInstance>;

export function getLocalRoomStateReadOnly(roomCode: string): StageSessionState | null {
  const instance = globalRoomsMap.get(roomCode.toUpperCase());
  return instance ? instance.state : null;
}

export async function syncLocalRoomMaterials(roomCode: string): Promise<void> {
  const upperCode = roomCode.toUpperCase();
  const instance = globalRoomsMap.get(upperCode);
  if (!instance) return;

  const registry = new MaterialRegistryService(process.env as Record<string, unknown>);
  const records = await registry.getMaterialsByRoomCode(upperCode);

  for (const record of records) {
    if (record.status === "ready" && !instance.state.materials.some((m) => m.id === record.id)) {
      const grant = await createAssetGrant(upperCode, record.id, process.env as Record<string, unknown>);
      const assetUrl = `/api/material/asset?materialId=${record.id}&roomCode=${encodeURIComponent(upperCode)}&grant=${encodeURIComponent(grant)}`;
      const totalPages = record.slideCount || 1;
      instance.state.materials.push({
        id: record.id,
        name: record.title,
        type: record.materialType,
        sourceType: record.sourceType,
        url: assetUrl,
        objectKey: record.objectKey,
        externalUrl: record.externalUrl,
        sizeBytes: record.sizeBytes,
        totalPages,
        slides: Array.from({ length: totalPages }, (_, index) => ({
          index: index + 1,
          title: `Slide ${index + 1}`,
          contentUrl: assetUrl,
        })),
        uploadedAt: record.createdAt,
        expiresAt: record.expiresAt,
        ownerUserId: record.ownerUserId,
        roomCode: upperCode,
        status: record.status,
        metadata: {
          title: record.title,
          pageCount: totalPages,
          fileSize: record.sizeBytes,
          mimeType: record.mimeType,
        },
      });
    }
  }
}

export function registerLocalRoomMaterial(roomCode: string, material: Material): void {
  const upperCode = roomCode.toUpperCase();
  const instance = globalRoomsMap.get(upperCode);
  if (!instance) return;

  const existingIdx = instance.state.materials.findIndex((m) => m.id === material.id);
  if (existingIdx >= 0) {
    instance.state.materials[existingIdx] = material;
  } else {
    instance.state.materials.push(material);
  }
}

function getOrCreateLocalRoom(roomCode: string, title: string, hostUserId: string): LocalRoomInstance {
  const upperCode = roomCode.toUpperCase();
  let instance = globalRoomsMap.get(upperCode);
  if (!instance) {
    instance = {
      state: createInitialSessionState(upperCode, upperCode, title, hostUserId),
    };
    globalRoomsMap.set(upperCode, instance);
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

  // 3. Durable Object Upgrade for Cloudflare Workers Environment
  try {
    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

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
  } catch (err) {
    console.warn("[api/ws/GET] DO forward fallback:", err);
  }

  // 4. Local Dev / HTTP Fallback Handler
  const localRoom = getOrCreateLocalRoom(roomCode, roomRecord.name, roomRecord.hostUserId);
  await syncLocalRoomMaterials(roomCode);
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
        canManageDevices: isHostRole || requestedRole === "control",
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
    try {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const env = (cfCtx?.env || process.env) as Record<string, unknown>;

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
    } catch (err) {
      console.warn("[api/ws/POST] DO forward fallback:", err);
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
