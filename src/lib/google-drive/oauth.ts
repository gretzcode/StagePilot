const OAUTH_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_TRANSACTION_COOKIE = "__Host-STAGEPILOT_GOOGLE_OAUTH_TX";
export const GOOGLE_OAUTH_TTL_MS = 10 * 60 * 1000;

export function getGoogleSecret(env: Record<string, unknown> | null | undefined, name: string): string {
  const value = env?.[name] ?? process.env[name];
  return typeof value === "string" ? value : "";
}

export function getGoogleRedirectUri(request: Request, env?: Record<string, unknown> | null): string {
  const configured = getGoogleSecret(env, "GOOGLE_REDIRECT_URI");
  if (configured) return configured;
  return new URL("/api/google-drive/callback", request.url).toString();
}

export function createGoogleOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function hashGoogleOAuthState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
  return base64UrlEncode(new Uint8Array(digest));
}

export function buildGoogleAuthorizationUrl(request: Request, env: Record<string, unknown>, state: string): string {
  const clientId = getGoogleSecret(env, "GOOGLE_CLIENT_ID");
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID belum dikonfigurasi.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleRedirectUri(request, env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export async function exchangeGoogleCodeForTokens(
  request: Request,
  env: Record<string, unknown>,
  code: string
): Promise<GoogleOAuthTokens> {
  const clientId = getGoogleSecret(env, "GOOGLE_CLIENT_ID");
  const clientSecret = getGoogleSecret(env, "GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Google OAuth client belum lengkap.");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(request, env),
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google Drive gagal memberi token otorisasi.");
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || null,
    expires_in: json.expires_in || 3600,
    token_type: json.token_type || "Bearer",
    scope: json.scope,
  };
}

export async function exchangeGoogleCodeForRefreshToken(request: Request, env: Record<string, unknown>, code: string): Promise<string> {
  const tokens = await exchangeGoogleCodeForTokens(request, env, code);
  if (!tokens.refresh_token) {
    throw new Error("Google Drive tidak mengembalikan refresh token. Hubungkan ulang dengan prompt consent.");
  }
  return tokens.refresh_token;
}

export function buildOAuthTransactionCookie(_request: Request, transactionId: string, maxAgeSeconds: number): string {
  return `${GOOGLE_OAUTH_TRANSACTION_COOKIE}=${transactionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function readCookie(request: Request, name: string): string {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
