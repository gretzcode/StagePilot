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
    const transactionId = readCookie(request, GOOGLE_OAUTH_TRANSACTION_COOKIE);
    const hostUser = await validateHostSessionRequest(request);

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;
    if (!code || !state || !transactionId || !hostUser) {
      return applySecurityHeaders(NextResponse.json({ error: "INVALID_OAUTH_STATE" }, { status: 400 }));
    }

    const store = new OAuthTransactionStore(env);
    const consumed = await store.consume(transactionId, await hashGoogleOAuthState(state), hostUser.id);
    if (!consumed) {
      return applySecurityHeaders(NextResponse.json({ error: "INVALID_OAUTH_STATE" }, { status: 400 }));
    }

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
