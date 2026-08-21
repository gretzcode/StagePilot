/**
 * Zero-Trust Scoped Display Grant Token
 *
 * Allows Audience and Confidence displays opened directly from Host or Control Room
 * to be instantly pre-approved without requiring manual Host authorization.
 * Prevents unauthorized or bare URLs from opening the stage display.
 */

export interface DisplayGrantPayload {
  v: 1;
  roomCode: string;
  displayMode: "audience" | "confidence" | "all";
  issuedAt: number;
  expiresAt: number;
}

const DEFAULT_DISPLAY_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FALLBACK_SECRET = "stagepilot-display-grant-secret-key-32chars";

function getSecret(env?: Record<string, unknown> | null): string {
  return (
    (typeof env?.JWT_SECRET === "string" && env.JWT_SECRET) ||
    (typeof env?.ASSET_SECRET === "string" && env.ASSET_SECRET) ||
    (typeof process !== "undefined" && (process.env.JWT_SECRET || process.env.ASSET_SECRET)) ||
    FALLBACK_SECRET
  );
}

const hmacKeyCache = new Map<string, CryptoKey>();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret);
  if (cached) return cached;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  hmacKeyCache.set(secret, key);
  return key;
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBuffer(hex: string): ArrayBuffer {
  const typedArray = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    typedArray[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return typedArray.buffer;
}

export async function createDisplayGrant(
  roomCode: string,
  displayMode: "audience" | "confidence" | "all" = "all",
  env?: Record<string, unknown> | null,
  ttlMs = DEFAULT_DISPLAY_GRANT_TTL_MS
): Promise<string> {
  const payload: DisplayGrantPayload = {
    v: 1,
    roomCode: roomCode.trim().toUpperCase(),
    displayMode,
    issuedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(payloadJson).toString("base64url")
      : btoa(payloadJson).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const secret = getSecret(env);
  const key = await getHmacKey(secret);
  const enc = new TextEncoder();
  const signatureBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigHex = bufferToHex(signatureBuf);

  return `${payloadB64}.${sigHex}`;
}

export async function verifyDisplayGrant(
  roomCode: string,
  displayMode: string,
  grantToken: string | null | undefined,
  env?: Record<string, unknown> | null
): Promise<boolean> {
  if (!grantToken || typeof grantToken !== "string") return false;

  const parts = grantToken.split(".");
  if (parts.length !== 2) return false;

  const [payloadB64, sigHex] = parts;
  if (!payloadB64 || !sigHex) return false;

  try {
    const secret = getSecret(env);
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    const sigBuffer = hexToBuffer(sigHex);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuffer,
      enc.encode(payloadB64)
    );

    if (!isValid) return false;

    const payloadJson =
      typeof Buffer !== "undefined"
        ? Buffer.from(payloadB64, "base64url").toString("utf-8")
        : atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));

    const payload = JSON.parse(payloadJson) as DisplayGrantPayload;

    if (payload.v !== 1) return false;
    if (payload.roomCode !== roomCode.trim().toUpperCase()) return false;
    if (payload.expiresAt < Date.now()) return false;
    if (payload.displayMode !== "all" && payload.displayMode !== displayMode) return false;

    return true;
  } catch {
    return false;
  }
}
