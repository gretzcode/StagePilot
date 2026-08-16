import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import {
  buildCanvaAuthorizationUrl,
  createCanvaOAuthState,
  generateCodeChallengeS256,
  generateCodeVerifier,
  hashCanvaOAuthState,
  CANVA_OAUTH_TTL_MS,
  CANVA_OAUTH_TRANSACTION_COOKIE,
  CANVA_OAUTH_VERIFIER_COOKIE,
} from "@/features/integrations/canva/canva.oauth";
import { OAuthTransactionStore } from "@/lib/google-drive/oauth-transactions";

export async function GET(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }));
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;

  const state = createCanvaOAuthState();
  const stateHash = await hashCanvaOAuthState(state);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallengeS256(codeVerifier);

  const now = Date.now();
  const transactionId = crypto.randomUUID();
  const store = new OAuthTransactionStore(env);

  try {
    await store.create({
      id: transactionId,
      provider: "canva",
      stateHash,
      hostUserId: hostUser.id,
      createdAt: now,
      expiresAt: now + CANVA_OAUTH_TTL_MS,
      status: "pending",
      consumedAt: null,
    });
  } catch (err) {
    console.error("[CanvaOAuth] Failed to create transaction:", err);
    return applySecurityHeaders(
      NextResponse.json({ error: "CANVA_AUTH_INITIALIZATION_FAILED" }, { status: 500 })
    );
  }

  const authorizationUrl = buildCanvaAuthorizationUrl(request, env, state, codeChallenge);
  const response = NextResponse.redirect(authorizationUrl);

  const maxAge = CANVA_OAUTH_TTL_MS / 1000;
  response.headers.append(
    "Set-Cookie",
    `${CANVA_OAUTH_TRANSACTION_COOKIE}=${transactionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
  response.headers.append(
    "Set-Cookie",
    `${CANVA_OAUTH_VERIFIER_COOKIE}=${codeVerifier}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );

  return applySecurityHeaders(response);
}
