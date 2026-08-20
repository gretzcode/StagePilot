import { NextResponse } from "next/server";
import { RoomRegistry } from "@/lib/rooms/registry";
import { applySecurityHeaders } from "@/lib/security/headers";

export async function GET() {
  try {
    const rooms = await RoomRegistry.getActiveRooms();
    const sanitizedRooms = rooms.map((r) => ({
      roomCode: r.roomCode,
      title: r.name,
      createdAt: r.createdAt,
      status: r.status,
    }));
    return applySecurityHeaders(NextResponse.json({ success: true, rooms: sanitizedRooms }));
  } catch (err) {
    console.error("[api/room/active GET Error]", err);
    return applySecurityHeaders(NextResponse.json({ success: false, rooms: [] }, { status: 500 }));
  }
}
