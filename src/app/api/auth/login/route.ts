import { NextResponse } from "next/server";
import { createHostToken } from "@/lib/auth/jwt";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

// Pre-computed PBKDF2 hash for host@stagepilot.live / password123
let cachedDefaultHash: string | null = null;

async function getDefaultHash(): Promise<string> {
  if (!cachedDefaultHash) {
    cachedDefaultHash = await hashPassword("password123");
  }
  return cachedDefaultHash;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const defaultHash = await getDefaultHash();
    const isValidDefaultHost =
      email.toLowerCase() === "host@kian.co" &&
      (await verifyPassword(password, defaultHash));

    if (!isValidDefaultHost) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const hostUserId = `host-${Buffer.from(email).toString("base64").replace(/=/g, "").slice(0, 10)}`;
    const name = email.split("@")[0] || "Stage Host";

    // Ensure Host user is registered in D1 users table upon successful login
    try {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const db = (cfCtx?.env as Record<string, unknown>)?.DB as D1Database | undefined;
      if (db) {
        const now = Date.now();
        await db
          .prepare(
            "INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?) ON CONFLICT(id) DO NOTHING"
          )
          .bind(hostUserId, email, defaultHash, now, now)
          .run()
          .catch((err) => console.error("[Login D1 User Upsert Warning]", err));
      }
    } catch {
      // Ignore if running without D1 binding
    }

    const token = await createHostToken(hostUserId, email, name);

    const response = NextResponse.json({
      success: true,
      user: {
        id: hostUserId,
        email,
        name,
        role: "host",
      },
      token,
    });

    // Set canonical session cookie
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

