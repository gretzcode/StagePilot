import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";

export async function GET(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;
  const provider = new GoogleDriveStorageProvider(env);
  const configured = await provider.isAvailable();

  return applySecurityHeaders(
    NextResponse.json({
      provider: "google_drive",
      configured,
      connected: configured,
      account: configured ? "Operator Google Drive" : null,
    })
  );
}
