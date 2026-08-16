import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import { CanvaService } from "@/features/integrations/canva/canva.service";

export async function GET(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;

  try {
    const designs = await CanvaService.listUserDesigns(hostUser.id, env);
    return applySecurityHeaders(NextResponse.json({ success: true, designs }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to list Canva designs";
    return applySecurityHeaders(
      NextResponse.json({ success: false, error: msg, designs: [] }, { status: 400 })
    );
  }
}
