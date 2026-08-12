import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { applySecurityHeaders } from "@/lib/security/headers";
import { validateHostSessionRequest } from "@/lib/auth/session";
import {
  buildOAuthTransactionCookie,
  exchangeGoogleCodeForRefreshToken,
  GOOGLE_OAUTH_TRANSACTION_COOKIE,
  hashGoogleOAuthState,
  readCookie,
} from "@/lib/google-drive/oauth";
import { OAuthTransactionStore } from "@/lib/google-drive/oauth-transactions";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    const receivedStateHash = state ? await hashGoogleOAuthState(state) : "";
    const transactionId = readCookie(request, GOOGLE_OAUTH_TRANSACTION_COOKIE);
    const hostUser = await validateHostSessionRequest(request);

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;
    const store = new OAuthTransactionStore(env);
    const transaction = transactionId ? await store.findById(transactionId) : null;
    const now = Date.now();
    const diagnostics = {
      codePresent: Boolean(code),
      statePresent: Boolean(state),
      receivedStateFingerprint: receivedStateHash ? receivedStateHash.slice(0, 12) : null,
      transactionId: transactionId ? transactionId.slice(0, 12) : null,
      cookiePresent: Boolean(transactionId),
      hostUserId: hostUser?.id || null,
      transactionFound: Boolean(transaction),
      transactionStateFingerprint: transaction?.stateHash.slice(0, 12) || null,
      transactionHostUserId: transaction?.hostUserId || null,
      stateFingerprintMatched: Boolean(transaction && receivedStateHash && transaction.stateHash === receivedStateHash),
      hostMatched: Boolean(transaction && hostUser && transaction.hostUserId === hostUser.id),
      expired: transaction ? transaction.expiresAt <= now : null,
      consumed: transaction ? transaction.status === "consumed" : null,
      storage: store.storageKind,
      requestOrigin: url.origin,
    };
    console.info("[OAuth][CALLBACK]", diagnostics);

    if (!code || !state || !transactionId || !hostUser) {
      return applySecurityHeaders(NextResponse.json({ error: "INVALID_OAUTH_STATE" }, { status: 400 }));
    }

    const consumed = await store.consume(transactionId, receivedStateHash, hostUser.id);
    if (!consumed) {
      console.info("[OAuth][CALLBACK_CONSUME_FAILED]", diagnostics);
      return applySecurityHeaders(NextResponse.json({ error: "INVALID_OAUTH_STATE" }, { status: 400 }));
    }
    console.info("[OAuth][CALLBACK_CONSUMED]", {
      transactionId: transactionId.slice(0, 12),
      receivedStateFingerprint: receivedStateHash.slice(0, 12),
      hostUserId: hostUser.id,
      storage: store.storageKind,
    });

    const refreshToken = await exchangeGoogleCodeForRefreshToken(request, env, code);
    const response = new NextResponse(
      `Google Drive berhasil diotorisasi.\n\nSimpan refresh token ini sebagai Cloudflare Secret:\n\nnpx wrangler secret put GOOGLE_REFRESH_TOKEN\n\nRefresh token:\n${refreshToken}\n\nSetelah tersimpan, refresh dashboard StagePilot.`,
      { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
    response.headers.append("Set-Cookie", buildOAuthTransactionCookie(request, "", 0));
    return applySecurityHeaders(response);
  } catch (err: unknown) {
    return applySecurityHeaders(
      NextResponse.json(
        { error: "GOOGLE_DRIVE_CONNECT_FAILED", message: err instanceof Error ? err.message : "Google Drive gagal tersambung." },
        { status: 400 }
      )
    );
  }
}
