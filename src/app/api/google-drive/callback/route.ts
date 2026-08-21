import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { applySecurityHeaders } from "@/lib/security/headers";
import { validateHostSessionRequest } from "@/lib/auth/session";
import {
  buildOAuthTransactionCookie,
  exchangeGoogleCodeForTokens,
  GOOGLE_OAUTH_TRANSACTION_COOKIE,
  hashGoogleOAuthState,
  readCookie,
} from "@/lib/google-drive/oauth";
import { OAuthTransactionStore } from "@/lib/google-drive/oauth-transactions";
import { IntegrationCredentialStore } from "@/lib/integrations/credential-store";
import { resetGoogleDriveTokenCache } from "@/features/material/storage/providers/google-drive";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const receivedStateHash = state ? await hashGoogleOAuthState(state) : "";
    const transactionId = readCookie(request, GOOGLE_OAUTH_TRANSACTION_COOKIE);
    const hostUser = await validateHostSessionRequest(request);

    if (!code || !state || !transactionId || !hostUser) {
      const redirectUrl = new URL("/dashboard?gdrive=error&msg=INVALID_OAUTH_STATE", url.origin);
      return NextResponse.redirect(redirectUrl);
    }

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;
    const store = new OAuthTransactionStore(env);

    const consumed = await store.consume(transactionId, receivedStateHash, hostUser.id);
    if (!consumed) {
      console.warn("[OAuth][CALLBACK_CONSUME_FAILED] Invalid or expired Google OAuth state");
      const redirectUrl = new URL("/dashboard?gdrive=error&msg=STATE_EXPIRED_OR_MISMATCH", url.origin);
      return NextResponse.redirect(redirectUrl);
    }

    // 1. Exchange authorization code for tokens
    const tokens = await exchangeGoogleCodeForTokens(request, env, code);

    // 2. Fetch Google User profile / email for display metadata
    let accountName = "Google Drive User";
    let accountEmail: string | null = null;
    try {
      const aboutRes = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (aboutRes.ok) {
        const aboutJson = (await aboutRes.json().catch(() => null)) as {
          user?: { displayName?: string; emailAddress?: string };
        } | null;
        if (aboutJson?.user?.displayName) accountName = aboutJson.user.displayName;
        if (aboutJson?.user?.emailAddress) accountEmail = aboutJson.user.emailAddress;
      }
    } catch {
      // Non-fatal
    }

    // 3. Store credentials securely in D1 database
    const credStore = new IntegrationCredentialStore(env);
    const now = Date.now();
    const expiresAt = now + (tokens.expires_in || 3600) * 1000;
    const scopes = tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [];

    await credStore.saveCredential({
      userId: hostUser.id,
      provider: "google_drive",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      tokenType: tokens.token_type || "Bearer",
      expiresAt,
      scopes,
      accountEmail,
      accountName,
    });
    resetGoogleDriveTokenCache();

    const redirectUrl = new URL("/dashboard?gdrive=connected", url.origin);
    const response = NextResponse.redirect(redirectUrl);
    response.headers.append("Set-Cookie", buildOAuthTransactionCookie(request, "", 0));
    return applySecurityHeaders(response);
  } catch (err: unknown) {
    console.error("[GoogleDriveOAuth] Callback processing error:", err);
    const msg = err instanceof Error ? err.message : "OAuth exchange failed";
    const redirectUrl = new URL("/dashboard?gdrive=error&msg=" + encodeURIComponent(msg), request.url);
    return applySecurityHeaders(NextResponse.redirect(redirectUrl));
  }
}
