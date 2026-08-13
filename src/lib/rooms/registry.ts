import { generateRoomCode } from "@/lib/utils";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { StorageRegistryResolver } from "@/lib/storage/registry";

export interface StageRoomRecord {
  roomId: string;
  roomCode: string;
  hostUserId: string;
  name: string;
  status: "ACTIVE" | "CLOSED" | "PAUSED";
  createdAt: number;
  updatedAt: number;
  closedAt?: number | null;
}

// Global in-memory storage fallback for dev/testing environments
const globalRoomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_ROOM_RECORDS__ ||=
  new Map<string, StageRoomRecord>()) as Map<string, StageRoomRecord>;

export class RoomRegistry {
  static async getRoomByCode(roomCode: string): Promise<StageRoomRecord | null> {
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) return null;

    // Check D1 database first if available
    try {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const db = (cfCtx?.env as Record<string, unknown>)?.DB as D1Database | undefined;
      if (db) {
        const stmt = db.prepare("SELECT * FROM rooms WHERE room_code = ? AND status = 'ACTIVE' LIMIT 1");
        const row = await stmt.bind(normalizedCode).first<Record<string, unknown>>();
        if (row) {
          return {
            roomId: String(row.id),
            roomCode: String(row.room_code),
            hostUserId: String(row.host_user_id),
            name: String(row.name),
            status: String(row.status) as "ACTIVE" | "CLOSED" | "PAUSED",
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
          };
        }
      }
    } catch {
      // Fall back to in-memory store
    }

    // Check in-memory registry
    for (const record of Array.from(globalRoomsMap.values())) {
      if (record.roomCode.toUpperCase() === normalizedCode && record.status === "ACTIVE") {
        return record;
      }
    }

    return null;
  }

  static async getRoomsByHost(hostUserId: string): Promise<StageRoomRecord[]> {
    if (!hostUserId) return [];

    const roomMap = new Map<string, StageRoomRecord>();

    // 1. Load from D1 database first
    try {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const db = (cfCtx?.env as Record<string, unknown>)?.DB as D1Database | undefined;
      if (db) {
        const stmt = db.prepare("SELECT * FROM rooms WHERE host_user_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC");
        const { results } = await stmt.bind(hostUserId).all<Record<string, unknown>>();
        if (results && results.length > 0) {
          results.forEach((row) => {
            const r: StageRoomRecord = {
              roomId: String(row.id),
              roomCode: String(row.room_code),
              hostUserId: String(row.host_user_id),
              name: String(row.name),
              status: String(row.status) as "ACTIVE" | "CLOSED" | "PAUSED",
              createdAt: Number(row.created_at),
              updatedAt: Number(row.updated_at),
            };
            roomMap.set(r.roomId, r);
          });
        }
      }
    } catch (err) {
      console.error("[RoomRegistry D1 getRoomsByHost Warning]", err);
    }

    // 2. Merge with in-memory global map
    for (const record of Array.from(globalRoomsMap.values())) {
      if (record.hostUserId === hostUserId && record.status === "ACTIVE") {
        roomMap.set(record.roomId, record);
      }
    }

    // 3. Auto-seed initial default room if host has 0 active rooms
    if (roomMap.size === 0) {
      const defaultRoom = await this.createRoom(hostUserId, "Main Stage — Production Session");
      roomMap.set(defaultRoom.roomId, defaultRoom);
    }

    return Array.from(roomMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  static async createRoom(hostUserId: string, name = "Main Stage — Production Session"): Promise<StageRoomRecord> {
    let roomCode = "";
    let attempts = 0;

    // Retry collision check up to 5 times
    while (attempts < 5) {
      attempts++;
      const candidateCode = generateRoomCode(6);
      const existing = await this.getRoomByCode(candidateCode);
      if (!existing) {
        roomCode = candidateCode;
        break;
      }
    }

    if (!roomCode) {
      throw new Error("Failed to generate a unique room code after 5 attempts");
    }

    const now = Date.now();
    const roomId = `room-${roomCode.toLowerCase()}-${now.toString(36)}`;
    const record: StageRoomRecord = {
      roomId,
      roomCode,
      hostUserId,
      name,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    // Store in global in-memory registry
    globalRoomsMap.set(record.roomId, record);

    // Store in D1 if available
    try {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const db = (cfCtx?.env as Record<string, unknown>)?.DB as D1Database | undefined;
      if (db) {
        // Ensure host user exists in users table to satisfy FOREIGN KEY constraint
        await db
          .prepare(
            "INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?) ON CONFLICT(id) DO NOTHING"
          )
          .bind(record.hostUserId, `${record.hostUserId}@kian.co`, "SYSTEM_HASH", record.createdAt, record.updatedAt)
          .run()
          .catch((err) => console.error("[RoomRegistry D1 User Upsert Warning]", err));

        await db
          .prepare(
            "INSERT INTO rooms (id, host_user_id, room_code, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .bind(record.roomId, record.hostUserId, record.roomCode, record.name, record.status, record.createdAt, record.updatedAt)
          .run();
      }
    } catch (err) {
      console.error("[RoomRegistry D1 Create Room Error]", err);
    }

    return record;
  }

  static async deleteRoom(roomIdentifier: string, hostUserId: string): Promise<boolean> {
    if (!roomIdentifier || !hostUserId) return false;

    const normalized = roomIdentifier.trim();
    let foundRoom: StageRoomRecord | null = null;

    // Search by roomId first, then roomCode
    for (const record of Array.from(globalRoomsMap.values())) {
      if (
        (record.roomId === normalized || record.roomCode.toUpperCase() === normalized.toUpperCase()) &&
        record.hostUserId === hostUserId
      ) {
        foundRoom = record;
        break;
      }
    }

    if (foundRoom) {
      foundRoom.status = "CLOSED";
      foundRoom.closedAt = Date.now();
      globalRoomsMap.delete(foundRoom.roomId);
    }

    // Deep delete in D1 and StorageRegistry if available
    try {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const db = (cfCtx?.env as Record<string, unknown>)?.DB as D1Database | undefined;
      if (db) {
        await db
          .prepare("DELETE FROM rooms WHERE (id = ? OR UPPER(room_code) = ?) AND host_user_id = ?")
          .bind(normalized, normalized.toUpperCase(), hostUserId)
          .run();

        await db
          .prepare("DELETE FROM material_registry WHERE UPPER(room_code) = ?")
          .bind(normalized.toUpperCase())
          .run();
      }

      const storageResolver = new StorageRegistryResolver(cfCtx?.env as Record<string, unknown>);
      const registry = storageResolver.getRegistry();
      const targetCode = foundRoom ? foundRoom.roomCode : normalized;
      await registry.deleteMaterialsByRoomCode(targetCode);
    } catch {
      // Ignore D1 error
    }

    return true;
  }
}
