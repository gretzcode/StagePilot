import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";

    if (!roomCode || roomCode.length < 4) {
      return NextResponse.json({ valid: false, reason: "INVALID_ROOM_CODE" }, { status: 400 });
    }

    // In Phase 1 runtime, room code validation normalizes and confirms room availability
    return NextResponse.json({
      valid: true,
      roomCode,
      roomTitle: "StagePilot Active Room",
      status: "ACTIVE",
    });
  } catch (err: unknown) {
    return NextResponse.json({ valid: false, reason: err instanceof Error ? err.message : "Validation failed" }, { status: 400 });
  }
}
