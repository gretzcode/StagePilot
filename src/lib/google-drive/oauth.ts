const OAUTH_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_STATE_COOKIE = "stagepilot_google_oauth_state";

export function getGoogleSecret(env: Record<string, unknown> | null | undefined, name: string): string {
  const value = env?.[name] ?? process.env[name];
  return typeof value === "string" ? value : "";
}

export function getGoogleRedirectUri(request: Request): string {
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (configured) return configured;
  return new URL("/api/google-drive/callback", request.url).toString();
}

export async function createGoogleOAuthState(env: Record<string, unknown> | null | undefined): Promise<string> {
  const payload = {
    nonce: crypto.randomUUID(),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = await signState(encodedPayload, getSigningSecret(env));
  return `${encodedPayload}.${signature}`;
}

export async function verifyGoogleOAuthState(state: string, cookieState: string, env: Record<string, unknown> | null | undefined): Promise<boolean> {
  if (!state || !cookieState || state !== cookieState) return false;
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature) return false;
  const expected = await signState(encodedPayload, getSigningSecret(env));
  if (signature !== expected) return false;
  const payload = JSON.parse(atob(encodedPayload)) as { exp?: number };
  return typeof payload.exp === "number" && payload.exp > Date.now();
}

export function buildGoogleAuthorizationUrl(request: Request, env: Record<string, unknown>, state: string): string {
  const clientId = getGoogleSecret(env, "GOOGLE_CLIENT_ID");
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID belum dikonfigurasi.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGoogleRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCodeForRefreshToken(request: Request, env: Record<string, unknown>, code: string): Promise<string> {
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
      redirect_uri: getGoogleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json().catch(() => ({}))) as { refresh_token?: string };
  if (!response.ok || !json.refresh_token) {
    throw new Error("Google Drive gagal memberi refresh token. Coba reconnect dengan prompt consent.");
  }
  return json.refresh_token;
}

function getSigningSecret(env: Record<string, unknown> | null | undefined): string {
  return getGoogleSecret(env, "GOOGLE_OAUTH_STATE_SECRET") || getGoogleSecret(env, "GOOGLE_CLIENT_SECRET") || "stagepilot-local-oauth-state";
}

async function signState(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
