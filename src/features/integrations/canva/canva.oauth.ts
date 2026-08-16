import { IntegrationCredentialStore } from "@/lib/integrations/credential-store";
import { CanvaTokenResponse } from "./canva.types";

export const CANVA_OAUTH_SCOPES = ["design:meta:read", "design:content:read", "profile:read"];
const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
export const CANVA_OAUTH_TRANSACTION_COOKIE = "__Host-STAGEPILOT_CANVA_OAUTH_TX";
export const CANVA_OAUTH_VERIFIER_COOKIE = "__Host-STAGEPILOT_CANVA_PKCE";
export const CANVA_OAUTH_TTL_MS = 10 * 60 * 1000;

export function getCanvaSecret(env: Record<string, unknown> | null | undefined, name: string): string {
  const value = env?.[name] ?? process.env[name];
  return typeof value === "string" ? value : "";
}

export function getCanvaRedirectUri(request: Request, env?: Record<string, unknown> | null): string {
  const configured = getCanvaSecret(env, "CANVA_REDIRECT_URI");
  if (configured) return configured;
  return new URL("/api/integrations/canva/callback", request.url).toString();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function generateCodeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function createCanvaOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function hashCanvaOAuthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildCanvaAuthorizationUrl(
  request: Request,
  env: Record<string, unknown>,
  state: string,
  codeChallenge: string
): string {
  const clientId = getCanvaSecret(env, "CANVA_CLIENT_ID");
  if (!clientId) {
    throw new Error("CANVA_CLIENT_ID belum dikonfigurasi.");
  }

  const url = new URL(CANVA_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getCanvaRedirectUri(request, env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CANVA_OAUTH_SCOPES.join(" "));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeCanvaCodeForTokens(
  request: Request,
  env: Record<string, unknown>,
  code: string,
  codeVerifier: string
): Promise<CanvaTokenResponse> {
  const clientId = getCanvaSecret(env, "CANVA_CLIENT_ID");
  const clientSecret = getCanvaSecret(env, "CANVA_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("CANVA_CLIENT_ID dan CANVA_CLIENT_SECRET harus dikonfigurasi pada server.");
  }

  // Canva Connect uses Basic Authentication for token endpoint
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const redirectUri = getCanvaRedirectUri(request, env);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = (await response.json().catch(() => ({}))) as CanvaTokenResponse & { error?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    const errorMsg = data.error_description || data.error || `HTTP ${response.status} failed to exchange code`;
    throw new Error(`Gagal menukar authorization code Canva: ${errorMsg}`);
  }

  return data;
}

export async function refreshCanvaAccessToken(
  env: Record<string, unknown>,
  refreshToken: string
): Promise<CanvaTokenResponse> {
  const clientId = getCanvaSecret(env, "CANVA_CLIENT_ID");
  const clientSecret = getCanvaSecret(env, "CANVA_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("CANVA_CLIENT_ID dan CANVA_CLIENT_SECRET belum dikonfigurasi.");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = (await response.json().catch(() => ({}))) as CanvaTokenResponse & { error?: string; error_description?: string };

  if (!response.ok || !data.access_token) {
    const errorMsg = data.error_description || data.error || `HTTP ${response.status} failed to refresh token`;
    throw new Error(`Gagal memperbarui access token Canva: ${errorMsg}`);
  }

  return data;
}

export async function getValidCanvaAccessToken(
  userId: string,
  env?: Record<string, unknown> | null
): Promise<string | null> {
  const store = new IntegrationCredentialStore(env);
  const cred = await store.getCredential(userId, "canva");

  if (!cred) {
    return null;
  }

  const now = Date.now();
  // Buffer of 60 seconds before expiration
  if (cred.expiresAt > now + 60 * 1000) {
    return cred.accessToken;
  }

  // Token is expired, try to refresh using refreshToken
  if (cred.refreshToken && env) {
    try {
      const refreshed = await refreshCanvaAccessToken(env, cred.refreshToken);
      const newExpiresAt = now + (refreshed.expires_in || 3600) * 1000;

      await store.saveCredential({
        userId,
        provider: "canva",
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || cred.refreshToken,
        tokenType: refreshed.token_type || "Bearer",
        expiresAt: newExpiresAt,
        scopes: cred.scopes,
        accountEmail: cred.accountEmail,
        accountName: cred.accountName,
      });

      return refreshed.access_token;
    } catch (err) {
      console.warn("[CanvaOAuth] Refresh token failed:", err);
      return null;
    }
  }

  return null;
}
