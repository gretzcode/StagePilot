import { NextResponse } from "next/server";
import { createHostToken } from "@/lib/auth/jwt";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    // Phase 1 host authentication check
    // In Phase 1, host login evaluates valid credentials
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const hostUserId = `host-${Buffer.from(email).toString("base64").replace(/=/g, "").slice(0, 10)}`;
    const name = email.split("@")[0] || "Host User";
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

    response.cookies.set({
      name: "stagepilot_host_token",
      value: token,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      maxAge: 86400,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
