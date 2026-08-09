import { NextResponse } from "next/server";
import { RoomRegistry } from "@/lib/rooms/registry";
import { verifyHostToken } from "@/lib/auth/jwt";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const cookieHeader = request.headers.get("cookie");
    const tokenFromCookie = cookieHeader
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("stagepilot_session_id=") || c.startsWith("stagepilot_host_token="))
      ?.split("=")[1];

    const token = tokenFromHeader || tokenFromCookie;
    const payload = token ? await verifyHostToken(token) : null;

    if (!payload || !payload.sub) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const hostUserId = payload.sub;
    const rooms = await RoomRegistry.getRoomsByHost(hostUserId);

    return NextResponse.json({
      success: true,
      rooms: rooms.map((room) => ({
        roomId: room.roomId,
        roomCode: room.roomCode,
        title: room.name,
        hostUserId: room.hostUserId,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        isActive: room.status === "ACTIVE",
        status: room.status,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list rooms";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
