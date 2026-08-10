const { execSync } = require("child_process");

async function seed() {
  const email = "host@kian.co";
  const password = "password1234";
  const hostUserId = `host-${Buffer.from(email).toString("base64").replace(/=/g, "").slice(0, 10)}`;

  // Edge-compatible Web Crypto hashing
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
  const hash = `${saltHex}:${keyHex}`;

  const now = Date.now();
  const sql = `INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES ('${hostUserId}', '${email}', '${hash}', 'ACTIVE', ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET email='${email}', password_hash='${hash}', updated_at=${now};`;

  console.log("Seeding user:", email, "with ID:", hostUserId);
  console.log("SQL:", sql);

  try {
    const output = execSync(`node node_modules/wrangler/bin/wrangler.js d1 execute stagepilot-db --remote --command "${sql}"`, { encoding: "utf-8" });
    console.log("Wrangler D1 output:\n", output);
  } catch (err) {
    console.error("Failed to seed remote D1:", err.message);
    if (err.stdout) console.log("stdout:", err.stdout);
    if (err.stderr) console.log("stderr:", err.stderr);
  }
}

seed();
