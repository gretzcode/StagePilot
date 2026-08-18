/**
 * Zero-Trust Scoped Asset Capability Token (AssetGrant)
 * Eliminates Durable Object IPC round-trips on HTTP Range requests
 * by providing locally-verifiable HMAC-SHA256 capability tokens.
 */

export interface AssetCapability {
  v: 1;
  roomCode: string;
  materialId: string;
  issuedAt: number;
  expiresAt: number;
}

const DEFAULT_GRANT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (2,592,000 seconds)
const FALLBACK_SECRET = "stagepilot-asset-grant-secret-key-32chars";

function getGrantSecret(env?: Record<string, unknown> | null): string {
  const secret =
    (typeof env?.JWT_SECRET === "string" && env.JWT_SECRET) ||
    (typeof env?.ASSET_SECRET === "string" && env.ASSET_SECRET) ||
    (typeof process !== "undefined" && (process.env.JWT_SECRET || process.env.ASSET_SECRET)) ||
    FALLBACK_SECRET;
  return secret;
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

/**
 * Creates a cryptographically signed, short-lived Asset Capability Grant Token.
 */
export async function createAssetGrant(
  roomCode: string,
  materialId: string,
  env?: Record<string, unknown> | null,
  ttlMs = DEFAULT_GRANT_TTL_MS
): Promise<string> {
  const now = Date.now();
  const normalizedRoom = roomCode.trim().toUpperCase();
  const issuedAt = now;
  const expiresAt = now + ttlMs;

  const payload = `1.${normalizedRoom}.${materialId}.${issuedAt}.${expiresAt}`;
  const secret = getGrantSecret(env);
  const key = await getHmacKey(secret);

  const enc = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const signatureHex = bufferToHex(signatureBuffer);

  return `${payload}.${signatureHex}`;
}

export interface VerifyGrantResult {
  valid: boolean;
  reason?: string;
  capability?: AssetCapability;
}

/**
 * Locally verifies an Asset Capability Grant Token with 0 network calls and 0 DO round-trips.
 */
export async function verifyAssetGrant(
  grant: string,
  expectedRoomCode: string,
  expectedMaterialId: string,
  env?: Record<string, unknown> | null
): Promise<VerifyGrantResult> {
  if (!grant || typeof grant !== "string") {
    return { valid: false, reason: "MISSING_GRANT" };
  }

  const parts = grant.split(".");
  if (parts.length !== 6) {
    return { valid: false, reason: "INVALID_GRANT_FORMAT" };
  }

  const [versionStr, grantRoomCode, grantMaterialId, issuedAtStr, expiresAtStr, signatureHex] = parts;

  if (versionStr !== "1") {
    return { valid: false, reason: "UNSUPPORTED_VERSION" };
  }

  const normalizedExpectedRoom = expectedRoomCode.trim().toUpperCase();
  if (grantRoomCode.toUpperCase() !== normalizedExpectedRoom) {
    return { valid: false, reason: "ROOM_MISMATCH" };
  }

  if (grantMaterialId !== expectedMaterialId) {
    return { valid: false, reason: "MATERIAL_MISMATCH" };
  }

  const now = Date.now();
  const expiresAt = parseInt(expiresAtStr, 10);
  const issuedAt = parseInt(issuedAtStr, 10);

  if (isNaN(expiresAt) || isNaN(issuedAt) || expiresAt < now) {
    return { valid: false, reason: "GRANT_EXPIRED" };
  }

  const payload = `${versionStr}.${grantRoomCode}.${grantMaterialId}.${issuedAtStr}.${expiresAtStr}`;
  const secret = getGrantSecret(env);
  const key = await getHmacKey(secret);

  const enc = new TextEncoder();
  const signatureBuffer = hexToBuffer(signatureHex);

  const isValidSig = await crypto.subtle.verify("HMAC", key, signatureBuffer, enc.encode(payload));
  if (!isValidSig) {
    return { valid: false, reason: "INVALID_SIGNATURE" };
  }

  return {
    valid: true,
    capability: {
      v: 1,
      roomCode: grantRoomCode,
      materialId: grantMaterialId,
      issuedAt,
      expiresAt,
    },
  };
}
