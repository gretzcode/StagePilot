import { describe, it, expect } from "vitest";
import { RoomRegistry } from "../../src/lib/rooms/registry";

describe("RoomRegistry Unit & Lifecycle Tests", () => {
  it("should create independent room records with unique roomCodes and roomIds", async () => {
    const hostId = `host-test-${Date.now()}`;

    const roomA = await RoomRegistry.createRoom(hostId, "Room Alpha");
    const roomB = await RoomRegistry.createRoom(hostId, "Room Beta");

    expect(roomA.roomId).toBeDefined();
    expect(roomB.roomId).toBeDefined();
    expect(roomA.roomId).not.toBe(roomB.roomId);

    expect(roomA.roomCode).toHaveLength(6);
    expect(roomB.roomCode).toHaveLength(6);
    expect(roomA.roomCode).not.toBe(roomB.roomCode);

    expect(roomA.hostUserId).toBe(hostId);
    expect(roomB.hostUserId).toBe(hostId);
  });

  it("should retrieve rooms by code and by hostId", async () => {
    const hostId = `host-query-${Date.now()}`;

    const room = await RoomRegistry.createRoom(hostId, "Query Room");
    const fetchedByCode = await RoomRegistry.getRoomByCode(room.roomCode);

    expect(fetchedByCode).not.toBeNull();
    expect(fetchedByCode?.roomId).toBe(room.roomId);
    expect(fetchedByCode?.name).toBe("Query Room");

    const hostRooms = await RoomRegistry.getRoomsByHost(hostId);
    expect(hostRooms.length).toBeGreaterThanOrEqual(1);
    expect(hostRooms.some((r) => r.roomId === room.roomId)).toBe(true);
  });

  it("should return null for non-existent room codes", async () => {
    const nonExistent = await RoomRegistry.getRoomByCode("NONEXISTENT_999");
    expect(nonExistent).toBeNull();
  });

  it("should delete room record and remove it from active lookups", async () => {
    const hostId = `host-delete-${Date.now()}`;
    const room = await RoomRegistry.createRoom(hostId, "Room To Delete");

    expect(await RoomRegistry.getRoomByCode(room.roomCode)).not.toBeNull();

    const deleted = await RoomRegistry.deleteRoom(room.roomId, hostId);
    expect(deleted).toBe(true);

    expect(await RoomRegistry.getRoomByCode(room.roomCode)).toBeNull();

    const hostRooms = await RoomRegistry.getRoomsByHost(hostId);
    expect(hostRooms.some((r) => r.roomId === room.roomId)).toBe(false);
  });
});
