import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import {
  exchangeCanvaCodeForTokens,
  hashCanvaOAuthState,
  CANVA_OAUTH_TRANSACTION_COOKIE,
  CANVA_OAUTH_VERIFIER_COOKIE,
} from "@/features/integrations/canva/canva.oauth";
import { CanvaClient } from "@/features/integrations/canva/canva.client";
import { OAuthTransactionStore } from "@/lib/google-drive/oauth-transactions";
import { IntegrationCredentialStore } from "@/lib/integrations/credential-store";

function readCookie(request: Request, name: string): string {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const error = url.searchParams.get("error") || "";
    const errorDescription = url.searchParams.get("error_description") || "";

    if (error) {
      console.warn("[CanvaOAuth] Authorization denied or failed:", { error, errorDescription });
      const redirectUrl = new URL("/dashboard?canva=error&msg=" + encodeURIComponent(errorDescription || error), url.origin);
      return NextResponse.redirect(redirectUrl);
    }

    const hostUser = await validateHostSessionRequest(request);
    const transactionId = readCookie(request, CANVA_OAUTH_TRANSACTION_COOKIE);
    const codeVerifier = readCookie(request, CANVA_OAUTH_VERIFIER_COOKIE);

    if (!code || !state || !transactionId || !codeVerifier || !hostUser) {
      const redirectUrl = new URL("/dashboard?canva=error&msg=INVALID_OAUTH_STATE", url.origin);
      return NextResponse.redirect(redirectUrl);
    }

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

    const store = new OAuthTransactionStore(env);
    const receivedStateHash = await hashCanvaOAuthState(state);

    const consumed = await store.consume(transactionId, receivedStateHash, hostUser.id);
    if (!consumed) {
      console.warn("[CanvaOAuth] Transaction consume failed (invalid or expired state)");
      const redirectUrl = new URL("/dashboard?canva=error&msg=STATE_EXPIRED_OR_MISMATCH", url.origin);
      return NextResponse.redirect(redirectUrl);
    }

    // 1. Exchange authorization code for tokens
    const tokens = await exchangeCanvaCodeForTokens(request, env, code, codeVerifier);

    // 2. Fetch user profile for display metadata
    let accountName = "Canva User";
    let accountEmail: string | null = null;
    try {
      const client = new CanvaClient(tokens.access_token);
      const profile = await client.getUserProfile();
      if (profile.display_name) accountName = profile.display_name;
      if (profile.email) accountEmail = profile.email;
    } catch {
      // Non-fatal
    }

    // 3. Store credentials securely
    const credStore = new IntegrationCredentialStore(env);
    const now = Date.now();
    const expiresAt = now + (tokens.expires_in || 3600) * 1000;
    const scopes = tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [];

    await credStore.saveCredential({
      userId: hostUser.id,
      provider: "canva",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenType: tokens.token_type || "Bearer",
      expiresAt,
      scopes,
      accountEmail,
      accountName,
    });

    const response = NextResponse.redirect(new URL("/dashboard?canva=connected", url.origin));

    // Clear transaction cookies
    response.headers.append("Set-Cookie", `${CANVA_OAUTH_TRANSACTION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    response.headers.append("Set-Cookie", `${CANVA_OAUTH_VERIFIER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);

    return applySecurityHeaders(response);
  } catch (err: unknown) {
    console.error("[CanvaOAuth] Callback processing error:", err);
    const msg = err instanceof Error ? err.message : "OAuth exchange failed";
    const redirectUrl = new URL("/dashboard?canva=error&msg=" + encodeURIComponent(msg), request.url);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }
}
