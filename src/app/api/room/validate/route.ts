import { NextResponse } from "next/server";
import { RoomRegistry } from "@/lib/rooms/registry";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";

    if (!roomCode || roomCode.length < 4) {
      return NextResponse.json({ valid: false, reason: "INVALID_ROOM_CODE", error: "INVALID_ROOM_CODE" }, { status: 400 });
    }

    // Authoritative room existence lookup in RoomRegistry
    const room = await RoomRegistry.getRoomByCode(roomCode);
    if (!room) {
      return NextResponse.json({ valid: false, reason: "ROOM_NOT_FOUND", error: "ROOM_NOT_FOUND" }, { status: 404 });
    }

    if (room.status !== "ACTIVE") {
      return NextResponse.json({ valid: false, reason: "ROOM_CLOSED", error: "ROOM_CLOSED" }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      roomCode: room.roomCode,
      roomId: room.roomId,
      roomTitle: room.name,
      hostUserId: room.hostUserId,
      status: room.status,
    });
  } catch (err: unknown) {
    return NextResponse.json({ valid: false, reason: err instanceof Error ? err.message : "Validation failed" }, { status: 500 });
  }
}
