import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { IntegrationCredentialStore } from "@/lib/integrations/credential-store";

export async function GET(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;
  const credStore = new IntegrationCredentialStore(env);
  const cred = (await credStore.getCredential(hostUser.id, "google_drive")) || (await credStore.getAnyCredential("google_drive"));

  const provider = new GoogleDriveStorageProvider(env);
  const configured = await provider.isAvailable();
  const connected = Boolean(cred?.accessToken || cred?.refreshToken || provider.hasSecretRefreshToken());

  return applySecurityHeaders(
    NextResponse.json({
      provider: "google_drive",
      configured,
      connected,
      account: cred?.accountEmail || cred?.accountName || (connected ? "Operator Google Drive" : null),
    })
  );
}
