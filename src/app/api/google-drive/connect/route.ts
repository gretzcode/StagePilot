import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import {
  buildGoogleAuthorizationUrl,
  buildOAuthTransactionCookie,
  createGoogleOAuthState,
  GOOGLE_OAUTH_TTL_MS,
  hashGoogleOAuthState,
} from "@/lib/google-drive/oauth";
import { OAuthTransactionStore } from "@/lib/google-drive/oauth-transactions";

export async function GET(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;
  const state = createGoogleOAuthState();
  const now = Date.now();
  const transactionId = crypto.randomUUID();
  const store = new OAuthTransactionStore(env);
  await store.create({
    id: transactionId,
    provider: "google_drive",
    stateHash: await hashGoogleOAuthState(state),
    hostUserId: hostUser.id,
    createdAt: now,
    expiresAt: now + GOOGLE_OAUTH_TTL_MS,
    status: "pending",
    consumedAt: null,
  });
  const authorizationUrl = buildGoogleAuthorizationUrl(request, env, state);
  const response = NextResponse.redirect(authorizationUrl);
  response.headers.append("Set-Cookie", buildOAuthTransactionCookie(request, transactionId, GOOGLE_OAUTH_TTL_MS / 1000));
  return applySecurityHeaders(response);
}
