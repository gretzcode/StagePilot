import { NextResponse } from "next/server";
import { generateRoomCode } from "@/lib/utils";
import { verifyHostToken } from "@/lib/auth/jwt";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const cookieHeader = request.headers.get("cookie");
    const tokenFromCookie = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("stagepilot_host_token="))
      ?.split("=")[1];

    const token = tokenFromHeader || tokenFromCookie;
    const payload = token ? await verifyHostToken(token) : null;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title : "Main Stage — Production Session";
    const hostUserId = payload?.sub || (typeof body.hostUserId === "string" ? body.hostUserId : "host-default");

    const roomCode = generateRoomCode(6);
    const roomId = `room-${roomCode.toLowerCase()}`;

    return NextResponse.json({
      success: true,
      room: {
        roomId,
        roomCode,
        title,
        hostUserId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isActive: true,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create room";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
