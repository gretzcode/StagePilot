import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createHostSession, HostSessionUser } from "@/lib/auth/session";

describe("Phase 3 Host Password Hashing & Production Session Tests", () => {
  it("Hashes passwords using Web Crypto PBKDF2-SHA256 and verifies successfully", async () => {
    const rawPassword = "SuperSecurePassword2026!";
    const hash = await hashPassword(rawPassword);

    expect(hash).toContain(":");
    expect(await verifyPassword(rawPassword, hash)).toBe(true);
    expect(await verifyPassword("WrongPassword123", hash)).toBe(false);
  });

  it("Issues HTTP-only secure cookie and token for host session", async () => {
    const user: HostSessionUser = {
      id: "host-user-999",
      email: "vj@stagepilot.live",
      name: "Lead VJ Operator",
      role: "host",
    };

    const { token, cookieHeader } = await createHostSession(user);

    expect(token).toBeDefined();
    expect(cookieHeader).toContain("stagepilot_session_id=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Lax");
  });

  it("Login route issues OAuth-compatible Lax session cookies", () => {
    const loginRoute = readFileSync(join(process.cwd(), "src/app/api/auth/login/route.ts"), "utf8");
    expect(loginRoute).toContain('sameSite: "lax"');
    expect(loginRoute).not.toContain('sameSite: "strict"');
  });
});
