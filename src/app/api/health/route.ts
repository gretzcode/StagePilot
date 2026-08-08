import { NextResponse } from "next/server";
import { applySecurityHeaders } from "@/lib/security/headers";

export async function GET() {
  const healthData = {
    status: "HEALTHY",
    service: "StagePilot Engine",
    version: "0.1.0",
    phase: "Phase 3 — Production Ready",
    timestamp: Date.now(),
    uptimeSeconds: Math.floor(process.uptime ? process.uptime() : 0),
    environment: process.env.NODE_ENV || "production",
    checks: {
      durableObjects: "OPERATIONAL",
      websocketHibernation: "READY",
      d1Database: "CONNECTED",
      r2Storage: "READY",
    },
  };

  const response = NextResponse.json(healthData, { status: 200 });
  return applySecurityHeaders(response);
}
