
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyHostToken } from "./lib/auth/jwt";

export const config = {
  matcher: ["/dashboard/:path*", "/control/:path*"],
};

export async function proxy(request: NextRequest) {
  const cookieHeader = request.headers.get("cookie");
  const tokenFromCookie = cookieHeader
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("stagepilot_session_id=") || c.startsWith("stagepilot_host_token="))
    ?.split("=")[1];

  const authHeader = request.headers.get("authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

  const token = tokenFromHeader || tokenFromCookie;

  // Allow ONLY /control/presentation for guest operators with explicit role=control
  const isGuestPresentationControl =
    request.nextUrl.pathname === "/control/presentation" &&
    request.nextUrl.searchParams.has("roomCode") &&
    request.nextUrl.searchParams.get("role") === "control";

  if (isGuestPresentationControl) {
    return NextResponse.next();
  }

  const redirectTarget = request.nextUrl.pathname + request.nextUrl.search;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", redirectTarget);
    return NextResponse.redirect(loginUrl);
  }

  const payload = await verifyHostToken(token);
  if (!payload || payload.role !== "host") {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", redirectTarget);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export async function middleware(request: NextRequest) {
  return proxy(request);
}
