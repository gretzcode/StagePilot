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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const normalizedEmail = email.toLowerCase().trim();
    let hostUserId = `host-${Buffer.from(normalizedEmail).toString("base64").replace(/=/g, "").slice(0, 10)}`;
    let authenticated = false;
    let name = normalizedEmail.split("@")[0] || "Stage Host";

    // 1. Query D1 database first if available
    try {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const db = (cfCtx?.env as Record<string, unknown>)?.DB as D1Database | undefined;

      if (db) {
        const stmt = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1");
        const dbUser = await stmt.bind(normalizedEmail).first<Record<string, unknown>>();

        if (dbUser && typeof dbUser.password_hash === "string") {
          const isValid = await verifyPassword(password, dbUser.password_hash);
          if (isValid) {
            authenticated = true;
            hostUserId = String(dbUser.id);
          }
        }
      }
    } catch (dbErr) {
      console.error("[Login D1 Lookup Error]", dbErr);
    }

    // 2. Fallback check for default host credentials (host@kian.co or host@stagepilot.live with password1234 or password123)
    if (!authenticated) {
      if (normalizedEmail === "host@kian.co" || normalizedEmail === "host@stagepilot.live") {
        const isPassword1234 = password === "password1234";
        const isPassword123 = password === "password123";
        if (isPassword1234 || isPassword123) {
          authenticated = true;

          // Upsert into D1 users table so user is saved in DB
          try {
            const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
            const db = (cfCtx?.env as Record<string, unknown>)?.DB as D1Database | undefined;
            if (db) {
              const newHash = await hashPassword(password);
              const now = Date.now();
              await db
                .prepare(
                  "INSERT INTO users (id, email, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?) ON CONFLICT(id) DO UPDATE SET password_hash=?, updated_at=?"
                )
                .bind(hostUserId, normalizedEmail, newHash, now, now, newHash, now)
                .run();
            }
          } catch {
            // Ignore if D1 missing
          }
        }
      }
    }

    if (!authenticated) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
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
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
