import { NextResponse } from "next/server";
import { RoomRegistry } from "@/lib/rooms/registry";
import { verifyHostToken } from "@/lib/auth/jwt";

export async function POST(request: Request) {
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
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
    const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim() : "";

    const target = roomId || roomCode;
    if (!target) {
      return NextResponse.json({ error: "Missing roomId or roomCode" }, { status: 400 });
    }

    const success = await RoomRegistry.deleteRoom(target, hostUserId);

    return NextResponse.json({
      success,
      roomId: target,
      message: "Room deleted successfully",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete room";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  return POST(request);
}
