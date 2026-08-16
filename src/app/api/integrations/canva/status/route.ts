import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import { CanvaService } from "@/features/integrations/canva/canva.service";

export async function GET(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(
      NextResponse.json({ connected: false, error: "UNAUTHORIZED" }, { status: 401 })
    );
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;

  const status = await CanvaService.getConnectionStatus(hostUser.id, env);
  return applySecurityHeaders(NextResponse.json(status));
}
