import { NextResponse } from "next/server";
import { verifyHostToken } from "@/lib/auth/jwt";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    
    const cookieHeader = request.headers.get("cookie");
    const tokenFromCookie = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("stagepilot_host_token="))
      ?.split("=")[1];

    const token = tokenFromHeader || tokenFromCookie;
    if (!token) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    const payload = await verifyHostToken(token);
    if (!payload) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        role: "host",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ authenticated: false, error: err instanceof Error ? err.message : "Unauthorized" }, { status: 401 });
  }
}
