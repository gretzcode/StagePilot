import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { RoomRegistry } from "@/lib/rooms/registry";
import { createDisplayGrant } from "@/lib/auth/display-grant";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawRoomCode = searchParams.get("roomCode");

    if (!rawRoomCode) {
      return NextResponse.json({ error: "Missing room code" }, { status: 400 });
    }

    const roomCode = rawRoomCode.trim().toUpperCase();
    const room = await RoomRegistry.getRoomByCode(roomCode);

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.status !== "ACTIVE") {
      return NextResponse.json({ error: "Room is not active" }, { status: 400 });
    }

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

    const [audienceGrant, confidenceGrant] = await Promise.all([
      createDisplayGrant(roomCode, "audience", env),
      createDisplayGrant(roomCode, "confidence", env),
    ]);

    return NextResponse.json({
      roomCode,
      audienceGrant,
      confidenceGrant,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
