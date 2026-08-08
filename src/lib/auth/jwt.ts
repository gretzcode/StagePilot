import { SignJWT, jwtVerify, JWTPayload } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "stagepilot-production-secret-key-32chars";

async function getCryptoKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export interface HostJWTPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: "host";
}

export async function createHostToken(
  hostUserId: string,
  email: string,
  name: string
): Promise<string> {
  const key = await getCryptoKey();
  return new SignJWT({
    sub: hostUserId,
    email,
    name,
    role: "host",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

export async function verifyHostToken(token: string): Promise<HostJWTPayload | null> {
  try {
    const key = await getCryptoKey();
    const { payload } = await jwtVerify(token, key);
    return payload as HostJWTPayload;
  } catch {
    return null;
  }
}
