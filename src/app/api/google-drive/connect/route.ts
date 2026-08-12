import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import { buildGoogleAuthorizationUrl, createGoogleOAuthState, GOOGLE_OAUTH_STATE_COOKIE } from "@/lib/google-drive/oauth";

export async function GET(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;
  const state = await createGoogleOAuthState(env);
  const authorizationUrl = buildGoogleAuthorizationUrl(request, env, state);
  const response = NextResponse.redirect(authorizationUrl);
  response.headers.append(
    "Set-Cookie",
    `${GOOGLE_OAUTH_STATE_COOKIE}=${state}; Path=/api/google-drive; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );
  return applySecurityHeaders(response);
}
