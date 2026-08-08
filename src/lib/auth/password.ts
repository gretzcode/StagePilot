/**
  * Edge-compatible Web Crypto API Password Hashing for Cloudflare Workers
  * Uses PBKDF2 with SHA-256 (100,000 iterations)
  */

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const derivedKey = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const keyHex = Array.from(new Uint8Array(derivedKey)).map((b) => b.toString(16).padStart(2, "0")).join("");

  return `${saltHex}:${keyHex}`;
}

export async function verifyPassword(password: string, combinedHash: string): Promise<boolean> {
  try {
    const [saltHex, originalKeyHex] = combinedHash.split(":");
    if (!saltHex || !originalKeyHex) return false;

    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );

    const derivedKeyHex = Array.from(new Uint8Array(derivedKey)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return derivedKeyHex === originalKeyHex;
  } catch {
    return false;
  }
}
